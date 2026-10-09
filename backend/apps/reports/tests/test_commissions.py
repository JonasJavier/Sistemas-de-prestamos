"""Phase 7 · P63: commission rules, the month's calculation and approval
into payables, and the month-end check (decision 089)."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.cash import services as cash
from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.expenses.models import Payable
from apps.ledger import closing
from apps.lending.models import Loan
from apps.payments.reversals import execute_reversal
from apps.payments.tests.test_payments import make_loan, pay
from apps.reports.models import CommissionRun

D = Decimal


def today() -> dt.date:
    return timezone.localdate()


def rule(tenant, who="gerente", **data):
    body = {"name": "Cobradores", "role": "Cobrador", "base": "income_collected", "rate": "0.10"}
    return tenant.client(who).post("/api/v1/comisiones/reglas/", {**body, **data}, format="json")


def calculate(tenant, role="gerente", day=None):
    day = day or today()
    return tenant.client(role).post(
        "/api/v1/comisiones/", {"anio": day.year, "mes": day.month}, format="json"
    )


def collect_on_route(tenant, loan, amount):
    """The collector's payment, from his open route (F6)."""
    with company_context(tenant.company.id):
        collector = tenant.users["cobrador"]
        Loan.objects.filter(pk=loan.pk).update(collector=collector)
        if cash.open_route_of(collector) is None:
            collector.location_consent_at = timezone.now()
            collector.save()
            cash.open_route(user=collector, branch=tenant.branch)
    return pay(tenant, loan, amount, role="cobrador")


def line_of(run: dict, role: str) -> dict:
    return next(row for row in run["lines"] if row["role"] == role)


def commissions_check(day: dt.date):
    checks = closing.checklist(day.year, day.month).checks
    return next(c for c in checks if c.key == "commissions")


def test_rules_are_the_managers_and_make_sense(tenant) -> None:
    created = rule(tenant)
    assert created.status_code == 201, created.content
    assert created.json()["base_label"] == "Interés y mora cobrados"
    assert rule(tenant).status_code == 400  # one active rule per role
    assert rule(tenant, "contabilidad", name="Otra").status_code == 403
    wrong = rule(tenant, name="Oficiales", role="Oficial de crédito")
    assert wrong.status_code == 400 and wrong.json()["code"] == "base"
    assert rule(tenant, name="Cara", rate="1.5", role="Oficial de crédito").status_code == 400
    listed = tenant.client("contabilidad").get("/api/v1/comisiones/reglas/").json()
    assert [r["name"] for r in listed] == ["Cobradores"]
    assert tenant.client("cobrador").get("/api/v1/comisiones/reglas/").status_code == 403


def test_the_collector_earns_on_interest_and_reversals_subtract(tenant) -> None:
    rule(tenant)
    loan = make_loan(tenant, first_due_in=-3)  # installment 1: 250 principal + 100 interest
    collect_on_route(tenant, loan, "350")
    run = calculate(tenant).json()["run"]
    line = line_of(run, "Cobrador")
    assert (D(line["base_amount"]), D(line["amount"])) == (D("100.00"), D("10.00"))

    second = collect_on_route(tenant, loan, "350")
    with company_context(tenant.company.id):
        execute_reversal(
            payment=second,
            requested_by=tenant.users["cajero"],
            authorized_by=tenant.users["supervisor"],
            reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
            note="Error de digitación",
        )
    run = calculate(tenant, "contabilidad").json()["run"]
    line = line_of(run, "Cobrador")
    assert D(line["amount"]) == D("10.00")  # collected and reversed in the month: nothing


def test_the_officer_earns_on_placement_with_a_goal(tenant) -> None:
    rule(
        tenant,
        name="Oficiales",
        rate="0.02",
        goal="1500",
        base="disbursed",
        role="Oficial de crédito",
    )
    make_loan(tenant, first_due_in=3)  # RD$ 1,000 placed: below the goal
    run = calculate(tenant).json()["run"]
    line = line_of(run, "Oficial de crédito")
    assert (D(line["base_amount"]), D(line["amount"]), line["reached_goal"]) == (
        D("1000.00"),
        D("0.00"),
        False,
    )
    make_loan(tenant, first_due_in=3)
    run = calculate(tenant).json()["run"]
    line = line_of(run, "Oficial de crédito")
    assert (D(line["amount"]), line["reached_goal"]) == (D("40.00"), True)  # 2 % of all 2,000


def test_approval_waits_for_the_month_and_creates_payables(tenant) -> None:
    rule(tenant, name="Oficiales", rate="0.02", base="disbursed", role="Oficial de crédito")
    make_loan(tenant, first_due_in=3)
    run = calculate(tenant).json()["run"]
    early = tenant.client("gerente").post(f"/api/v1/comisiones/{run['id']}/aprobar/")
    assert early.status_code == 400 and early.json()["code"] == "month"

    # The same work counted in last month (dates moved back), then approved.
    last_month = today().replace(day=1) - dt.timedelta(days=1)
    with company_context(tenant.company.id):
        from apps.lending.models import Disbursement

        Disbursement.objects.update(disbursed_on=last_month)
        assert not commissions_check(last_month).ok
    run = calculate(tenant, day=last_month).json()["run"]
    assert D(run["total"]) == D("20.00")
    assert (
        tenant.client("supervisor").post(f"/api/v1/comisiones/{run['id']}/aprobar/").status_code
        == 403
    )
    approved = tenant.client("contabilidad").post(f"/api/v1/comisiones/{run['id']}/aprobar/")
    assert approved.status_code == 200, approved.content
    data = approved.json()["run"]
    assert data["status"] == "approved"
    paid_line = next(row for row in data["lines"] if D(row["amount"]) > 0)
    assert paid_line["payable"]["status"] == "Abierta"
    with company_context(tenant.company.id):
        payable = Payable.objects.get(pk=paid_line["payable"]["id"])
        assert payable.amount == D("20.00") and payable.recognized_on == last_month
        assert payable.category.dgii_type == "01"
        assert commissions_check(last_month).ok
    again = calculate(tenant, day=last_month)
    assert again.status_code == 400 and again.json()["code"] == "approved"


def test_commissions_never_cross_companies(tenant, other_tenant) -> None:
    rule(tenant)
    calculate(tenant)
    assert other_tenant.client("gerente").get("/api/v1/comisiones/reglas/").json() == []
    assert other_tenant.client("gerente").get("/api/v1/comisiones/").json()["run"] is None
    with company_context(tenant.company.id):
        run = CommissionRun.objects.get()
    response = other_tenant.client("gerente").post(f"/api/v1/comisiones/{run.id}/aprobar/")
    assert response.status_code == 404
