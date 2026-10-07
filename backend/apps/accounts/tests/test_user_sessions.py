"""Doc 06 - 6: a user sees their open sessions and can close the others."""

from rest_framework.test import APIClient

LOGIN = "/api/v1/auth/browser/v1/auth/login"
SESSIONS = "/api/v1/auth/browser/v1/auth/sessions"


def _login(email: str) -> APIClient:
    client = APIClient()
    credentials = {"email": email, "password": "una-clave-larga-123"}
    response = client.post(LOGIN, credentials, format="json")
    assert response.status_code == 200, response.content
    return client


def test_user_lists_sessions_and_closes_the_other_one(tenant) -> None:
    from allauth.account.models import EmailAddress

    user = tenant.users["cajero"]
    EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    laptop = _login(user.email)
    phone = _login(user.email)

    sessions = laptop.get(SESSIONS).json()["data"]
    assert len(sessions) == 2
    other = next(session for session in sessions if not session["is_current"])

    remaining = laptop.delete(SESSIONS, {"sessions": [other["id"]]}, format="json").json()["data"]
    assert [session["is_current"] for session in remaining] == [True]
    assert phone.get("/api/v1/yo/").status_code == 401
    assert laptop.get("/api/v1/yo/").status_code == 200
