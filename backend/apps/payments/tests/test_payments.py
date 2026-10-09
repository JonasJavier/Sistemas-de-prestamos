"""F5, F10 and F12 against the ledger: E10, E11, E12 and E14 to the cent.

Phase 4 acceptance (doc 10): every operation leaves the books balanced and
the portfolio of each loan equal to its principal outstanding.
"""

import datetime as dt
import uuid
from decimal import Decimal

import pytest
from django.db.models import Sum
from django.utils import timezone

from apps.cash import services as cash
from apps.conftest import cash_total, open_cash
from apps.core.models import ApprovalRequest, Reason
from apps.core.tenancy import company_context
from apps.ledger import services as ledger
from apps.ledger.models import JournalLine, LedgerAccount
from apps.lending.models import Installment, LateFeePolicy, Loan, LoanProduct
from apps.lending.tests.test_disbursement import _approved, _disburse
from apps.payments import reversals
from apps.payments.models import Payment, PaymentReversal
from apps.payments.services import PaymentError, post_payment

D = Decimal
SAN = "Personal San (semanal)"
FIJA = "Cuota Fija (mensual)"


def make_loan(
    tenant,
    *,
    first_due_in: int,
    product=SAN,
    amount="1000",
    installments=4,
    rate="0.10",
    approver="supervisor",
):
    """E1 by default (flat 1,000 at 10 % in 4 weekly installments of 350.00),
    with due dates every 7 days from ``today + first_due_in`` (negative: overdue).
    The dates are set explicitly so weekends and holidays never move them."""
    app_id = _approved(
        tenant,
        product=product,
        amount=amount,
        installments=installments,
        rate=rate,
        approver=approver,
    )
    response = _disburse(tenant, app_id)
    assert response.status_code == 201, response.content
    today = timezone.localdate()
    with company_context(tenant.company.id):
        loan = Loan.objects.get(number=response.json()["loan"])
        step = 7 if product == SAN else 30
        first = today + dt.timedelta(days=first_due_in)
        for inst in loan.installments.order_by("number"):
            due = first + dt.timedelta(days=step * (inst.number - 1))
            Installment.objects.filter(pk=inst.pk).update(due_date=due, original_due_date=due)
        Loan.objects.filter(pk=loan.pk).update(
            disbursed_on=first - dt.timedelta(days=step), next_due_date=first
        )
        loan.refresh_from_db()
    return loan


def pay(tenant, loan, amount, *, role="cajero", **kwargs) -> Payment:
    kwargs.setdefault("method", "cash")
    kwargs.setdefault("idempotency_key", uuid.uuid4().hex)
    with company_context(tenant.company.id):
        return post_payment(
            loan=Loan.objects.get(pk=loan.pk), user=tenant.users[role], amount=D(amount), **kwargs
        )


def books_square(tenant) -> None:
    """Balanced books, caches equal to lines, and each loan's portfolio
    lines equal to its principal outstanding (the nightly reconciliation)."""
    with company_context(tenant.company.id):
        for account in LedgerAccount.objects.all():
            assert ledger.balance_of(account) == ledger.recomputed_balance(account), account
        portfolio = ledger.system_account(tenant.company.id, "loan_portfolio")
        for loan in Loan.objects.all():
            totals = JournalLine.objects.filter(account=portfolio, loan=loan).aggregate(
                d=Sum("debit"), c=Sum("credit")
            )
            # A written-off loan left the books (decision 094): its debt is a memo.
            expected = 0 if loan.status == Loan.Status.WRITTEN_OFF else loan.principal_outstanding
            assert (totals["d"] or 0) - (totals["c"] or 0) == expected, loan


def _rows(tenant, loan):
    with company_context(tenant.company.id):
        return [
            (inst.number, inst.status, inst.principal_paid, inst.interest_paid, inst.late_fee_paid)
            for inst in Installment.objects.filter(loan=loan)
            .exclude(status=Installment.Status.SUPERSEDED)
            .order_by("number")
        ]


# --- E10, E11 ----------------------------------------------------------------------------


