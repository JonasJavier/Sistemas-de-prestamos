"""Phase 4 acceptance (doc 10 - 1): «conciliación nocturna en cero durante
una semana de uso simulado».

Eight working days of a branch, day by day with the clock moved: the
cashier opens with a fund, collects (with change, waivers, a principal
prepayment, a payoff), a collector works his route and settles, a payment
is corrected with the supervisor's authorization, the cash closes —
some days with a difference — and is approved. Every night the job runs
and the reconciliation of caches against the books must find nothing.
"""

import datetime as dt
import itertools
import random
import uuid
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.cash import services as cash
from apps.core.models import ApprovalRequest, Reason
from apps.core.tenancy import company_context
from apps.lending.models import Loan
from apps.payments import reversals
from apps.payments.models import Payment
from apps.payments.services import PaymentError, post_payment
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import books_square

D = Decimal
REAL_LOCALDATE = timezone.localdate
START = dt.date(2026, 3, 2)  # a Monday


@pytest.fixture
def clock(monkeypatch):
    """Moves «today» and keeps instants strictly increasing within it."""
    state = {"day": START}
    ticks = itertools.count()

    def localdate(value=None, timezone_=None):
        if value is None:
            return state["day"]
        return REAL_LOCALDATE(value, timezone_)

    def now():
        base = dt.datetime.combine(state["day"], dt.time(9, 0), tzinfo=dt.UTC)
        return base + dt.timedelta(milliseconds=next(ticks))

    monkeypatch.setattr(timezone, "localdate", localdate)
    monkeypatch.setattr(timezone, "now", now)
    return state


def _loans(tenant):
    """Seven loans disbursed on day 0: weekly «San» and monthly fixed payment."""
    from apps.lending.tests.test_disbursement import _approved, _disburse

    numbers = []
    for product, amount, installments, rate in [
        ("Personal San (semanal)", "8000", 4, "0.10"),
        ("Personal San (semanal)", "5000", 8, "0.08"),
        ("Personal San (semanal)", "12000", 6, "0.10"),
        ("Cuota Fija (mensual)", "30000", 12, "0.05"),
        ("Cuota Fija (mensual)", "20000", 6, "0.04"),
        ("Personal San (semanal)", "3000", 4, "0.10"),
        ("Personal San (semanal)", "6000", 4, "0.10"),  # nobody pays it until day 12
    ]:
        app_id = _approved(
            tenant, product=product, amount=amount, installments=installments, rate=rate
        )
        response = _disburse(tenant, app_id)
        assert response.status_code == 201, response.content
        numbers.append(response.json()["loan"])
    with company_context(tenant.company.id):
        Loan.objects.filter(number__in=numbers[:3]).update(collector=tenant.users["cobrador"])
        collector = tenant.users["cobrador"]
        collector.location_consent_at = timezone.now()
        collector.save()
    return numbers


