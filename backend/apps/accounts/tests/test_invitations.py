import datetime as dt

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Invitation, Membership, Role, User
from apps.core.models import Branch, Company
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
def other_tenant(db) -> RegistrationResult:
    return register_company(
        legal_name="Financiera Dos SRL",
        admin_email="gerente@dos.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Luis",
        admin_last_name="Santana",
    )


def _ids(tenant: RegistrationResult) -> tuple[str, str]:
    with company_context(tenant.company.id):
        role_id = str(Role.objects.get(name="Cajero").id)
        branch_id = str(Branch.objects.get().id)
    return branch_id, role_id


def test_admin_invites_and_user_accepts(tenant: RegistrationResult) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    branch_id, role_id = _ids(tenant)

    mail.outbox.clear()
    response = client.post(
        "/api/v1/invitaciones/",
        {"email": "cajera@uno.do", "branch": branch_id, "role": role_id},
        format="json",
    )
    assert response.status_code == 201, response.content
    assert len(mail.outbox) == 1
    assert "cajera@uno.do" in mail.outbox[0].to

    token = Invitation.objects.get().token
    public = APIClient()
    detail = public.get(f"/api/v1/invitaciones/{token}/")
    assert detail.status_code == 200
    assert detail.json()["role_name"] == "Cajero"

    accepted = public.post(
        f"/api/v1/invitaciones/{token}/aceptar/",
        {"first_name": "Caro", "last_name": "Núñez", "password": "otra-clave-larga-456"},
        format="json",
    )
    assert accepted.status_code == 201, accepted.content

    user = User.objects.get(email="cajera@uno.do")
    assert user.company_id == tenant.company.id
    with company_context(tenant.company.id):
        membership = Membership.objects.get(user=user)
        assert membership.role.name == "Cajero"


def test_cannot_invite_into_another_company(
    tenant: RegistrationResult, other_tenant: RegistrationResult
) -> None:
    """RLS empties the branch/role querysets of the other company."""
    client = APIClient()
    client.force_login(tenant.admin)
    other_branch_id, other_role_id = _ids(other_tenant)
    response = client.post(
        "/api/v1/invitaciones/",
        {"email": "x@uno.do", "branch": other_branch_id, "role": other_role_id},
        format="json",
    )
    assert response.status_code == 400


def test_non_admin_cannot_invite(tenant: RegistrationResult) -> None:
    branch_id, role_id = _ids(tenant)
    client = APIClient()
    client.force_login(tenant.admin)
    client.post(
        "/api/v1/invitaciones/",
        {"email": "cajera@uno.do", "branch": branch_id, "role": role_id},
        format="json",
    )
    token = Invitation.objects.get().token
    APIClient().post(
        f"/api/v1/invitaciones/{token}/aceptar/",
        {"first_name": "Caro", "last_name": "Núñez", "password": "otra-clave-larga-456"},
        format="json",
    )
    cashier = User.objects.get(email="cajera@uno.do")
    cashier_client = APIClient()
    cashier_client.force_login(cashier)
    response = cashier_client.post(
        "/api/v1/invitaciones/",
        {"email": "otro@uno.do", "branch": branch_id, "role": role_id},
        format="json",
    )
    assert response.status_code == 403


def test_expired_invitation_is_rejected(tenant: RegistrationResult) -> None:
    branch_id, role_id = _ids(tenant)
    with company_context(tenant.company.id):
        invitation = Invitation.objects.create(
            company=tenant.company,
            email="tarde@uno.do",
            branch_id=branch_id,
            role_id=role_id,
            token="token-vencido-para-prueba",
            invited_by=tenant.admin,
            expires_at=timezone.now() - dt.timedelta(days=1),
        )
    response = APIClient().post(
        f"/api/v1/invitaciones/{invitation.token}/aceptar/",
        {"first_name": "X", "last_name": "Y", "password": "otra-clave-larga-456"},
        format="json",
    )
    assert response.status_code == 400


def test_suspended_company_is_read_only(tenant: RegistrationResult) -> None:
    company = tenant.company
    company.status = Company.Status.SUSPENDED
    company.save(update_fields=["status"])

    client = APIClient()
    client.force_login(tenant.admin)
    # Reading still works (F19: consult and export).
    assert client.get("/api/v1/mi-empresa/").status_code == 200
    # Operating does not.
    branch_id, role_id = _ids(tenant)
    response = client.post(
        "/api/v1/invitaciones/",
        {"email": "nueva@uno.do", "branch": branch_id, "role": role_id},
        format="json",
    )
    assert response.status_code == 403
