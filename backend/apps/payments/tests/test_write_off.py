"""Phase 8 · F13: write-off by the manager and recovery afterwards (decision 094)."""

from decimal import Decimal

from django.utils import timezone

from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.ledger import accounting, reconciliation
from apps.ledger import services as ledger
from apps.lending.models import Loan
from apps.payments import reversals
from apps.payments.models import Payment
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import books_square, make_loan, pay
from apps.reports import indicators

D = Decimal
PASSWORD = "una-clave-larga-123"


def nightly(tenant) -> None:
    with company_context(tenant.company.id):
        run_nightly(tenant.company.id, timezone.localdate())


def reason(tenant) -> int:
    with company_context(tenant.company.id):
        return Reason.objects.filter(kind=Reason.Kind.WRITE_OFF).first().id


def write_off(tenant, loan, role="gerente", second_factor=PASSWORD):
    return tenant.client(role).post(
        f"/api/v1/prestamos/{loan.number}/castigar/",
        {"reason": reason(tenant), "note": "Inubicable hace meses", "second_factor": second_factor},
        format="json",
    )


def balance(tenant, key: str) -> Decimal:
    with company_context(tenant.company.id):
        return ledger.balance_of(ledger.system_account(tenant.company.id, key))


def test_the_manager_writes_off_a_suggested_loan(tenant) -> None:
    late = make_loan(tenant, first_due_in=-200)
    make_loan(tenant, first_due_in=-10)  # not old enough to suggest
    nightly(tenant)
    suggested = tenant.client("gerente").get("/api/v1/castigos/sugeridos/").json()
    assert [row["number"] for row in suggested] == [late.number]

    assert write_off(tenant, late, role="supervisor").status_code == 403
    assert write_off(tenant, late, second_factor="").json()["code"] == "second_factor"
    response = write_off(tenant, late)
    assert response.status_code == 200, response.content
    with company_context(tenant.company.id):
        late.refresh_from_db()
        assert late.status == Loan.Status.WRITTEN_OFF
        assert late.written_off_on == timezone.localdate()
        assert late.principal_outstanding == D("1000.00")  # what it still owes, as a memo
        assert reconciliation.check(tenant.company.id) == []
    assert balance(tenant, "write_off_expense") == D("1000.00")
    books_square(tenant)
    # Out of the active portfolio.
    with company_context(tenant.company.id):
        assert indicators.portfolio(timezone.localdate()).count == 1
    assert write_off(tenant, late).json()["code"] == "state"


def test_what_is_collected_afterwards_is_recovery(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-200)
    nightly(tenant)
    assert write_off(tenant, loan).status_code == 200
    payment = pay(tenant, loan, "350")
    assert payment.is_recovery
    assert balance(tenant, "recovery_income") == D("350.00")
    assert balance(tenant, "interest_income") == D("0.00")
    with company_context(tenant.company.id):
        loan.refresh_from_db()
        assert loan.status == Loan.Status.WRITTEN_OFF  # recovered in part, still written off
        assert indicators.collected(timezone.localdate()) == D("350.00")
        today = timezone.localdate()
        results = accounting.management_results(today.replace(day=1), today)
        income = dict(results.income)
        assert income["Recuperación de cartera castigada"] == D("350.00")
        assert results.write_offs == D("1000.00")
        # A recovery can be reversed like any collection.
        request = reversals.request_reversal(
            payment=payment,
            user=tenant.users["cajero"],
            reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
            note="error",
        )
        reversals.decide(request=request, user=tenant.users["gerente"], approve=True)
        assert Payment.objects.get(pk=payment.pk).status == Payment.Status.REVERSED
        assert reconciliation.check(tenant.company.id) == []
    assert balance(tenant, "recovery_income") == D("0.00")
    books_square(tenant)


def test_the_suggestion_threshold_is_the_companys(tenant) -> None:
    manager = tenant.client("gerente")
    assert manager.patch("/api/v1/ajustes/empresa/", {"write_off_days": 60}).status_code == 400
    assert manager.patch("/api/v1/ajustes/empresa/", {"write_off_days": 90}).status_code == 200
    make_loan(tenant, first_due_in=-120)
    nightly(tenant)
    assert len(manager.get("/api/v1/castigos/sugeridos/").json()) == 1
