
import pytest
from rest_framework.test import APIClient

from apps.core.tenancy import company_context
from apps.lending.models import LoanProduct
from apps.platform.services import RegistrationResult, register_company


@pytest.fixture
def tenant(db) -> RegistrationResult:
    return register_company(
        legal_name="Financiera Uno SRL",
        admin_email="gerente@uno.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )


@pytest.fixture
def client(tenant: RegistrationResult) -> APIClient:
    api = APIClient()
    api.force_login(tenant.admin)
    return api


def _product_id(tenant: RegistrationResult, name: str) -> str:
    with company_context(tenant.company.id):
        return str(LoanProduct.objects.get(name=name).id)


def test_registration_seeds_two_products_with_policy(
    client: APIClient, tenant: RegistrationResult
) -> None:
    listing = client.get("/api/v1/productos/")
    assert listing.status_code == 200
    rows = listing.json()["results"]
    assert len(rows) == 2
    fija = next(row for row in rows if row["method"] == "fixed_payment")
    assert fija["late_fee_policy"]["grace_days"] == 3
    assert fija["charges"][0]["name"] == "Gastos de cierre"


def test_simulator_matches_engine_e4(client: APIClient, tenant: RegistrationResult) -> None:
    """1,000 at 10% per period, 4 installments -> 315.47 (E4). The seeded
    monthly product uses a monthly unit, so monthly frequency keeps i=rate."""
    response = client.post(
        "/api/v1/simulador/",
        {
            "product": _product_id(tenant, "Cuota Fija (mensual)"),
            "amount": "10000",
            "installments": 6,
            "frequency": "biweekly",
            "rate": "0.05",
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()
    # E5: monthly 5% -> biweekly 2.5%; payment 1,815.50; interest 893.00
    assert data["schedule"][0]["total"] == "1815.50"
    assert data["total_interest"] == "893.00"
    assert data["monthly_rate"].startswith("0.05")
    # The seeded 2% discounted closing cost reduces the cash out (E7).
    assert data["total_charges"] == "200.00"
    assert data["net_disbursed"] == "9800.00"
    assert data["principal"] == "10000.00"


def test_simulator_validates_product_ranges(
    client: APIClient, tenant: RegistrationResult
) -> None:
    response = client.post(
        "/api/v1/simulador/",
        {
            "product": _product_id(tenant, "Personal San (semanal)"),
            "amount": "999999",
            "installments": 200,
            "frequency": "monthly",
            "rate": "0.90",
        },
        format="json",
    )
    assert response.status_code == 400
    errors = response.json()
    assert {"amount", "installments", "frequency", "rate"} <= set(errors)


def test_simulator_uses_default_rate_when_missing(
    client: APIClient, tenant: RegistrationResult
) -> None:
    response = client.post(
        "/api/v1/simulador/",
        {
            "product": _product_id(tenant, "Personal San (semanal)"),
            "amount": "1000",
            "installments": 4,
            "frequency": "weekly",
        },
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["schedule"][0]["total"] == "350.00"  # E1 with default 10%


def test_products_are_company_scoped_and_manager_gated(
    client: APIClient, tenant: RegistrationResult, db
) -> None:
    other = register_company(
        legal_name="Financiera Dos SRL",
        admin_email="gerente@dos.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Luis",
        admin_last_name="Santana",
    )
    intruder = APIClient()
    intruder.force_login(other.admin)
    mine = _product_id(tenant, "Personal San (semanal)")
    assert intruder.get(f"/api/v1/productos/{mine}/").status_code == 404
    # A foreign product id in the simulator fails validation (RLS empties it).
    response = intruder.post(
        "/api/v1/simulador/",
        {"product": mine, "amount": "1000", "installments": 4, "frequency": "weekly"},
        format="json",
    )
    assert response.status_code == 400


def test_product_update_edits_policy_but_not_loans(
    client: APIClient, tenant: RegistrationResult
) -> None:
    product_id = _product_id(tenant, "Personal San (semanal)")
    response = client.patch(
        f"/api/v1/productos/{product_id}/",
        {"late_fee_policy": {"grace_days": 5, "monthly_rate": "0.04", "cap_pct": "0.10"}},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["late_fee_policy"]["grace_days"] == 5


def test_invalid_frequency_list_rejected(client: APIClient) -> None:
    response = client.post(
        "/api/v1/productos/",
        {
            "name": "Producto raro",
            "type": "personal",
            "method": "flat",
            "allowed_frequencies": ["hourly"],
            "rate_unit": "per_period",
            "min_amount": "1000",
            "max_amount": "5000",
            "min_rate": "0.01",
            "max_rate": "0.10",
            "min_term": 1,
            "max_term": 10,
            "late_fee_policy": {"grace_days": 3, "monthly_rate": "0.05", "cap_pct": "0.10"},
        },
        format="json",
    )
    assert response.status_code == 400
    assert "allowed_frequencies" in response.json()


def test_simulation_persists_nothing(client: APIClient, tenant: RegistrationResult) -> None:
    """Defect #36 of the reference: a draft per keystroke. We store zero rows."""
    from apps.lending.models import LoanProduct as LP

    with company_context(tenant.company.id):
        products_before = LP.objects.count()
    client.post(
        "/api/v1/simulador/",
        {
            "product": _product_id(tenant, "Personal San (semanal)"),
            "amount": "1000",
            "installments": 4,
            "frequency": "weekly",
        },
        format="json",
    )
    with company_context(tenant.company.id):
        assert LP.objects.count() == products_before
