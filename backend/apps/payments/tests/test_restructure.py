"""Phase 8 · F11: restructuring writes a new calendar version over the
principal outstanding, approved by someone else (decision 093)."""

from decimal import Decimal

from django.utils import timezone

from apps.core.models import ApprovalRequest, Reason
from apps.core.tenancy import company_context
from apps.lending.models import Installment, Loan
from apps.payments import reversals
from apps.payments.models import LateFeeWaiver
from apps.payments.services import PaymentError
from apps.payments.tests.test_payments import FIJA, books_square, make_loan, pay

D = Decimal


def overdue_fixed_loan(tenant) -> Loan:
    """Cuota fija of 20,000 in 6 monthly installments, two of them overdue."""
    return make_loan(
        tenant, first_due_in=-40, product=FIJA, amount="20000", installments=6, rate="0.05"
    )


def conditions(**overrides) -> dict:
    return {"installments": 12, "frequency": "monthly", "rate": "0.04", **overrides}


def nightly(tenant) -> None:
    from apps.payments.tasks import run_nightly

    with company_context(tenant.company.id):
        run_nightly(tenant.company.id, timezone.localdate())


def test_the_preview_spreads_what_is_overdue(tenant) -> None:
    loan = overdue_fixed_loan(tenant)
    nightly(tenant)
    response = tenant.client("oficial").post(
        f"/api/v1/prestamos/{loan.number}/reestructurar/vista-previa/", conditions(), format="json"
    )
    assert response.status_code == 200, response.content
    proposal = response.json()
    assert proposal["principal"] == "20000.00"
    assert D(proposal["carried_interest"]) > 0 and D(proposal["carried_late_fee"]) > 0
    rows = proposal["installments"]
    assert len(rows) == 12
    assert sum(D(row["principal"]) for row in rows) == D("20000.00")
    # Everything owed survives: principal plus the new interest plus what was overdue.
    carried = D(proposal["carried_interest"]) + D(proposal["carried_late_fee"])
    assert sum(D(row["interest"]) for row in rows) > carried
    waived = (
        tenant.client("oficial")
        .post(
            f"/api/v1/prestamos/{loan.number}/reestructurar/vista-previa/",
            conditions(waive_late_fee=True),
            format="json",
        )
        .json()
    )
    assert waived["carried_late_fee"] == "0.00"
    assert waived["waived_late_fee"] == proposal["carried_late_fee"]
    bad = tenant.client("oficial").post(
        f"/api/v1/prestamos/{loan.number}/reestructurar/vista-previa/",
        conditions(installments=999),
        format="json",
    )
    assert bad.status_code == 400 and bad.json()["code"] == "installments"


def test_approved_restructuring_writes_a_new_version(tenant) -> None:
    loan = overdue_fixed_loan(tenant)
    nightly(tenant)
    asked = tenant.client("oficial").post(
        f"/api/v1/prestamos/{loan.number}/reestructurar/",
        {**conditions(waive_late_fee=True), "note": "Perdió el empleo; paga menos por más tiempo"},
        format="json",
    )
    assert asked.status_code == 201, asked.content
    approval_id = asked.json()["id"]
    again = tenant.client("oficial").post(
        f"/api/v1/prestamos/{loan.number}/reestructurar/",
        {**conditions(), "note": "otra"},
        format="json",
    )
    assert again.status_code == 400 and again.json()["code"] == "pending"
    # Nobody authorizes what they asked for; the supervisor does.
    own = tenant.client("oficial").post(f"/api/v1/autorizaciones/{approval_id}/aprobar/", {})
    assert own.status_code in (403, 404)
    decided = tenant.client("supervisor").post(
        f"/api/v1/autorizaciones/{approval_id}/aprobar/", {}, format="json"
    )
    assert decided.status_code == 200, decided.content
    with company_context(tenant.company.id):
        loan.refresh_from_db()
        approval = ApprovalRequest.objects.get(pk=approval_id)
        assert approval.status == ApprovalRequest.Status.USED
        assert loan.is_restructured
        terms = loan.terms.order_by("-version").first()
        assert (terms.version, terms.installments, terms.rate) == (2, 12, D("0.040000"))
        assert terms.approved_by == tenant.users["supervisor"]
        current = loan.installments.exclude(status=Installment.Status.SUPERSEDED)
        assert current.count() == 12
        assert sum(i.principal_due for i in current) == D("20000.00")
        assert loan.principal_outstanding == D("20000.00")
        assert (loan.days_past_due, loan.late_fee_outstanding) == (0, D("0.00"))
        assert LateFeeWaiver.objects.filter(approval=approval).exists()
    books_square(tenant)  # no money moved: the portfolio still equals the principal


def test_payments_before_a_restructuring_are_not_reversed(tenant) -> None:
    loan = make_loan(
        tenant, first_due_in=-40, product=FIJA, amount="20000", installments=6, rate="0.05"
    )
    payment = pay(tenant, loan, "500")  # partly pays the oldest installment
    asked = tenant.client("supervisor").post(
        f"/api/v1/prestamos/{loan.number}/reestructurar/",
        {**conditions(), "note": "Acuerdo de pago"},
        format="json",
    )
    decided = tenant.client("gerente").post(
        f"/api/v1/autorizaciones/{asked.json()['id']}/aprobar/", {}, format="json"
    )
    assert decided.status_code == 200, decided.content
    with company_context(tenant.company.id):
        try:
            reversals.request_reversal(
                payment=payment,
                user=tenant.users["cajero"],
                reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
                note="error",
            )
            raise AssertionError("a payment before the new calendar must not be reversed")
        except PaymentError as exc:
            assert exc.code == "rescheduled"
    books_square(tenant)


def test_a_rejected_restructuring_changes_nothing(tenant) -> None:
    loan = overdue_fixed_loan(tenant)
    asked = tenant.client("oficial").post(
        f"/api/v1/prestamos/{loan.number}/reestructurar/",
        {**conditions(), "note": "Pide más plazo"},
        format="json",
    )
    rejected = tenant.client("supervisor").post(
        f"/api/v1/autorizaciones/{asked.json()['id']}/rechazar/",
        {"note": "Primero que abone lo vencido"},
        format="json",
    )
    assert rejected.status_code == 200, rejected.content
    with company_context(tenant.company.id):
        loan.refresh_from_db()
        assert not loan.is_restructured and loan.terms.count() == 1
    assert tenant.client("cobrador").post(
        f"/api/v1/prestamos/{loan.number}/reestructurar/", {**conditions(), "note": "x"}
    ).status_code in (403, 404)


def test_a_refused_date_change_answers_400_not_500(tenant) -> None:
    """Regression: the loan actions answer payment errors with their message."""
    loan = make_loan(tenant, first_due_in=5)
    with company_context(tenant.company.id):
        reason = Reason.objects.filter(kind=Reason.Kind.DATE_CHANGE).first()
    response = tenant.client("supervisor").post(
        f"/api/v1/prestamos/{loan.number}/cambiar-fecha/",
        {"first_due": "2020-01-01", "reason": reason.id, "note": "Cobra quincenal"},
        format="json",
    )
    assert response.status_code == 400 and response.json()["code"] == "first_due"
