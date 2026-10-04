import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Invitation, Role, User
from apps.core.models import Branch
from apps.core.tenancy import company_context
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
def manager_client(tenant: RegistrationResult) -> APIClient:
    client = APIClient()
    client.force_login(tenant.admin)
    return client


def _invite_and_accept(manager_client: APIClient, tenant: RegistrationResult) -> User:
    with company_context(tenant.company.id):
        branch_id = str(Branch.objects.get().id)
        role_id = str(Role.objects.get(name="Cajero").id)
    manager_client.post(
        "/api/v1/invitaciones/",
        {"email": "cajera@uno.do", "branch": branch_id, "role": role_id},
        format="json",
    )
    token = Invitation.objects.get(email="cajera@uno.do").token
    APIClient().post(
        f"/api/v1/invitaciones/{token}/aceptar/",
        {"first_name": "Caro", "last_name": "Núñez", "password": "otra-clave-larga-456"},
        format="json",
    )
    return User.objects.get(email="cajera@uno.do")


def test_manager_lists_company_users_with_roles(
    manager_client: APIClient, tenant: RegistrationResult
) -> None:
    _invite_and_accept(manager_client, tenant)
    response = manager_client.get("/api/v1/usuarios/")
    assert response.status_code == 200
    rows = response.json()["results"]
    assert len(rows) == 2
    cashier = next(row for row in rows if row["email"] == "cajera@uno.do")
    assert cashier["memberships"][0]["role_name"] == "Cajero"


def test_non_manager_cannot_list_users(
    manager_client: APIClient, tenant: RegistrationResult
) -> None:
    cashier = _invite_and_accept(manager_client, tenant)
    client = APIClient()
    client.force_login(cashier)
    assert client.get("/api/v1/usuarios/").status_code == 403


def test_deactivate_user_but_never_yourself(
    manager_client: APIClient, tenant: RegistrationResult
) -> None:
    cashier = _invite_and_accept(manager_client, tenant)
    response = manager_client.post(f"/api/v1/usuarios/{cashier.id}/deactivate/")
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    me = manager_client.post(f"/api/v1/usuarios/{tenant.admin.id}/deactivate/")
    assert me.status_code == 400


def test_pending_invitations_list_and_revoke(
    manager_client: APIClient, tenant: RegistrationResult
) -> None:
    with company_context(tenant.company.id):
        branch_id = str(Branch.objects.get().id)
        role_id = str(Role.objects.get(name="Oficial de crédito").id)
    manager_client.post(
        "/api/v1/invitaciones/",
        {"email": "oficial@uno.do", "branch": branch_id, "role": role_id},
        format="json",
    )
    pending = manager_client.get("/api/v1/invitaciones/pendientes/").json()
    assert len(pending) == 1
    invitation_id = pending[0]["id"]
    assert (
        manager_client.delete(
            f"/api/v1/invitaciones/pendientes/{invitation_id}/"
        ).status_code
        == 204
    )
    assert manager_client.get("/api/v1/invitaciones/pendientes/").json() == []


def test_roles_list_is_company_scoped(manager_client: APIClient) -> None:
    response = manager_client.get("/api/v1/roles/")
    assert response.status_code == 200
    assert len(response.json()) == 8
