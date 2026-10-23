"""The owner's panel (decision 122): the company's file, the trial, the
plan, the managers and the plans themselves. Everything the owner does is
written in the company's own audit trail."""

import datetime as dt

import pytest
from allauth.account.models import EmailAddress
from allauth.mfa.models import Authenticator
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import DomainEvent
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.platform.models import Plan, Subscription
from apps.platform.services import RegistrationResult, register_company

COMPANIES = "/api/v1/plataforma/empresas/"
PLANS = "/api/v1/plataforma/planes/"


@pytest.fixture
def tenant(db) -> RegistrationResult:
    return register_company(
        legal_name="Financiera Uno SRL",
        trade_name="Uno",
        rnc="131234567",
        admin_email="gerente@uno.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )


@pytest.fixture
def owner(db) -> APIClient:
    user = User.objects.create_superuser("jonas@cobradia.com", "una-clave-larga-123")
    client = APIClient()
    client.force_login(user)
    return client


def _events(company: Company) -> list[str]:
    with company_context(company.id):
        return list(DomainEvent.objects.order_by("created_at").values_list("type", flat=True))


def test_the_list_searches_and_counts_users(owner, tenant) -> None:
    register_company(
        legal_name="Préstamos del Cibao SRL",
        admin_email="dueno@cibao.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Pedro",
        admin_last_name="Luna",
    )
    rows = owner.get(COMPANIES, {"search": "cibao"}).json()["results"]
    assert [row["legal_name"] for row in rows] == ["Préstamos del Cibao SRL"]
    rows = owner.get(COMPANIES, {"search": "131234567"}).json()["results"]
    assert rows[0]["trade_name"] == "Uno"
    assert rows[0]["users_count"] == 1
    assert rows[0]["trial_days_left"] == 30


def test_the_file_shows_use_managers_and_payments(owner, tenant) -> None:
    EmailAddress.objects.create(
        user=tenant.admin, email=tenant.admin.email, primary=True, verified=False
    )
    data = owner.get(f"{COMPANIES}{tenant.company.id}/").json()
    assert data["usage"]["users"] == {"used": 1, "limit": 5}
    assert data["usage"]["branches"]["used"] == 1
    manager = data["managers"][0]
    assert manager["email"] == "gerente@uno.do"
    assert manager["mfa_enabled"] is False
    assert manager["email_verified"] is False
    assert data["payments"] == []
    assert data["support"] is None
    assert data["terms_version"] == ""


def test_the_trial_can_be_extended_and_brings_a_suspended_company_back(owner, tenant) -> None:
    company = tenant.company
    company.status = Company.Status.SUSPENDED
    company.status_reason = "La prueba gratis terminó."
    company.trial_ends_on = timezone.localdate() - dt.timedelta(days=3)
    company.save()
    Subscription.objects.filter(company=company).update(status=Subscription.Status.PAST_DUE)

    response = owner.post(
        f"{COMPANIES}{company.id}/extender-prueba/",
        {"days": 15, "reason": "Pidió más tiempo para migrar"},
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["status"] == "trial"
    assert data["trial_days_left"] == 15
    assert data["subscription"]["status"] == "trial"
    assert (
        owner.post(
            f"{COMPANIES}{company.id}/extender-prueba/", {"days": 400, "reason": "x"}, format="json"
        ).status_code
        == 400
    )
    assert "platform.trial_extended" in _events(company)


def test_the_plan_changes_and_the_company_hears_of_it(owner, tenant) -> None:
    plan = Plan.objects.create(name="Profesional", monthly_price=4900, max_users=15)
    response = owner.post(
        f"{COMPANIES}{tenant.company.id}/cambiar-plan/", {"plan": str(plan.id)}, format="json"
    )
    assert response.status_code == 200, response.content
    assert response.json()["subscription"]["plan"]["name"] == "Profesional"
    assert response.json()["usage"]["users"]["limit"] == 15
    assert _events(tenant.company) == ["platform.plan_changed"]


def test_closing_cancels_the_subscription(owner, tenant) -> None:
    response = owner.post(
        f"{COMPANIES}{tenant.company.id}/cerrar/", {"reason": "Pidió la baja"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["status"] == "closed"
    assert response.json()["subscription"]["status"] == "canceled"
    assert (
        owner.post(
            f"{COMPANIES}{tenant.company.id}/extender-prueba/",
            {"days": 5, "reason": "x"},
            format="json",
        ).status_code
        == 400
    )


def test_the_owner_resets_a_managers_second_step_but_nobody_elses(
    owner, tenant, mailoutbox, django_capture_on_commit_callbacks
) -> None:
    admin = tenant.admin
    Authenticator.objects.create(user=admin, type=Authenticator.Type.TOTP, data={"secret": "A"})
    with django_capture_on_commit_callbacks(execute=True):
        response = owner.post(
            f"{COMPANIES}{tenant.company.id}/usuarios/{admin.id}/restablecer-2fa/",
            {"note": "Verifiqué su identidad por teléfono"},
            format="json",
        )
    assert response.status_code == 200, response.content
    assert response.json()["managers"][0]["mfa_enabled"] is False
    assert not Authenticator.objects.filter(user=admin).exists()
    assert mailoutbox[0].to == [admin.email]
    assert "soporte de Cobradía" in mailoutbox[0].body
    with company_context(tenant.company.id):
        event = DomainEvent.objects.get(type="account.mfa_reset")
        assert event.data["by_owner"] is True

    # A cashier is the company's business, not the owner's.
    cashier = User.objects.create_user(
        "cajera@uno.do", "una-clave-larga-123", company=tenant.company
    )
    response = owner.post(
        f"{COMPANIES}{tenant.company.id}/usuarios/{cashier.id}/restablecer-2fa/", format="json"
    )
    assert response.status_code == 400


def test_the_confirmation_mail_goes_out_again_only_while_unverified(
    owner, tenant, mailoutbox
) -> None:
    admin = tenant.admin
    url = f"{COMPANIES}{tenant.company.id}/usuarios/{admin.id}/reenviar-confirmacion/"
    assert owner.post(url).status_code == 204
    assert mailoutbox[-1].to == [admin.email]
    EmailAddress.objects.filter(user=admin).update(verified=True)
    assert owner.post(url).status_code == 400


def test_plans_are_kept_by_the_owner(owner, tenant) -> None:
    rows = owner.get(PLANS).json()
    trial = next(row for row in rows if row["is_trial"])
    assert trial["companies"] == 1

    created = owner.post(
        PLANS,
        {"name": "Esencial", "monthly_price": "2900.00", "max_users": 5, "max_branches": 1},
        format="json",
    )
    assert created.status_code == 201, created.content
    plan_id = created.json()["id"]
    edited = owner.patch(f"{PLANS}{plan_id}/", {"monthly_price": "3200.00"}, format="json")
    assert edited.json()["monthly_price"] == "3200.00"

    # Signups need one active trial plan: never two, never none.
    second = owner.post(PLANS, {"name": "Otra prueba", "is_trial": True}, format="json")
    assert second.status_code == 400
    off = owner.patch(f"{PLANS}{trial['id']}/", {"is_active": False}, format="json")
    assert off.status_code == 400

    # A plan with companies is deactivated, not deleted.
    assert owner.delete(f"{PLANS}{trial['id']}/").status_code == 400
    assert owner.delete(f"{PLANS}{plan_id}/").status_code == 204


def test_tenants_never_reach_the_plans(tenant) -> None:
    client = APIClient()
    client.force_login(tenant.admin)
    assert client.get(PLANS).status_code == 403