def _close_and_approve(tenant, rng: random.Random, *, short: bool) -> None:
    cashier, supervisor = tenant.users["cajero"], tenant.users["gerente"]
    session = cash.open_session_of(cashier)
    expected = cash.expected_cash(session)
    counted = expected - (D("150") if short else D("0"))
    pesos = int(counted)
    cents = counted - pesos
    counts = {"1000": pesos // 1000, "1": pesos % 1000}
    reason = Reason.objects.get(kind=Reason.Kind.CASH_DIFFERENCE)
    # Cents do not exist in cash: whatever is under a peso is a difference too.
    difference = short or cents != 0
    closed = cash.close_session(
        session=session,
        user=cashier,
        counts=counts,
        reason=reason if difference else None,
        note="Faltante revisado con la cámara" if difference else "",
        return_to=tenant.cash,
        return_amount=D(pesos) - D(rng.choice([0, 500, 1000])),
    )
    cash.approve_session(session=closed, user=supervisor)


def test_a_simulated_week_keeps_the_books_reconciled(tenant, clock) -> None:
    rng = random.Random(2026)  # noqa: S311 - a reproducible simulation, not security
    numbers = _loans(tenant)
    cashier = tenant.users["cajero"]
    collector = tenant.users["cobrador"]
    company_id = tenant.company.id
    # Day 0 ends: the disbursements' drawer closes like any other day.
    with company_context(company_id):
        _close_and_approve(tenant, rng, short=False)
        assert run_nightly(company_id, clock["day"])["problems"] == []

    corrected = waived = prepaid = paid_off = False
    for offset in range(5, 13):  # eight working days, weeks 1 and 2
        clock["day"] = START + dt.timedelta(days=offset)
        with company_context(company_id):
            cash.open_session(
                user=cashier, branch=tenant.branch, amount=D("5000"), fund_from=tenant.cash
            )
            route = cash.open_route(user=collector, branch=tenant.branch)

            # The collector's round.
            for number in numbers[:3]:
                loan = Loan.objects.get(number=number)
                if loan.status != Loan.Status.ACTIVE:
                    continue
                try:
                    post_payment(
                        loan=loan,
                        user=collector,
                        amount=D(rng.choice(["300", "450", "700"])),
                        method="cash",
                        idempotency_key=uuid.uuid4().hex,
                    )
                except PaymentError as error:
                    assert error.code == "too_much", error

            # The office: cash payments, with change.
            for number in numbers[:6]:
                loan = Loan.objects.get(number=number)
                if loan.status != Loan.Status.ACTIVE or rng.random() < 0.4:
                    continue
                amount = D(rng.choice(["250", "500", "1200", "2000"]))
                try:
                    post_payment(
                        loan=loan,
                        user=cashier,
                        amount=amount,
                        method="cash",
                        received=amount + D(rng.choice(["0", "50", "500"])),
                        idempotency_key=uuid.uuid4().hex,
                    )
                except PaymentError as error:
                    assert error.code == "too_much", error  # only when nearly paid

            # Five days late, the forgotten customer pays and his late fee is waived.
            if offset == 12:
                loan = Loan.objects.get(number=numbers[6])
                assert loan.late_fee_outstanding > 0
                post_payment(
                    loan=loan,
                    user=cashier,
                    amount=D("1000"),
                    method="cash",
                    received=D("1100"),
                    waive=loan.late_fee_outstanding,
                    waive_note="Cliente puntual de años",
                    idempotency_key=uuid.uuid4().hex,
                )
                waived = True

            # A principal prepayment on the fixed-payment loan.
            if not prepaid and offset >= 7:
                loan = Loan.objects.get(number=numbers[4])
                try:
                    post_payment(
                        loan=loan,
                        user=cashier,
                        amount=D("3000"),
                        method="cash",
                        kind=Payment.Kind.PREPAYMENT,
                        idempotency_key=uuid.uuid4().hex,
                    )
                    prepaid = True
                except PaymentError as error:
                    assert error.code == "overdue", error

            # A typo corrected with the supervisor's authorization (E14).
            if not corrected and offset >= 8:
                last = (
                    Payment.objects.filter(loan__number=numbers[3], status=Payment.Status.POSTED)
                    .order_by("-paid_at")
                    .first()
                )
                if last is not None and last.cash_session.cashier_id == cashier.pk:
                    request = reversals.request_reversal(
                        payment=last,
                        user=cashier,
                        reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
                        note="Monto mal digitado",
                        correct_amount=last.amount - D("50"),
                    )
                    reversals.decide(request=request, user=tenant.users["supervisor"], approve=True)
                    assert (
                        ApprovalRequest.objects.get(pk=request.pk).status
                        == ApprovalRequest.Status.USED
                    )
                    corrected = True

            # A payoff in the second week.
            if not paid_off and offset >= 10:
                loan = Loan.objects.get(number=numbers[5])
                if loan.status == Loan.Status.ACTIVE:
                    from apps.payments.letters import compute

                    quote, _valid = compute(loan, clock["day"])
                    post_payment(
                        loan=loan,
                        user=cashier,
                        amount=quote.total,
                        method="cash",
                        kind=Payment.Kind.PAYOFF,
                        idempotency_key=uuid.uuid4().hex,
                    )
                    paid_off = True

            # Settlement, counting and approval; the night job reconciles.
            due = cash.route_cash(route)
            cash.settle_route(route=route, user=cashier, delivered=due)
            _close_and_approve(tenant, rng, short=offset in (6, 11))
            result = run_nightly(company_id, clock["day"])
            assert result["problems"] == [], (clock["day"], result["problems"])

    assert corrected and waived and prepaid and paid_off
    with company_context(company_id):
        assert Loan.objects.get(number=numbers[5]).status == Loan.Status.PAID_OFF
        assert Payment.objects.filter(status=Payment.Status.REVERSED).count() == 1
    books_square(tenant)
