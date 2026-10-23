"""Passkeys (decision 121): the device's fingerprint, face or PIN in place
of the password and the code. The browser does the signing; here we check
that allauth offers the flows, hands out the challenges and counts a
passkey as the second step the company requires."""

from allauth.mfa.models import Authenticator
from django.test import override_settings
from rest_framework.test import APIClient

from apps.accounts.tests.test_totp_setup import BASE, _signed_in


def test_the_installation_offers_passkeys(db) -> None:
    config = APIClient().get(f"{BASE}/config").json()["data"]["mfa"]
    assert "webauthn" in config["supported_types"]
    assert config["passkey_login_enabled"] is True


def test_a_passkey_is_made_passwordless_right_after_signing_in(tenant) -> None:
    client = _signed_in(tenant.users["cajero"])
    response = client.get(f"{BASE}/account/authenticators/webauthn?passwordless")
    assert response.status_code == 200, response.content
    options = response.json()["data"]["creation_options"]["publicKey"]
    assert options["authenticatorSelection"]["residentKey"] == "required"
    assert options["authenticatorSelection"]["userVerification"] == "required"
    assert options["user"]["name"] == tenant.users["cajero"].email


def test_anyone_may_ask_for_the_sign_in_challenge(db) -> None:
    response = APIClient().get(f"{BASE}/auth/webauthn/login")
    assert response.status_code == 200
    assert "challenge" in response.json()["data"]["request_options"]["publicKey"]


@override_settings(REQUIRE_MFA=True)
def test_a_passkey_satisfies_the_mandatory_second_step(tenant) -> None:
    cashier = tenant.users["cajero"]
    client = APIClient()
    client.force_login(cashier)
    assert client.get("/api/v1/mi-empresa/").json()["code"] == "mfa_required"
    Authenticator.objects.create(
        user=cashier, type=Authenticator.Type.WEBAUTHN, data={"name": "Mi celular"}
    )
    assert client.get("/api/v1/mi-empresa/").status_code == 200
    assert client.get("/api/v1/yo/").json()["mfa_enabled"] is True