def test_e10_two_overdue_installments_and_an_advance(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-11)  # installment 1: 11 days late; 2: 4 days
    before = cash_total(tenant)
    payment = pay(tenant, loan, "800.00")
    with company_context(tenant.company.id):
        breakdown = {
            (a.installment.number, a.component): a.amount
            for a in payment.allocations.select_related("installment")
        }
        assert breakdown == {
            (1, "late_fee"): D("6.42"),
            (1, "interest"): D("100.00"),
            (1, "principal"): D("250.00"),
            (2, "late_fee"): D("2.33"),
            (2, "interest"): D("100.00"),
            (2, "principal"): D("250.00"),
            (3, "interest"): D("91.25"),
        }
        entry = {
            (line.account.system_key or "caja"): (line.debit, line.credit)
            for line in payment.journal_entry.lines.select_related("account")
        }
        assert entry == {
            "caja": (D("800.00"), D("0.00")),
            "loan_portfolio": (D("0.00"), D("500.00")),
            "interest_income": (D("0.00"), D("291.25")),
            "late_fee_income": (D("0.00"), D("8.75")),
        }
        assert payment.number == "01-R-000001"
        assert payment.cash_session == cash.open_session_of(tenant.users["cajero"])
        loan.refresh_from_db()
        assert loan.principal_outstanding == D("500.00")
        assert loan.interest_outstanding == D("108.75")
        assert loan.days_past_due == 0
    assert [row[:2] for row in _rows(tenant, loan)] == [
        (1, "paid"),
        (2, "paid"),
        (3, "partial"),
        (4, "pending"),
    ]
    assert cash_total(tenant) == before + D("800.00")
    books_square(tenant)


