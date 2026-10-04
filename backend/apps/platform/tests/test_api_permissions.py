import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.platform.services import register_company


@pytest.fixture
def tenant_admin(db) -> User:
    result = register_company(
        legal_name="Financiera Uno SRL",
        admin_email="gerente@uno.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )
    return result.admin


@pytest.fixture
def platform_owner(db) -> User:
    return User.objects.create_superuser("jonas@cobradia.com", "una-clave-larga-123")


def test_tenant_user_cannot_access_platform_panel(tenant_admin: User) -> None:
    client = APIClient()
    client.force_login(tenant_admin)
    response = client.get("/api/v1/plataforma/empresas/")
    assert response.status_code == 403


def test_platform_owner_lists_companies(platform_owner: User, tenant_admin: User) -> None:
    client = APIClient()
    client.force_login(platform_owner)
    response = client.get("/api/v1/plataforma/empresas/")
    assert response.status_code == 200
    names = [row["legal_name"] for row in response.json()["results"]]
    assert "Financiera Uno SRL" in names


def test_owner_can_suspend_and_reactivate(platform_owner: User, tenant_admin: User) -> None:
    client = APIClient()
    client.force_login(platform_owner)
    company_id = str(tenant_admin.company_id)
    response = client.post(
        f"/api/v1/plataforma/empresas/{company_id}/suspend/",
        {"reason": "Falta de pago"},
        format="json",
    )
    assert response.status_code == 200
    assert response.json()["status"] == "suspended"
    response = client.post(
        f"/api/v1/plataforma/empresas/{company_id}/reactivate/",
        {"reason": "Pago recibido"},
        format="json",
    )
    assert response.json()["status"] == "active"


def test_anonymous_cannot_access_platform_panel(db) -> None:
    response = APIClient().get("/api/v1/plataforma/empresas/")
    assert response.status_code == 403


def test_tenant_reads_its_own_company(tenant_admin: User) -> None:
    client = APIClient()
    client.force_login(tenant_admin)
    response = client.get("/api/v1/mi-empresa/")
    assert response.status_code == 200
    data = response.json()
    assert data["legal_name"] == "Financiera Uno SRL"
    assert data["trial_days_left"] == 30
    assert data["subscription"]["plan"]["is_trial"] is True
