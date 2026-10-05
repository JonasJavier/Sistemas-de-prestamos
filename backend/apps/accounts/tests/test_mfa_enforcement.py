import pytest
from django.test import override_settings
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


@override_settings(REQUIRE_MFA=True)
def test_user_without_totp_is_blocked_with_mfa_code(tenant: RegistrationResult) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    response = client.get("/api/v1/mi-empresa/")
    assert response.status_code == 403
    assert response.json()["code"] == "mfa_required"


@override_settings(REQUIRE_MFA=True)
def test_exempt_endpoints_stay_reachable(tenant: RegistrationResult) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    assert client.get("/api/v1/yo/").status_code == 200
    assert client.get("/api/v1/csrf/").status_code == 200
    # The MFA setup endpoint itself must be reachable to escape the block.
    response = client.get("/api/v1/auth/browser/v1/account/authenticators/totp")
    assert response.status_code == 404  # not configured yet; includes the secret
    assert "secret" in response.json()["meta"]


@override_settings(REQUIRE_MFA=True)
def test_user_with_totp_passes(tenant: RegistrationResult) -> None:
    from allauth.mfa.models import Authenticator

    Authenticator.objects.create(
        user=tenant.admin, type=Authenticator.Type.TOTP, data={"secret_encrypted": "x"}
    )
    client = APIClient()
    client.force_login(tenant.admin)
    assert client.get("/api/v1/mi-empresa/").status_code == 200


def test_mfa_not_enforced_by_default_in_dev(tenant: RegistrationResult) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    assert client.get("/api/v1/mi-empresa/").status_code == 200
    me = client.get("/api/v1/yo/").json()
    assert me["mfa_required"] is False
    assert me["mfa_enabled"] is False
