"""Mi cuenta: a user corrects their own name; the change lands in the audit
trail and the email (how they sign in) stays (decision 117)."""

from apps.audit.models import DomainEvent
from apps.core.tenancy import company_context

ME = "/api/v1/yo/"


def test_the_user_edits_their_name_and_it_is_audited(tenant) -> None:
    user = tenant.users["cajero"]
    client = tenant.client("cajero")

    response = client.patch(ME, {"first_name": "  Ana ", "last_name": "Pérez"}, format="json")

    assert response.status_code == 200, response.content
    body = response.json()
    assert (body["first_name"], body["last_name"]) == ("Ana", "Pérez")
    assert "roles" in body  # the same answer as reading /yo/
    user.refresh_from_db()
    assert user.get_full_name() == "Ana Pérez"
    with company_context(tenant.reg.company.id):
        event = DomainEvent.objects.get(type="account.profile", target_id=user.pk)
    assert event.actor_id == user.pk
    assert event.data["after"] == "Ana Pérez"


def test_the_first_name_cannot_be_left_blank(tenant) -> None:
    response = tenant.client("cajero").patch(ME, {"first_name": "  "}, format="json")
    assert response.status_code == 400
    assert "first_name" in response.json()


def test_only_the_name_can_change(tenant) -> None:
    user = tenant.users["cajero"]
    email = user.email
    response = tenant.client("cajero").patch(
        ME,
        {"first_name": "Ana", "email": "otra@uno.do", "is_platform_admin": True},
        format="json",
    )
    assert response.status_code == 200
    user.refresh_from_db()
    assert user.email == email
    assert user.is_platform_admin is False


def test_saving_the_same_name_records_nothing(tenant) -> None:
    user = tenant.users["cajero"]
    client = tenant.client("cajero")
    client.patch(ME, {"first_name": user.first_name, "last_name": user.last_name}, format="json")
    with company_context(tenant.reg.company.id):
        assert not DomainEvent.objects.filter(type="account.profile").exists()
