"""«Continuar con Google» (decision 118).

A person whose Google address is already an account signs in (and still
passes the 2FA step); a new one joins only by registering a company or by
accepting an invitation for that same address. allauth's bare signup, which
would leave an account without a company, is closed.
"""

import time
from unittest.mock import patch

import pytest
from allauth.account.models import EmailAddress
from allauth.socialaccount.models import SocialAccount
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Invitation, Membership, User
from apps.core.tenancy import company_context

BASE = "/api/v1/auth/browser/v1"
TOKEN = f"{BASE}/auth/provider/token"
PROVIDER_SIGNUP = f"{BASE}/auth/provider/signup"
CLIENT_ID = "cliente-de-prueba.apps.googleusercontent.com"


@pytest.fixture(autouse=True)
def google_app(settings):
    settings.SOCIALACCOUNT_PROVIDERS = {
        "google": {
            **settings.SOCIALACCOUNT_PROVIDERS["google"],
            "APPS": [{"client_id": CLIENT_ID, "secret": "secreto"}],
        }
    }


def _claims(email: str, sub: str = "1001") -> dict:
    now = int(time.time())
    return {
        "iss": "https://accounts.google.com",
        "aud": CLIENT_ID,
        "sub": sub,
        "email": email,
        "email_verified": True,
        "given_name": "Ana",
        "family_name": "Pérez",
        "name": "Ana Pérez",
        "iat": now,
        "exp": now + 3600,
    }


def _google(client: APIClient, email: str, sub: str = "1001"):
    """Google's answer, as the browser hands it over (signature checked by allauth)."""
    with patch(
        "allauth.socialaccount.providers.google.views._verify_and_decode",
        return_value=_claims(email, sub),
    ):
        return client.post(
            TOKEN,
            {
                "provider": "google",
                "process": "login",
                "token": {"client_id": CLIENT_ID, "id_token": "jwt"},
            },
            format="json",
        )


def _pending(response) -> set[str]:
    return {flow["id"] for flow in response.json()["data"]["flows"] if flow.get("is_pending")}


def test_allauth_bare_signup_is_closed(db) -> None:
    response = APIClient().post(
        f"{BASE}/auth/signup",
        {
            "email": "suelto@ejemplo.do",
            "password": "una-clave-larga-123",
            "first_name": "Suelto",
            "last_name": "Sin Empresa",
            "company_legal_name": "Nada SRL",
            "accept_terms": True,
        },
        format="json",
    )
    assert response.status_code == 403
    assert not User.objects.filter(email="suelto@ejemplo.do").exists()


def test_an_existing_person_signs_in_with_google(tenant) -> None:
    user = tenant.users["cajero"]
    EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    client = APIClient()

    response = _google(client, user.email)

    assert response.status_code == 200, response.content
    assert client.get("/api/v1/yo/").json()["email"] == user.email
    assert SocialAccount.objects.filter(user=user, provider="google").exists()


def test_google_still_asks_for_the_2fa_code(tenant) -> None:
    from allauth.mfa.totp.internal.auth import TOTP, generate_totp_secret

    user = tenant.users["cajero"]
    EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    TOTP.activate(user, generate_totp_secret())

    response = _google(APIClient(), user.email)

    assert response.status_code == 401
    assert "mfa_authenticate" in _pending(response)


def test_a_new_person_registers_their_company_with_google(db) -> None:
    client = APIClient()
    pending = _google(client, "nueva@gmail.com")
    assert pending.status_code == 401
    assert "provider_signup" in _pending(pending)
    assert client.get(PROVIDER_SIGNUP).json()["data"]["user"]["email"] == "nueva@gmail.com"

    done = client.post(
        PROVIDER_SIGNUP,
        {
            "email": "nueva@gmail.com",
            "first_name": "Ana",
            "last_name": "Pérez",
            "company_legal_name": "Préstamos Ana SRL",
            "accept_terms": True,
        },
        format="json",
    )

    assert done.status_code == 200, done.content
    me = client.get("/api/v1/yo/").json()
    assert me["company_name"] == "Préstamos Ana SRL"
    assert me["has_password"] is False
    assert set(me["roles"]) == {"Gerente", "Administrador"}
    user = User.objects.get(email="nueva@gmail.com")
    assert EmailAddress.objects.get(user=user).verified  # Google verified it
    assert user.company.terms_accepted_at is not None


