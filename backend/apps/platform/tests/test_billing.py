"""Decision 125: the subscription paid by transfer with a receipt."""

import datetime as dt
import io

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.platform import billing
from apps.platform.models import BankAccount, PaymentProof, Plan, Subscription
from apps.platform.services import RegistrationResult, register_company

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture
def tenant(db) -> RegistrationResult:
    call_command("seed_plans")
    BankAccount.objects.create(
        bank="Banreservas", type="savings", number="9606428091", holder="Jonas Javier Encarnación"
    )
    return register_company(
        legal_name="Financiera Uno SRL",
        admin_email="gerente@uno.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )


@pytest.fixture
def manager(tenant) -> APIClient:
    client = APIClient()
    client.force_login(tenant.admin)
    return client


@pytest.fixture
def owner(db) -> APIClient:
    user = User.objects.create_superuser("jonas@cobradia.com", "una-clave-larga-123")
    client = APIClient()
    client.force_login(user)
    return client


def _send(manager: APIClient, period="monthly", amount="2290.00"):
    plan = Plan.objects.get(name="Profesional")
    return manager.post(
        "/api/v1/mi-empresa/pago/comprobantes/",
        {
            "plan": str(plan.id),
            "period": period,
            "amount": amount,
            "reference": "TRX-123",
            "file": io.BytesIO(PNG),
        },
        format="multipart",
    )


def test_months_add_up_at_month_ends() -> None:
    assert billing.add_months(dt.date(2026, 1, 31), 1) == dt.date(2026, 2, 28)
    assert billing.add_months(dt.date(2026, 10, 25), 12) == dt.date(2027, 10, 25)
    assert billing.expected_amount(Plan.objects.none().model(monthly_price=990), "annual") == 9900


def test_the_company_sees_the_accounts_and_sends_a_receipt(
    manager, mailoutbox, owner, django_capture_on_commit_callbacks
) -> None:
    data = manager.get("/api/v1/mi-empresa/pago/").json()
    assert data["accounts"][0]["number"] == "9606428091"
    assert data["proofs"] == []
    with django_capture_on_commit_callbacks(execute=True):
        response = _send(manager)
    assert response.status_code == 201, response.content
    assert response.json()["status"] == "pending"
    assert response.json()["plan_name"] == "Profesional"
    assert mailoutbox[-1].to == ["jonas@cobradia.com"]
    assert "Financiera Uno SRL" in mailoutbox[-1].subject
    # Only one pending receipt at a time.
    assert _send(manager).status_code == 400
    # The company can open its own file; another company cannot.
    proof_id = response.json()["id"]
    assert (
        manager.get(f"/api/v1/mi-empresa/pago/comprobantes/{proof_id}/archivo/").status_code == 200
    )


def test_the_owner_confirms_and_the_plan_activates(
    manager, owner, tenant, mailoutbox, django_capture_on_commit_callbacks
) -> None:
    proof_id = _send(manager, period="annual", amount="22900.00").json()["id"]
    pending = owner.get("/api/v1/plataforma/comprobantes/", {"status": "pending"}).json()
    assert pending["results"][0]["id"] == proof_id
    assert owner.get("/api/v1/plataforma/tablero/").json()["pending_proofs"][0]["id"] == proof_id

    with django_capture_on_commit_callbacks(execute=True):
        response = owner.post(f"/api/v1/plataforma/comprobantes/{proof_id}/confirmar/")
    assert response.status_code == 200, response.content
    assert response.json()["status"] == "confirmed"
    subscription = Subscription.objects.select_related("plan").get(company=tenant.company)
    today = timezone.localdate()
    assert subscription.plan.name == "Profesional"
    assert subscription.status == "active"
    assert subscription.paid_until == billing.add_months(today, 12) - dt.timedelta(days=1)
    tenant.company.refresh_from_db()
    assert tenant.company.status == "active"
    assert mailoutbox[-1].to == ["gerente@uno.do"]
    assert "confirmado" in mailoutbox[-1].subject
    # Twice is refused.
    assert owner.post(f"/api/v1/plataforma/comprobantes/{proof_id}/confirmar/").status_code == 400
    # The company's file and the team screen now say so.
    mine = manager.get("/api/v1/mi-empresa/pago/").json()["proofs"][0]
    assert mine["status"] == "confirmed"
    assert (
        manager.get("/api/v1/mi-empresa/").json()["subscription"]["plan"]["name"] == "Profesional"
    )


def test_a_second_payment_extends_the_paid_period(manager, owner, tenant) -> None:
    subscription = Subscription.objects.get(company=tenant.company)
    subscription.paid_until = timezone.localdate() + dt.timedelta(days=10)
    subscription.save()
    proof_id = _send(manager).json()["id"]
    owner.post(f"/api/v1/plataforma/comprobantes/{proof_id}/confirmar/")
    subscription.refresh_from_db()
    start = timezone.localdate() + dt.timedelta(days=11)
    assert subscription.paid_until == billing.add_months(start, 1) - dt.timedelta(days=1)


def test_the_owner_rejects_with_a_reason(
    manager, owner, mailoutbox, django_capture_on_commit_callbacks
) -> None:
    proof_id = _send(manager).json()["id"]
    assert (
        owner.post(
            f"/api/v1/plataforma/comprobantes/{proof_id}/rechazar/", {"reason": ""}
        ).status_code
        == 400
    )
    with django_capture_on_commit_callbacks(execute=True):
        response = owner.post(
            f"/api/v1/plataforma/comprobantes/{proof_id}/rechazar/",
            {"reason": "El monto no coincide con el plan"},
            format="json",
        )
    assert response.json()["status"] == "rejected"
    assert "monto no coincide" in mailoutbox[-1].body
    # The company may send another one now.
    assert _send(manager).status_code == 201
    assert PaymentProof.objects.filter(status="pending").count() == 1


def test_only_managers_pay_and_only_the_owner_confirms(tenant, manager, owner) -> None:
    proof_id = _send(manager).json()["id"]
    assert manager.post(f"/api/v1/plataforma/comprobantes/{proof_id}/confirmar/").status_code == 403
    assert manager.get("/api/v1/plataforma/cuentas-bancarias/").status_code == 403
    cashier = User.objects.create_user(
        "cajera@uno.do", "una-clave-larga-123", company=tenant.company
    )
    client = APIClient()
    client.force_login(cashier)
    assert client.get("/api/v1/mi-empresa/pago/").status_code == 403


def test_the_owner_keeps_the_bank_accounts(owner, tenant) -> None:
    created = owner.post(
        "/api/v1/plataforma/cuentas-bancarias/",
        {
            "bank": "Banco Popular",
            "type": "checking",
            "number": "859481582",
            "holder": "Jonas Javier Encarnación",
            "position": 1,
        },
        format="json",
    )
    assert created.status_code == 201
    rows = owner.get("/api/v1/plataforma/cuentas-bancarias/").json()
    assert [r["bank"] for r in rows] == ["Banreservas", "Banco Popular"]
