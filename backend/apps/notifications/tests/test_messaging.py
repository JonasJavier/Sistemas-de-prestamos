"""Phase 9 · F18: templates, the record of every message, opt-outs and the
providers (decision 097)."""

import io
import json
import urllib.error
from unittest import mock

from django.core import mail
from django.test import override_settings
from django.utils import timezone

from apps.core.tenancy import company_context
from apps.notifications.models import MessageEvent, MessageTemplate, OutboundMessage
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import make_loan, pay


def with_email(tenant) -> None:
    with company_context(tenant.company.id):
        tenant.customer.email = "maria@correo.do"
        tenant.customer.save()


def messages(tenant, **filters):
    with company_context(tenant.company.id):
        return list(OutboundMessage.objects.filter(**filters).order_by("created_at"))


def test_templates_start_with_email_on(tenant) -> None:
    data = tenant.client("gerente").get("/api/v1/mensajes/plantillas/").json()
    templates = data["templates"]
    assert len(templates) == 18  # 6 events × 3 channels
    on = {(t["event"], t["channel"]) for t in templates if t["is_active"]}
    assert ("payment", "email") in on and ("payment", "whatsapp") not in on
    assert ("portal_code", "whatsapp") in on
    assert data["providers"]["whatsapp"] == {"provider": "registro", "ready": False}
    assert tenant.client("cajero").get("/api/v1/mensajes/plantillas/").status_code == 403


def test_a_payment_sends_its_confirmation_and_respects_opt_outs(
    tenant, django_capture_on_commit_callbacks
) -> None:
    with_email(tenant)
    loan = make_loan(tenant, first_due_in=0)
    with django_capture_on_commit_callbacks(execute=True):
        payment = pay(tenant, loan, "350")
    sent = messages(tenant, event=MessageEvent.PAYMENT)
    assert [(m.channel, m.status, m.provider) for m in sent] == [("email", "sent", "correo")]
    assert f"/r/{payment.receipt_token}" in sent[0].body
    assert mail.outbox[-1].to == ["maria@correo.do"]

    # WhatsApp on, without a provider: recorded, not sent.
    manager = tenant.client("gerente")
    with company_context(tenant.company.id):
        whatsapp = MessageTemplate.objects.get(event="payment", channel="whatsapp")
    manager.patch(f"/api/v1/mensajes/plantillas/{whatsapp.id}/", {"is_active": True}, format="json")
    with django_capture_on_commit_callbacks(execute=True):
        pay(tenant, loan, "350")
    last = messages(tenant, event=MessageEvent.PAYMENT, channel="whatsapp")[-1]
    assert (last.status, last.to) == ("logged", "+18095551234")

    # The customer asks not to be written to: recorded as not sent, with why.
    assert (
        tenant.client("cajero")
        .post(f"/api/v1/clientes/{tenant.customer.id}/bajas/", {"channel": ""}, format="json")
        .status_code
        == 201
    )
    with django_capture_on_commit_callbacks(execute=True):
        pay(tenant, loan, "350")
    skipped = messages(tenant, event=MessageEvent.PAYMENT)[-2:]
    assert {m.status for m in skipped} == {"skipped"}
    assert skipped[0].error == "El cliente pidió no recibir mensajes"
    listed = tenant.client("oficial").get(f"/api/v1/clientes/{tenant.customer.id}/mensajes/").json()
    assert listed["opt_outs"][0]["channel_label"] == "Todos"


def test_test_messages_arrive_and_are_recorded(tenant, django_capture_on_commit_callbacks) -> None:
    manager = tenant.client("gerente")
    with django_capture_on_commit_callbacks(execute=True):
        email = manager.post(
            "/api/v1/mensajes/prueba/",
            {"channel": "email", "to": "jonas@cobradia.do"},
            format="json",
        )
    assert email.status_code == 201
    assert mail.outbox[-1].to == ["jonas@cobradia.do"]
    with django_capture_on_commit_callbacks(execute=True):
        whatsapp = manager.post(
            "/api/v1/mensajes/prueba/", {"channel": "whatsapp", "to": "809-555-1234"}, format="json"
        )
    assert whatsapp.json()["to"] == "+18095551234"
    log = manager.get("/api/v1/mensajes/").json()
    assert {row["status"] for row in log["results"]} == {"sent", "logged"}


def test_the_night_reminds_and_warns_once(tenant, django_capture_on_commit_callbacks) -> None:
    with_email(tenant)
    make_loan(tenant, first_due_in=1)  # due tomorrow
    make_loan(tenant, first_due_in=-3)  # three days late
    today = timezone.localdate()
    with company_context(tenant.company.id), django_capture_on_commit_callbacks(execute=True):
        first = run_nightly(tenant.company.id, today)
        again = run_nightly(tenant.company.id, today)
    assert (first["reminders"], first["overdue_notices"]) == (1, 1)
    assert (again["reminders"], again["overdue_notices"]) == (0, 0)
    assert len(messages(tenant, event=MessageEvent.REMINDER, channel="email")) == 1


TWILIO = {
    "MESSAGING_PROVIDERS": {"whatsapp": "twilio", "sms": "registro"},
    "TWILIO_ACCOUNT_SID": "AC123",
    "TWILIO_AUTH_TOKEN": "secret",
    "TWILIO_FROM_WHATSAPP": "+18095550000",
}


@override_settings(**TWILIO)
def test_the_whatsapp_provider_once_contracted(tenant, django_capture_on_commit_callbacks) -> None:
    manager = tenant.client("gerente")
    answer = mock.MagicMock()
    answer.__enter__.return_value.read.return_value = json.dumps({"sid": "SM1"}).encode()
    with (
        mock.patch("apps.notifications.providers.urllib.request.urlopen", return_value=answer),
        django_capture_on_commit_callbacks(execute=True),
    ):
        ok = manager.post(
            "/api/v1/mensajes/prueba/", {"channel": "whatsapp", "to": "8095551234"}, format="json"
        )
    assert ok.status_code == 201
    sent = messages(tenant, channel="whatsapp")[-1]
    assert (sent.status, sent.provider, sent.provider_ref) == ("sent", "twilio", "SM1")
    refused = urllib.error.HTTPError("u", 400, "Bad", {}, io.BytesIO(b'{"message":"bad number"}'))
    with (
        mock.patch("apps.notifications.providers.urllib.request.urlopen", side_effect=refused),
        django_capture_on_commit_callbacks(execute=True),
    ):
        failed = manager.post(
            "/api/v1/mensajes/prueba/", {"channel": "whatsapp", "to": "8095551234"}, format="json"
        )
    assert failed.status_code == 201
    last = messages(tenant, channel="whatsapp")[-1]
    assert last.status == "failed" and "bad number" in last.error


def test_messages_never_cross_companies(tenant, other_tenant, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        tenant.client("gerente").post(
            "/api/v1/mensajes/prueba/", {"channel": "email", "to": "a@b.do"}, format="json"
        )
    assert other_tenant.client("gerente").get("/api/v1/mensajes/").json()["count"] == 0
    stranger = other_tenant.client("gerente")
    assert stranger.get(f"/api/v1/clientes/{tenant.customer.id}/mensajes/").status_code == 404
