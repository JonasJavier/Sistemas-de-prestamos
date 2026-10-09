"""Mi cuenta: a user changes their password knowing the current one, and the
change lands in the audit trail (doc 06 §9)."""

from rest_framework.test import APIClient

from apps.audit.models import DomainEvent
from apps.core.tenancy import company_context

LOGIN = "/api/v1/auth/browser/v1/auth/login"
CHANGE = "/api/v1/auth/browser/v1/account/password/change"
PASSWORD = "una-clave-larga-123"


def _login(email: str, password: str = PASSWORD) -> APIClient:
    client = APIClient()
    response = client.post(LOGIN, {"email": email, "password": password}, format="json")
    assert response.status_code == 200, response.content
    return client


def test_password_change_needs_the_current_one_and_is_audited(tenant) -> None:
    from allauth.account.models import EmailAddress

    user = tenant.users["cajero"]
    EmailAddress.objects.create(user=user, email=user.email, primary=True, verified=True)
    client = _login(user.email)

    wrong = client.post(
        CHANGE,
        {"current_password": "no-es-esta", "new_password": "otra-clave-larga-456"},
        format="json",
    )
    assert wrong.status_code == 400

    done = client.post(
        CHANGE,
        {"current_password": PASSWORD, "new_password": "otra-clave-larga-456"},
        format="json",
    )
    assert done.status_code == 200, done.content
    assert client.get("/api/v1/yo/").status_code == 200  # the session stays open
    _login(user.email, "otra-clave-larga-456")
    with company_context(tenant.reg.company.id):
        event = DomainEvent.objects.get(type="account.password", target_id=user.pk)
    assert event.actor_id == user.pk
