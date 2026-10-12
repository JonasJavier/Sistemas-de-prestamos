"""The office follows a collector's stops (decision 115)."""

from decimal import Decimal

from apps.cash.tests.test_cash import _route
from apps.core.tenancy import company_context
from apps.lending.models import Loan
from apps.payments.tests.test_payments import make_loan, pay

D = Decimal


def test_the_supervisor_reads_the_stops_with_their_results(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    collector = tenant.users["cobrador"]
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=loan.pk).update(collector=collector)
    _route(tenant)
    assert tenant.client("cobrador").get("/api/v1/ruta/").status_code == 200  # builds the stops
    pay(tenant, loan, "350.00", role="cobrador")

    data = tenant.client("supervisor").get(f"/api/v1/rutas/{collector.id}/paradas/").json()
    assert data["route"]["status"] == "open"
    assert D(data["collected"]) == D("350.00")
    assert D(data["expected"]) >= D("350.00")
    stop = next(s for s in data["stops"] if s["loan_number"] == loan.number)
    assert stop["payment"]["method"] == "Efectivo"
    assert stop["payment"]["at"]

    assert (
        tenant.client("cobrador").get(f"/api/v1/rutas/{collector.id}/paradas/").status_code == 403
    )
    other = tenant.users["cajero"]
    assert tenant.client("supervisor").get(f"/api/v1/rutas/{other.id}/paradas/").status_code == 404
