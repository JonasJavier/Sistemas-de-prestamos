"""Doc 06 - section 6: session lifetime, failed-login lock and the 401 contract."""

import time

from django.conf import settings
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.accounts.middleware import SESSION_SEEN, SESSION_STARTED

LOGIN = "/api/v1/auth/browser/v1/auth/login"


def test_anonymous_api_call_answers_401_not_403(db) -> None:
    """401 means «tu sesión se cerró»; the SPA sends the user to /entrar."""
    response = APIClient().get("/api/v1/yo/")
    assert response.status_code == 401


def test_idle_window_is_30_minutes_and_renews_while_working(tenant) -> None:
    client = tenant.client("cajero")
    assert client.get("/api/v1/yo/").status_code == 200
    session = client.session
    assert settings.SESSION_COOKIE_AGE == 30 * 60
    assert session.get_expiry_age() == 30 * 60
    assert session[SESSION_STARTED] <= session[SESSION_SEEN] <= int(time.time())


def test_session_closes_after_12_hours_even_if_active(tenant) -> None:
    client = tenant.client("cajero")
    assert client.get("/api/v1/yo/").status_code == 200
    session = client.session
    session[SESSION_STARTED] = int(time.time()) - settings.SESSION_ABSOLUTE_SECONDS - 1
    session.save()
    assert client.get("/api/v1/yo/").status_code == 401
    # The session is gone for good, not just for that request.
    assert client.get("/api/v1/yo/").status_code == 401


def test_five_failed_logins_lock_the_account(tenant) -> None:
    cache.clear()
    client = APIClient()
    email = tenant.users["cajero"].email
    for _ in range(5):
        response = client.post(LOGIN, {"email": email, "password": "mala"}, format="json")
        assert response.status_code == 400
    # Even the right password is refused while the lock lasts.
    locked = client.post(LOGIN, {"email": email, "password": "una-clave-larga-123"}, format="json")
    assert locked.status_code == 400
    assert locked.json()["errors"][0]["code"] == "too_many_login_attempts"
    cache.clear()
