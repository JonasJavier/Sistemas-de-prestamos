"""P20 with the portfolio of each customer (decision 114)."""

from decimal import Decimal

from django.utils import timezone

from apps.conftest import make_customer
from apps.core.tenancy import company_context
from apps.lending.models import Loan
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import make_loan

D = Decimal


def _rows(tenant, query: str = "") -> dict[str, dict]:
    response = tenant.client("gerente").get(f"/api/v1/clientes/{query}")
    assert response.status_code == 200, response.content
    return {row["id"]: row for row in response.json()["results"]}


def test_the_list_brings_each_customers_portfolio_and_filters_by_state(tenant) -> None:
    current = make_loan(tenant, first_due_in=3)
    late = make_loan(tenant, first_due_in=-10)
    with company_context(tenant.company.id):
        # The helper lends to one customer; the late loan moves to another.
        other = make_customer(tenant.company, tenant.branch, "40212345675", "Pedro")
        Loan.objects.filter(pk=late.pk).update(collector=tenant.users["cobrador"], customer=other)
        run_nightly(tenant.company.id, timezone.localdate())  # days past due, next due date
        current.refresh_from_db()
        late.refresh_from_db()

    rows = _rows(tenant)
    on_time = rows[str(current.customer_id)]["portfolio"]
    assert on_time["active_loans"] == 1
    assert D(on_time["balance"]) == current.principal_outstanding
    assert on_time["days_past_due"] == 0
    assert on_time["next_due"] == current.next_due_date.isoformat()
    assert D(on_time["next_amount"]) == D("350.00")  # E1: four installments of 350.00
    assert on_time["loan"] == current.number
    assert on_time["collector"] is None  # pays at the office
    behind = rows[str(late.customer_id)]["portfolio"]
    assert behind["days_past_due"] > 0
    assert behind["collector"]

    assert set(_rows(tenant, "?estado=al_dia")) == {str(current.customer_id)}
    assert set(_rows(tenant, "?estado=atraso")) == {str(late.customer_id)}
    assert not set(_rows(tenant, "?estado=sin_prestamo")) & {
        str(current.customer_id),
        str(late.customer_id),
    }
    collector = tenant.users["cobrador"].id
    assert set(_rows(tenant, f"?cobrador={collector}")) == {str(late.customer_id)}
    assert str(current.customer_id) in _rows(tenant, "?cobrador=oficina")
    assert tenant.client("gerente").get("/api/v1/clientes/?cobrador=x").status_code == 400


def test_the_summary_counts_the_states_and_the_portfolio(tenant) -> None:
    make_loan(tenant, first_due_in=3)
    late = make_loan(tenant, first_due_in=-10)
    with company_context(tenant.company.id):
        other = make_customer(tenant.company, tenant.branch, "40212345675", "Pedro")
        Loan.objects.filter(pk=late.pk).update(customer=other)
        run_nightly(tenant.company.id, timezone.localdate())
    summary = tenant.client("gerente").get("/api/v1/clientes/resumen/").json()
    assert summary["al_dia"] >= 1 and summary["atraso"] >= 1
    assert summary["todos"] == summary["al_dia"] + summary["atraso"] + summary["sin_prestamo"]
    assert summary["loans"] == 2
    assert D(summary["principal"]) == D("2000.00")


def test_a_customer_with_several_loans_is_one_row(tenant) -> None:
    first = make_loan(tenant, first_due_in=3)
    make_loan(tenant, first_due_in=5)
    with company_context(tenant.company.id):
        run_nightly(tenant.company.id, timezone.localdate())
    response = tenant.client("gerente").get("/api/v1/clientes/").json()
    rows = [row for row in response["results"] if row["id"] == str(first.customer_id)]
    assert len(rows) == 1
    assert response["count"] == len(response["results"])
    assert rows[0]["portfolio"]["active_loans"] == 2
    assert D(rows[0]["portfolio"]["balance"]) == D("2000.00")
    assert D(rows[0]["portfolio"]["next_amount"]) == D("350.00")  # only the soonest falls due
