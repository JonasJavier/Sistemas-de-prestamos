import datetime as dt

import pytest
from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Membership, Role, User
from apps.core.models import Branch, Holiday, Reason
from apps.core.tenancy import company_context
from apps.platform.models import Subscription
from apps.platform.services import TRIAL_DAYS, register_company


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


def _register(**overrides):
    data = {
        "legal_name": "Financiera Nueva SRL",
        "admin_email": "ana@nueva.do",
        "admin_password": "una-clave-larga-123",
        "admin_first_name": "Ana",
        "admin_last_name": "Pérez",
    }
    data.update(overrides)
    return register_company(**data)


def test_service_creates_a_working_tenant(db) -> None:
    result = _register()
    company = result.company

    assert company.status == company.Status.TRIAL
    assert company.trial_ends_on == timezone.localdate() + dt.timedelta(days=TRIAL_DAYS)

    subscription = Subscription.objects.get(company=company)
    assert subscription.status == Subscription.Status.TRIAL
    assert subscription.plan.is_trial

    assert result.admin.company == company
    assert not result.admin.is_platform_admin

    with company_context(company.id):
        branch = Branch.objects.get()
        assert branch.code == "01"
        assert Role.objects.filter(is_system=True).count() == 8
        roles = set(
            Membership.objects.filter(user=result.admin).values_list("role__name", flat=True)
        )
        assert roles == {"Gerente", "Administrador"}
        assert Holiday.objects.count() == 18  # 9 per year, two years
        assert Holiday.objects.filter(is_confirmed=False).count() == 10
        assert Reason.objects.count() == 11


def test_two_registrations_are_isolated(db) -> None:
    first = _register()
    second = _register(
        legal_name="Financiera Dos SRL", admin_email="luis@dos.do"
    )
    with company_context(first.company.id):
        assert Branch.objects.count() == 1
        assert Role.objects.count() == 8
    with company_context(second.company.id):
        assert Branch.objects.get().company_id == second.company.id


def test_registration_api_creates_company_and_sends_confirmation(
    db, api_client: APIClient
) -> None:
    response = api_client.post(
        "/api/v1/registro/",
        {
            "company_legal_name": "Financiera API SRL",
            "first_name": "Rosa",
            "last_name": "Mejía",
            "email": "rosa@api.do",
            "password": "una-clave-larga-123",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    user = User.objects.get(email="rosa@api.do")
    assert user.company is not None
    assert len(mail.outbox) == 1  # email confirmation


def test_registration_api_rejects_duplicate_email(db, api_client: APIClient) -> None:
    _register(admin_email="repetido@x.do")
    response = api_client.post(
        "/api/v1/registro/",
        {
            "company_legal_name": "Otra SRL",
            "first_name": "X",
            "last_name": "Y",
            "email": "repetido@x.do",
            "password": "una-clave-larga-123",
        },
        format="json",
    )
    assert response.status_code == 400


def test_trial_expiry_suspends_company(db) -> None:
    from apps.platform.tasks import expire_trials

    result = _register()
    company = result.company
    company.trial_ends_on = timezone.localdate() - dt.timedelta(days=1)
    company.save(update_fields=["trial_ends_on"])

    assert expire_trials() == 1
    company.refresh_from_db()
    assert company.status == company.Status.SUSPENDED
    assert Subscription.objects.get(company=company).status == Subscription.Status.PAST_DUE