def test_e11_cash_with_change(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    before = cash_total(tenant)
    payment = pay(tenant, loan, "350.00", received=D("400.00"))
    assert (payment.received, payment.change, payment.amount) == (D("400"), D("50"), D("350"))
    assert cash_total(tenant) == before + D("350.00")  # the 50 went back to the customer
    with pytest.raises(PaymentError, match="no alcanza"):
        pay(tenant, loan, "350.00", received=D("300.00"))
    books_square(tenant)


def test_a_double_click_never_charges_twice(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    key = uuid.uuid4().hex
    first = pay(tenant, loan, "350.00", idempotency_key=key)
    second = pay(tenant, loan, "350.00", idempotency_key=key)
    assert first.pk == second.pk
    with company_context(tenant.company.id):
        assert Payment.objects.count() == 1


def test_more_than_the_debt_is_refused(tenant) -> None:
    loan = make_loan(tenant, first_due_in=3)
    with pytest.raises(PaymentError, match="supera lo que se debe"):
        pay(tenant, loan, "1400.01")
    books_square(tenant)


def test_cash_needs_an_open_drawer_and_transfers_a_reference(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    with pytest.raises(PaymentError, match="Abre tu caja"):
        pay(tenant, loan, "100", role="supervisor")
    with pytest.raises(PaymentError, match="referencia"):
        pay(tenant, loan, "100", method="transfer")


def test_e9_proportional_order(tenant) -> None:
    with company_context(tenant.company.id):
        LoanProduct.objects.filter(name=SAN).update(allocation_order="proportional")
    loan = make_loan(tenant, first_due_in=0)
    payment = pay(tenant, loan, "100.00")
    with company_context(tenant.company.id):
        parts = {a.component: a.amount for a in payment.allocations.all()}
    assert parts == {"interest": D("28.57"), "principal": D("71.43")}


# --- Waivers and authorizations -------------------------------------------------------------


def test_waivers_within_the_limit_and_above_it(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-60)  # installment 1 reaches the 35.00 cap
    with pytest.raises(PaymentError, match="motivo"):
        pay(tenant, loan, "100", waive=D("10"))
    payment = pay(tenant, loan, "350.00", waive=D("35.00"), waive_note="Cliente de años")
    assert payment.late_fee_waived == D("35.00")
    with company_context(tenant.company.id):
        first = Installment.objects.get(loan=loan, number=1)
        assert (first.late_fee_waived, first.late_fee_paid, first.status) == (
            D("35.00"),
            D("0.00"),
            "paid",
        )
    books_square(tenant)


def test_a_waiver_above_the_limit_needs_someone_else(tenant) -> None:
    """The cashier's limit is RD$ 500 (doc 06 - 5): above it, someone else decides."""
    with company_context(tenant.company.id):
        LateFeePolicy.objects.filter(product__name=SAN).update(cap_pct=D("1"))
    loan = make_loan(tenant, first_due_in=-100, amount="90000", approver="gerente")
    with pytest.raises(PaymentError, match="pide autorización") as exc:
        pay(tenant, loan, "1000", waive=D("600"), waive_note="Acuerdo")
    assert exc.value.code == "needs_approval"
    with company_context(tenant.company.id):
        loan = Loan.objects.get(pk=loan.pk)
        request = reversals.request_authorization(
            loan=loan,
            user=tenant.users["cajero"],
            kind=ApprovalRequest.Kind.WAIVE_LATE_FEE,
            amount=D("600"),
            note="Acuerdo con el cliente",
        )
        with pytest.raises(PaymentError, match="Nadie autoriza"):
            reversals.decide(request=request, user=tenant.users["cajero"], approve=True)
        reversals.decide(request=request, user=tenant.users["supervisor"], approve=True)
        approval = ApprovalRequest.objects.get(pk=request.pk)
    payment = pay(
        tenant, loan, "1000", waive=D("600"), waive_note="Acuerdo", waiver_approval=approval
    )
    with company_context(tenant.company.id):
        request.refresh_from_db()
        assert request.status == ApprovalRequest.Status.USED
        waiver = payment.waivers.get()
        assert waiver.authorized_by == tenant.users["supervisor"]
    books_square(tenant)


def test_the_collector_never_waives(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-30)
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=loan.pk).update(collector=tenant.users["cobrador"])
        user = tenant.users["cobrador"]
        user.location_consent_at = timezone.now()
        user.save()
        cash.open_route(user=user, branch=tenant.branch)
    with pytest.raises(PaymentError, match="cobrador no puede"):
        pay(tenant, loan, "100", role="cobrador", waive=D("1"), waive_note="x")


# --- E14 and reversals -----------------------------------------------------------------------


def _reason(tenant, kind=Reason.Kind.REVERSAL) -> Reason:
    with company_context(tenant.company.id):
        return Reason.objects.filter(kind=kind).first()


def test_e14_correct_a_payment_of_350_to_300(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    before = cash_total(tenant)
    wrong = pay(tenant, loan, "350.00")
    with company_context(tenant.company.id):
        effect = reversals.preview(wrong, user=tenant.users["cajero"], correct_amount=D("300"))
        assert effect.principal_after == D("800.00")  # 1,000 - 200
        assert Payment.objects.filter(status=Payment.Status.REVERSED).count() == 0  # rolled back
        request = reversals.request_reversal(
            payment=wrong,
            user=tenant.users["cajero"],
            reason=_reason(tenant),
            note="Se digitó 350 y eran 300",
            correct_amount=D("300.00"),
        )
        reversals.decide(request=request, user=tenant.users["supervisor"], approve=True)
        wrong.refresh_from_db()
        assert wrong.status == Payment.Status.REVERSED
        reversal = PaymentReversal.objects.get(payment=wrong)
        assert reversal.journal_entry.reversal_of == wrong.journal_entry
        right = reversal.replacement
        assert right.amount == D("300.00")
        assert {a.component: a.amount for a in right.allocations.all()} == {
            "interest": D("100.00"),
            "principal": D("200.00"),
        }
        first = Installment.objects.get(loan=loan, number=1)
        assert first.principal_due - first.principal_paid == D("50.00")
    assert cash_total(tenant) == before + D("300.00")  # E14: the cash nets +300.00
    books_square(tenant)


def test_only_the_last_payment_is_reversed_and_never_by_its_requester(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    first = pay(tenant, loan, "100.00")
    pay(tenant, loan, "100.00")
    with company_context(tenant.company.id), pytest.raises(PaymentError, match="último"):
        reversals.request_reversal(
            payment=first, user=tenant.users["cajero"], reason=_reason(tenant), note="x"
        )
    with company_context(tenant.company.id):
        last = Payment.objects.order_by("-paid_at").first()
        request = reversals.request_reversal(
            payment=last, user=tenant.users["supervisor"], reason=_reason(tenant), note="duplicado"
        )
        with pytest.raises(PaymentError):
            reversals.decide(request=request, user=tenant.users["supervisor"], approve=True)
        with pytest.raises(PaymentError, match="no puedes autorizar|No puedes autorizar"):
            reversals.decide(request=request, user=tenant.users["cajero"], approve=True)
        reversals.decide(request=request, user=tenant.users["gerente"], approve=True)
    assert [row[:2] for row in _rows(tenant, loan)][0] == (1, "partial")
    books_square(tenant)


def test_a_reversal_after_the_cash_closed_goes_through_todays_drawer(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    payment = pay(tenant, loan, "350.00")
    with company_context(tenant.company.id):
        session = cash.open_session_of(tenant.users["cajero"])
        expected = cash.expected_cash(session)
        cash.close_session(
            session=session,
            user=tenant.users["cajero"],
            counts={"1000": int(expected // 1000), "1": int(expected % 1000)},
        )
    with company_context(tenant.company.id), pytest.raises(PaymentError, match="caja abierta"):
        request = reversals.request_reversal(
            payment=payment, user=tenant.users["cajero"], reason=_reason(tenant), note="error"
        )
        reversals.decide(request=request, user=tenant.users["supervisor"], approve=True)
    open_cash(tenant, "cajero", amount="1000")
    with company_context(tenant.company.id):
        request = ApprovalRequest.objects.get(status=ApprovalRequest.Status.PENDING)
        reversals.decide(request=request, user=tenant.users["supervisor"], approve=True)
        today_session = cash.open_session_of(tenant.users["cajero"])
        assert PaymentReversal.objects.get().cash_session == today_session
        # What stayed in the drawer + the new 1,000 fund - the 350 given back.
        assert cash.expected_cash(today_session) == D("100000.00")
    books_square(tenant)


# --- E12-E13: payoff -------------------------------------------------------------------------


def test_e12_payoff_forgives_future_interest_and_closes_the_loan(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-3)
    pay(tenant, loan, "350.00")  # installment 1, within the grace: no late fee
    with pytest.raises(PaymentError, match="exactamente RD\\$ 850.00"):
        pay(tenant, loan, "800.00", kind=Payment.Kind.PAYOFF)
    payoff = pay(tenant, loan, "850.00", kind=Payment.Kind.PAYOFF)
    assert payoff.interest_waived == D("200.00")
    with company_context(tenant.company.id):
        loan.refresh_from_db()
        assert loan.status == Loan.Status.PAID_OFF
        assert loan.principal_outstanding == D("0.00")
        assert loan.closed_on == timezone.localdate()
    books_square(tenant)
    # Reversing the payoff reopens the loan with its schedule as it was.
    with company_context(tenant.company.id):
        request = reversals.request_reversal(
            payment=payoff, user=tenant.users["cajero"], reason=_reason(tenant), note="error"
        )
        reversals.decide(request=request, user=tenant.users["gerente"], approve=True)
        loan.refresh_from_db()
        assert loan.status == Loan.Status.ACTIVE
        assert loan.interest_outstanding == D("300.00")
        assert not Installment.objects.filter(loan=loan, interest_waived__gt=0).exists()
    books_square(tenant)


# --- Principal prepayment ------------------------------------------------------------------


def test_prepayment_reschedules_and_its_reversal_restores_the_schedule(tenant) -> None:
    loan = make_loan(
        tenant, first_due_in=5, product=FIJA, amount="20000", installments=6, rate="0.05"
    )
    before = _rows(tenant, loan)
    with company_context(tenant.company.id):
        original = list(
            Installment.objects.filter(loan=loan)
            .order_by("number")
            .values_list("due_date", "principal_due", "interest_due")
        )
    payment = pay(tenant, loan, "5000.00", kind=Payment.Kind.PREPAYMENT)
    with company_context(tenant.company.id):
        loan.refresh_from_db()
        assert payment.new_terms.version == 2
        assert loan.principal_outstanding == D("15000.00")
        current = Installment.objects.filter(loan=loan).exclude(status="superseded")
        assert sum(i.principal_due for i in current) == D("15000.00")
        assert current.count() < 6  # reducing the term (the default)
    books_square(tenant)
    with company_context(tenant.company.id):
        request = reversals.request_reversal(
            payment=payment, user=tenant.users["cajero"], reason=_reason(tenant), note="error"
        )
        reversals.decide(request=request, user=tenant.users["supervisor"], approve=True)
        loan.refresh_from_db()
        assert loan.terms.count() == 3
        restored = list(
            Installment.objects.filter(loan=loan)
            .exclude(status="superseded")
            .order_by("number")
            .values_list("due_date", "principal_due", "interest_due")
        )
        assert restored == original
    assert _rows(tenant, loan) == before
    books_square(tenant)


def test_flat_loans_cannot_prepay_and_overdue_comes_first(tenant) -> None:
    loan = make_loan(tenant, first_due_in=5)
    with pytest.raises(PaymentError, match="plano"):
        pay(tenant, loan, "100", kind=Payment.Kind.PREPAYMENT)
    fija = make_loan(
        tenant, first_due_in=-10, product=FIJA, amount="20000", installments=6, rate="0.05"
    )
    with pytest.raises(PaymentError, match="Primero cobra lo vencido"):
        pay(tenant, fija, "100", kind=Payment.Kind.PREPAYMENT)
