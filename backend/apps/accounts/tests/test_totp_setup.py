"""Setting up the authenticator app from Mi cuenta (decisions 034 and 117).

The six digits the person reads from the app must be accepted: the secret
they scanned stays the same while the session lasts, a request in flight at
the same time cannot erase it, a code from the previous half minute still
counts, and a sign-in older than five minutes asks for the password again
instead of looking like a closed session.
"""

import time
from importlib import import_module

from django.conf import settings
from rest_framework.test import APIClient

from apps.accounts.middleware import SESSION_SEEN

BASE = "/api/v1/auth/browser/v1"
LOGIN = f"{BASE}/auth/login"
REAUTHENTICATE = f"{BASE}/auth/reauthenticate"
TOTP = f"{BASE}/account/authenticators/totp"
AUTHENTICATORS = f"{BASE}/account/authenticators"
PASSWORD = "una-clave-larga-123"


def _code(secret: str, steps_back: int = 0) -> str:
    from allauth.mfa.totp.internal.auth import format_hotp_value, hotp_value

    return format_hotp_value(hotp_value(secret, int(time.time()) // 30 - steps_back))


def _signed_in(user) -> APIClient:
    from allauth.account.models import EmailAddress

    EmailAddress.objects.get_or_create(
        user=user, email=user.email, defaults={"primary": True, "verified": True}
    )
    client = APIClient()
    response = client.post(LOGIN, {"email": user.email, "password": PASSWORD}, format="json")
    assert response.status_code == 200, response.content
    return client


def _secret(client: APIClient) -> str:
    response = client.get(TOTP)
    assert response.status_code == 404  # not active yet: the answer carries the secret
    return response.json()["meta"]["secret"]


def _activate(client: APIClient, code: str):
    return client.post(TOTP, {"code": code}, format="json")


def test_reopening_the_setup_keeps_the_secret_already_scanned(tenant) -> None:
    client = _signed_in(tenant.users["cajero"])
    secret = _secret(client)
    assert _secret(client) == secret  # a reload no longer invalidates the scan
    assert _activate(client, _code(secret)).status_code == 200


def test_a_request_in_flight_does_not_erase_the_secret(tenant) -> None:
    """The screen asks several things at once; the request that finished last
    used to write back the session it had read and wipe the secret."""
    client = _signed_in(tenant.users["cajero"])
    store = import_module(settings.SESSION_ENGINE).SessionStore
    in_flight = store(client.cookies[settings.SESSION_COOKIE_NAME].value)
    in_flight.get(SESSION_SEEN)  # read before the setup answers…
    secret = _secret(client)
    in_flight[SESSION_SEEN] = int(time.time())  # …and saved after (the minute touch)
    in_flight.save()
    assert _activate(client, _code(secret)).status_code == 200


def test_a_code_from_the_previous_half_minute_still_counts(tenant) -> None:
    client = _signed_in(tenant.users["cajero"])
    secret = _secret(client)
    assert _activate(client, _code(secret, steps_back=1)).status_code == 200


def test_a_wrong_code_is_refused(tenant) -> None:
    client = _signed_in(tenant.users["cajero"])
    secret = _secret(client)
    refused = _activate(client, _code(secret, steps_back=4))
    assert refused.status_code == 400
    assert refused.json()["errors"][0]["code"] == "incorrect_code"


def test_an_old_sign_in_asks_for_the_password_and_keeps_the_session(tenant) -> None:
    client = _signed_in(tenant.users["cajero"])
    secret = _secret(client)
    session = client.session
    records = session["account_authentication_methods"]
    for record in records:
        record["at"] -= 10 * 60
    session["account_authentication_methods"] = records
    session.save()

    asked = _activate(client, _code(secret))
    assert asked.status_code == 401
    body = asked.json()
    # Still signed in: the screen asks for the password, it does not sign out.
    assert body["meta"]["is_authenticated"] is True
    assert any(flow["id"] == "reauthenticate" for flow in body["data"]["flows"])

    assert client.post(REAUTHENTICATE, {"password": PASSWORD}, format="json").status_code == 200
    assert _activate(client, _code(secret)).status_code == 200


def test_activation_leaves_recovery_codes_ready(tenant) -> None:
    """The status screen reads the counts without asking for the password."""
    client = _signed_in(tenant.users["cajero"])
    assert _activate(client, _code(_secret(client))).status_code == 200
    listed = client.get(AUTHENTICATORS)
    assert listed.status_code == 200
    kinds = {item["type"]: item for item in listed.json()["data"]}
    assert (
        kinds["recovery_codes"]["unused_code_count"] == kinds["recovery_codes"]["total_code_count"]
    )
    assert "totp" in kinds
