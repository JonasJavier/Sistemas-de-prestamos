"""F19 (decision 104): plan limits, end-of-trial notices and the owner's
notice of each signup."""

import datetime as dt

from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Role, User
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.lending.tests.test_disbursement import _approved, _disburse
from apps.payments.tests.test_payments import make_loan
from apps.platform.models import Plan, Subscription
from apps.platform.services import register_company
from apps.platform.tasks import warn_trials


def _signup(email="ana@limites.do"):
    reg = register_company(
        legal_name="Financiera Límites SRL",
        admin_email=email,
        admin_password="una-clave-larga-123",
        admin_first_name="Ana",
        admin_last_name="Pérez",
    )
    client = APIClient()
    client.force_login(reg.admin)
    return reg, client


def test_the_trial_plan_caps_branches_and_users(db) -> None:
    reg, client = _signup()
    branch = client.post(
        "/api/v1/sucursales/", {"code": "02", "name": "Norte", "address": "Calle 1"}, format="json"
    )
    assert branch.status_code == 400
    assert "1 sucursales activas" in branch.json()["detail"]

    with company_context(reg.company.id):
        role = str(Role.objects.get(name="Cajero").id)
    invite = {"branch": str(reg.branch.id), "role": role}
    for number in range(4):  # the administrator plus four = the trial's five
        response = client.post(
            "/api/v1/invitaciones/", {**invite, "email": f"u{number}@limites.do"}, format="json"
        )
        assert response.status_code == 201, response.content
    sixth = client.post(
        "/api/v1/invitaciones/", {**invite, "email": "u9@limites.do"}, format="json"
    )
    assert sixth.status_code == 400
    assert "5 usuarios activos" in str(sixth.json())

    usage = client.get("/api/v1/mi-empresa/").json()["usage"]
    assert usage == {"users": 5, "branches": 1, "active_loans": 0}

    # A plan without caps lets the company grow.
    Subscription.objects.filter(company=reg.company).update(
        plan=Plan.objects.create(name="Crece", monthly_price=2500)
    )
    assert (
        client.post(
            "/api/v1/sucursales/",
            {"code": "02", "name": "Norte", "address": "Calle 1"},
            format="json",
        ).status_code
        == 201
    )


def test_the_plan_caps_active_loans(tenant) -> None:
    make_loan(tenant, first_due_in=0)
    plan = Plan.objects.create(name="Pequeño", monthly_price=1000, max_active_loans=1)
    Subscription.objects.filter(company=tenant.company).update(plan=plan)
    second = _disburse(tenant, _approved(tenant))
    assert second.status_code == 400
    assert "1 préstamos activos" in second.json()["detail"]


def test_trial_notices_go_out_seven_three_and_one_day_before(db) -> None:
    reg, _ = _signup()
    today = timezone.localdate()
    company = Company.objects.get(pk=reg.company.id)

    for left, sends in ((10, 0), (7, 1), (5, 0), (3, 1), (1, 1)):
        Company.objects.filter(pk=company.pk).update(
            trial_ends_on=today + dt.timedelta(days=left), trial_warned_on=None
        )
        mail.outbox.clear()
        assert warn_trials() == sends
        if sends:
            assert mail.outbox[0].to == ["ana@limites.do"]
            assert ("mañana" if left == 1 else f"en {left} días") in mail.outbox[0].subject
    mail.outbox.clear()
    assert warn_trials() == 0  # once a day


def test_the_owner_hears_of_each_signup(db, django_capture_on_commit_callbacks) -> None:
    User.objects.create_superuser("jonas@cobradia.do", "una-clave-larga-123")
    with django_capture_on_commit_callbacks(execute=True):
        response = APIClient().post(
            "/api/v1/registro/",
            {
                "company_legal_name": "Financiera Avisada SRL",
                "first_name": "Rosa",
                "last_name": "Mejía",
                "email": "rosa@avisada.do",
                "password": "una-clave-larga-123",
                "accept_terms": True,
            },
            format="json",
        )
    assert response.status_code == 201, response.content
    owner = [m for m in mail.outbox if m.to == ["jonas@cobradia.do"]]
    assert owner and "Financiera Avisada SRL" in owner[0].subject
