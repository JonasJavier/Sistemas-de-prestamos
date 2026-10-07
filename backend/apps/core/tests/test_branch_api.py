import pytest
from rest_framework.test import APIClient

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
def other_tenant(db) -> RegistrationResult:
    return register_company(
        legal_name="Financiera Dos SRL",
        admin_email="gerente@dos.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Luis",
        admin_last_name="Santana",
    )


def test_manager_creates_and_lists_branches(tenant: RegistrationResult) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    response = client.post(
        "/api/v1/sucursales/",
        {"code": "SD", "name": "Santo Domingo", "address": "Av. Duarte 1"},
        format="json",
    )
    assert response.status_code == 201, response.content
    listing = client.get("/api/v1/sucursales/")
    codes = [row["code"] for row in listing.json()["results"]]
    assert codes == ["01", "SD"]


def test_branch_code_cannot_change(tenant: RegistrationResult) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    branch_id = client.get("/api/v1/sucursales/").json()["results"][0]["id"]
    response = client.patch(f"/api/v1/sucursales/{branch_id}/", {"code": "XX"}, format="json")
    assert response.status_code == 400
    response = client.patch(
        f"/api/v1/sucursales/{branch_id}/", {"name": "Casa matriz"}, format="json"
    )
    assert response.status_code == 200


def test_the_last_active_branch_cannot_be_deactivated(tenant: RegistrationResult) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    only = client.get("/api/v1/sucursales/").json()["results"][0]["id"]
    refused = client.patch(f"/api/v1/sucursales/{only}/", {"is_active": False}, format="json")
    assert refused.status_code == 400
    assert "única sucursal activa" in refused.json()["is_active"][0]
    client.post("/api/v1/sucursales/", {"code": "ST", "name": "Santiago"}, format="json")
    allowed = client.patch(f"/api/v1/sucursales/{only}/", {"is_active": False}, format="json")
    assert allowed.status_code == 200


def test_branches_are_company_scoped(
    tenant: RegistrationResult, other_tenant: RegistrationResult
) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    other = APIClient()
    other.force_login(other_tenant.admin)
    branch_id = client.get("/api/v1/sucursales/").json()["results"][0]["id"]
    assert other.get(f"/api/v1/sucursales/{branch_id}/").status_code == 404
