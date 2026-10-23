"""Decision 120: the company resets a person's two-step verification.

Whoever lost the phone and the backup codes is let back in by a manager or
administrator who knows them: the authenticators go, every session of the
person closes, the audit trail says who did it, the person hears by e-mail
and the other managers in the app. Nobody resets their own from here.
"""

from allauth.mfa.models import Authenticator
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.tests.test_totp_setup import PASSWORD, _signed_in
from apps.audit.models import DomainEvent
from apps.core.tenancy import company_context
from apps.notifications.models import Notification


def _with_totp(user) -> None:
    Authenticator.objects.create(
        user=user, type=Authenticator.Type.TOTP, data={"secret": "JBSWY3DPEHPK3PXP"}
    )
    Authenticator.objects.create(
        user=user, type=Authenticator.Type.RECOVERY_CODES, data={"seed": "x", "used_mask": 0}
    )


def _manager(tenant) -> APIClient:
    client = APIClient()
    client.force_login(tenant.users["gerente"])
    return client


def test_the_team_screen_says_who_has_the_second_step(tenant) -> None:
    _with_totp(tenant.users["cajero"])
    rows = _manager(tenant).get("/api/v1/usuarios/").json()["results"]
    by_email = {row["email"]: row["mfa_enabled"] for row in rows}
    assert by_email[tenant.users["cajero"].email] is True
    assert by_email[tenant.users["cobrador"].email] is False


def test_manager_resets_a_persons_second_step(
    tenant, mailoutbox, django_capture_on_commit_callbacks
) -> None:
    cashier = tenant.users["cajero"]
    phone = _signed_in(cashier)  # her open session, which must close
    _with_totp(cashier)
    assert phone.get("/api/v1/yo/").status_code == 200

    with django_capture_on_commit_callbacks(execute=True):
        response = _manager(tenant).post(
            f"/api/v1/usuarios/{cashier.id}/restablecer-2fa/",
            {"note": "Perdió el celular"},
            format="json",
        )
    assert response.status_code == 200, response.content
    assert response.json()["mfa_enabled"] is False
    assert not Authenticator.objects.filter(user=cashier).exists()
    assert phone.get("/api/v1/yo/").status_code == 401

    with company_context(tenant.company.id):
        event = DomainEvent.objects.get(type="account.mfa_reset")
        assert event.target_id == cashier.id
        assert event.actor == tenant.users["gerente"]
        assert event.data["note"] == "Perdió el celular"
        assert Notification.objects.filter(kind=Notification.Kind.SECURITY).exists()
    assert [m.to for m in mailoutbox] == [[cashier.email]]
    assert "restableció la verificación en dos pasos" in mailoutbox[0].body

    # She signs in again with her password and is asked to set it up anew.
    with override_settings(REQUIRE_MFA=True):
        again = APIClient()
        signin = again.post(
            "/api/v1/auth/browser/v1/auth/login",
            {"email": cashier.email, "password": PASSWORD},
            format="json",
        )
        assert signin.status_code == 200
        assert again.get("/api/v1/mi-empresa/").json()["code"] == "mfa_required"


def test_nobody_resets_their_own_from_the_team_screen(tenant) -> None:
    manager = tenant.users["gerente"]
    _with_totp(manager)
    response = _manager(tenant).post(f"/api/v1/usuarios/{manager.id}/restablecer-2fa/")
    assert response.status_code == 400
    assert Authenticator.objects.filter(user=manager).count() == 2


def test_only_managers_reset(tenant) -> None:
    cashier, collector = tenant.users["cajero"], tenant.users["cobrador"]
    _with_totp(collector)
    client = APIClient()
    client.force_login(cashier)
    assert client.post(f"/api/v1/usuarios/{collector.id}/restablecer-2fa/").status_code == 403


def test_a_manager_never_reaches_another_company(tenant, other_tenant) -> None:
    victim = other_tenant.users["cajero"]
    _with_totp(victim)
    response = _manager(tenant).post(f"/api/v1/usuarios/{victim.id}/restablecer-2fa/")
    assert response.status_code == 404
    assert Authenticator.objects.filter(user=victim).count() == 2
