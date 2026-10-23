"""«Mantenerme conectado» and «confiar en este dispositivo» (decision 118).

Without the box, the session lives 30 minutes without use, 12 hours at most
and ends with the browser; with it, 7 days without use and 30 days at most.
After the 2FA code, a trusted browser skips the code for 30 days.
"""

import time

from allauth.account.models import EmailAddress
from django.conf import settings
from rest_framework.test import APIClient

from apps.accounts.middleware import SESSION_STARTED

BASE = "/api/v1/auth/browser/v1"
LOGIN = f"{BASE}/auth/login"
REMEMBER = "/api/v1/sesion/recordar/"
PASSWORD = "una-clave-larga-123"


def _sign_in(user, remember: bool | None = None) -> APIClient:
    EmailAddress.objects.get_or_create(
        user=user, email=user.email, defaults={"primary": True, "verified": True}
    )
    client = APIClient()
    if remember is not None:
        assert client.post(REMEMBER, {"remember": remember}, format="json").status_code == 204
    response = client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200, response.content
    assert client.get("/api/v1/yo/").status_code == 200
    return client


def test_without_the_box_the_session_ends_with_the_browser(tenant) -> None:
    session = _sign_in(tenant.users["cajero"], remember=False).session
    assert session.get_expire_at_browser_close()
    assert session.get_expiry_age() == settings.SESSION_COOKIE_AGE


def test_with_the_box_the_session_lasts_seven_days_idle(tenant) -> None:
    session = _sign_in(tenant.users["cajero"], remember=True).session
    assert not session.get_expire_at_browser_close()
    assert session.get_expiry_age() == 7 * 24 * 60 * 60


def test_a_remembered_session_still_closes_after_30_days(tenant) -> None:
    client = _sign_in(tenant.users["cajero"], remember=True)
    session = client.session
    session[SESSION_STARTED] = int(time.time()) - 13 * 60 * 60  # past the 12 hours
    session.save()
    assert client.get("/api/v1/yo/").status_code == 200
    session = client.session
    session[SESSION_STARTED] = int(time.time()) - 31 * 24 * 60 * 60
    session.save()
    assert client.get("/api/v1/yo/").status_code == 401


def test_the_choice_belongs_to_one_sign_in(tenant) -> None:
    """Signing in again without the box does not inherit the last choice."""
    client = _sign_in(tenant.users["cajero"], remember=True)
    client.delete(f"{BASE}/auth/session")
    user = tenant.users["cajero"]
    client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
    client.get("/api/v1/yo/")
    assert client.session.get_expire_at_browser_close()


def test_another_site_cannot_choose_it(db) -> None:
    client = APIClient(enforce_csrf_checks=True)
    assert client.post(REMEMBER, {"remember": True}, format="json").status_code == 403


def test_a_trusted_browser_skips_the_code_for_30_days(tenant) -> None:
    from allauth.mfa.totp.internal.auth import (
        TOTP,
        format_hotp_value,
        generate_totp_secret,
        hotp_value,
    )

    user = tenant.users["cajero"]
    EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    secret = generate_totp_secret()
    TOTP.activate(user, secret)
    client = APIClient()

    asked = client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
    assert asked.status_code == 401
    code = format_hotp_value(hotp_value(secret, int(time.time()) // 30))
    trust = client.post(f"{BASE}/auth/2fa/authenticate", {"code": code}, format="json")
    assert trust.status_code == 401
    assert {f["id"] for f in trust.json()["data"]["flows"] if f.get("is_pending")} == {"mfa_trust"}
    assert client.post(f"{BASE}/auth/2fa/trust", {"trust": True}, format="json").status_code == 200
    cookie = client.cookies["mfa_trusted"]
    assert int(cookie["max-age"]) == 30 * 24 * 60 * 60

    client.delete(f"{BASE}/auth/session")
    again = client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
    assert again.status_code == 200, again.content  # no code this time