def test_registering_needs_the_company_and_the_terms(db) -> None:
    client = APIClient()
    _google(client, "nueva@gmail.com")
    refused = client.post(
        PROVIDER_SIGNUP,
        {"email": "nueva@gmail.com", "first_name": "Ana", "last_name": "Pérez"},
        format="json",
    )
    assert refused.status_code == 400
    params = {error.get("param") for error in refused.json()["errors"]}
    assert {"company_legal_name", "accept_terms"} <= params
    assert not User.objects.filter(email="nueva@gmail.com").exists()


def test_the_google_address_cannot_be_swapped(db) -> None:
    client = APIClient()
    _google(client, "nueva@gmail.com")
    refused = client.post(
        PROVIDER_SIGNUP,
        {
            "email": "otra@ejemplo.do",
            "first_name": "Ana",
            "last_name": "Pérez",
            "company_legal_name": "Préstamos Ana SRL",
            "accept_terms": True,
        },
        format="json",
    )
    assert refused.status_code == 400
    assert not User.objects.filter(email__in=["otra@ejemplo.do", "nueva@gmail.com"]).exists()


def _invitation(tenant, email: str) -> Invitation:
    from apps.accounts.models import Role
    from apps.accounts.services import invite_user

    with company_context(tenant.company.id):
        return invite_user(
            invited_by=tenant.reg.admin,
            email=email,
            branch=tenant.branch,
            role=Role.objects.get(name="Cajero"),
            accept_url_base="https://app.cobradia.com/invitacion/",
        )


def test_an_invited_person_joins_with_google(tenant) -> None:
    invitation = _invitation(tenant, "invitada@gmail.com")
    client = APIClient()
    _google(client, "invitada@gmail.com", sub="2002")

    done = client.post(
        PROVIDER_SIGNUP,
        {
            "email": "invitada@gmail.com",
            "first_name": "Inés",
            "last_name": "Gómez",
            "invitation": invitation.token,
        },
        format="json",
    )

    assert done.status_code == 200, done.content
    user = User.objects.get(email="invitada@gmail.com")
    assert user.company_id == tenant.reg.company.id
    with company_context(tenant.reg.company.id):
        assert Membership.objects.filter(user=user, role__name="Cajero").exists()
    invitation.refresh_from_db()
    assert invitation.accepted_at is not None


def test_an_invitation_for_another_address_is_refused(tenant) -> None:
    invitation = _invitation(tenant, "invitada@gmail.com")
    client = APIClient()
    _google(client, "otra.persona@gmail.com", sub="3003")

    refused = client.post(
        PROVIDER_SIGNUP,
        {
            "email": "otra.persona@gmail.com",
            "first_name": "Otra",
            "last_name": "Persona",
            "invitation": invitation.token,
        },
        format="json",
    )

    assert refused.status_code == 400
    assert "invitada@gmail.com" in refused.content.decode()
    assert not User.objects.filter(email="otra.persona@gmail.com").exists()


def test_an_expired_invitation_is_refused(tenant) -> None:
    invitation = _invitation(tenant, "invitada@gmail.com")
    Invitation.objects.filter(pk=invitation.pk).update(expires_at=timezone.now())
    client = APIClient()
    _google(client, "invitada@gmail.com", sub="2002")
    refused = client.post(
        PROVIDER_SIGNUP,
        {
            "email": "invitada@gmail.com",
            "first_name": "Inés",
            "last_name": "Gómez",
            "invitation": invitation.token,
        },
        format="json",
    )
    assert refused.status_code == 400
