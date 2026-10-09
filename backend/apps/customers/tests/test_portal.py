"""Phase 9 · P92–P93: the customer portal — invitation, one-time code and
a session that only knows one customer of one company (decision 099)."""

import datetime as dt
import re

from django.core import mail
from django.utils import timezone
from rest_framework.test import APIClient

from apps.conftest import make_customer
from apps.core.models import PublicLink
from apps.core.tenancy import company_context
from apps.customers import portal
from apps.customers.models import PortalCode
from apps.notifications.models import MessageEvent, OutboundMessage
from apps.payments.tests.test_payments import make_loan, pay

PORTAL = "/api/v1/publico/portal"


def with_email(tenant, customer=None, email="maria@correo.do"):
    customer = customer or tenant.customer
    with company_context(tenant.company.id):
        customer.email = email
        customer.save()
    return customer


def invite(tenant, capture, customer=None, who="cajero") -> str:
    customer = customer or tenant.customer
    with capture(execute=True):
        response = tenant.client(who).post(f"/api/v1/clientes/{customer.id}/portal/")
    assert response.status_code == 201, response.content
    return response.json()["link"].split("?t=")[1]


def ask_code(client: APIClient, token: str, capture):
    with capture(execute=True):
        return client.post(f"{PORTAL}/codigo/", {"token": token}, format="json")


def last_code() -> str:
    return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)


def enter(tenant, capture, customer=None) -> APIClient:
    token = invite(tenant, capture, customer)
    visitor = APIClient()
    assert ask_code(visitor, token, capture).status_code == 200
    response = visitor.post(f"{PORTAL}/entrar/", {"token": token, "code": last_code()})
    assert response.status_code == 200, response.content
    return visitor


def test_invited_customer_enters_with_a_code_and_sees_their_loan(
    tenant, django_capture_on_commit_callbacks
) -> None:
    capture = django_capture_on_commit_callbacks
    with_email(tenant)
    loan = make_loan(tenant, first_due_in=0)
    with capture(execute=True):
        pay(tenant, loan, "350")
    token = invite(tenant, capture)
    assert "/portal/entrar?t=" in mail.outbox[-1].body

    visitor = APIClient()
    sent = ask_code(visitor, token, capture).json()
    # Only what really delivers: WhatsApp without a provider is not offered.
    assert sent == {"customer": "María", "sent_to": ["ma•••@correo.do"]}
    code = last_code()
    with company_context(tenant.company.id):
        recorded = OutboundMessage.objects.filter(event=MessageEvent.PORTAL_CODE)
        assert recorded.exists()
        assert all(code not in m.body and "••••••" in m.body for m in recorded)

    wrong = visitor.post(f"{PORTAL}/entrar/", {"token": token, "code": "000000"})
    assert (wrong.status_code, wrong.json()["code"]) == (400, "code")
    assert visitor.get(f"{PORTAL}/yo/").status_code == 401
    ok = visitor.post(f"{PORTAL}/entrar/", {"token": token, "code": code})
    assert ok.json() == {"customer": "María Gómez"}

    me = visitor.get(f"{PORTAL}/yo/").json()
    assert [row["number"] for row in me["loans"]] == [loan.number]
    detail = visitor.get(f"{PORTAL}/prestamos/{loan.number}/").json()
    assert len(detail["installments"]) == 4
    assert detail["payments"][0]["amount"] == "350.00"
    assert detail["payments"][0]["receipt_path"].startswith("/r/")
    pdf = visitor.get(f"{PORTAL}/prestamos/{loan.number}/estado-de-cuenta/")
    assert (pdf.status_code, pdf["Content-Type"]) == (200, "application/pdf")

    # The code works once; leaving ends the session.
    again = visitor.post(f"{PORTAL}/entrar/", {"token": token, "code": code})
    assert again.json()["code"] == "expired"
    assert visitor.post(f"{PORTAL}/salir/").status_code == 204
    assert visitor.get(f"{PORTAL}/yo/").status_code == 401


def test_codes_are_limited_in_time_tries_and_frequency(
    tenant, django_capture_on_commit_callbacks
) -> None:
    capture = django_capture_on_commit_callbacks
    with_email(tenant)
    token = invite(tenant, capture)
    visitor = APIClient()
    ask_code(visitor, token, capture)
    assert ask_code(visitor, token, capture).json()["code"] == "wait"

    for _ in range(portal.MAX_TRIES):
        visitor.post(f"{PORTAL}/entrar/", {"token": token, "code": "000000"})
    blocked = visitor.post(f"{PORTAL}/entrar/", {"token": token, "code": last_code()})
    assert blocked.json()["code"] == "tries"

    with company_context(tenant.company.id):
        PortalCode.objects.update(created_at=timezone.now() - dt.timedelta(minutes=2))
    ask_code(visitor, token, capture)
    with company_context(tenant.company.id):
        PortalCode.objects.filter(used_at__isnull=True).update(expires_at=timezone.now())
    late = visitor.post(f"{PORTAL}/entrar/", {"token": token, "code": last_code()})
    assert late.json()["code"] == "expired"

    # A daily cap per invitation: each code costs a message.
    a_while_ago = timezone.now() - dt.timedelta(minutes=5)
    PublicLink.objects.filter(token=token).update(created_at=a_while_ago - dt.timedelta(hours=1))
    with company_context(tenant.company.id):
        PortalCode.objects.update(created_at=a_while_ago)
        for _ in range(portal.CODES_PER_DAY - PortalCode.objects.count()):
            PortalCode.objects.create(
                company_id=tenant.company.id,
                customer=tenant.customer,
                code_hash="-",
                expires_at=a_while_ago,
            )
        PortalCode.objects.update(created_at=a_while_ago)
    assert ask_code(visitor, token, capture).json()["code"] == "limit"
    # A new invitation from the staff starts the count again.
    assert ask_code(visitor, invite(tenant, capture), capture).status_code == 200


def test_the_link_can_be_revoked_and_needs_a_way_to_reach_the_customer(
    tenant, django_capture_on_commit_callbacks
) -> None:
    capture = django_capture_on_commit_callbacks
    token = invite(tenant, capture)
    visitor = APIClient()
    # No e-mail and WhatsApp without a provider: nothing would arrive.
    unreachable = ask_code(visitor, token, capture).json()
    assert unreachable["code"] == "unreachable"
    with company_context(tenant.company.id):
        assert not PortalCode.objects.exists()  # so a retry need not wait

    with_email(tenant)
    newer = invite(tenant, capture)
    assert ask_code(visitor, token, capture).json()["code"] == "invitation"
    assert ask_code(visitor, newer, capture).status_code == 200
    file = f"/api/v1/clientes/{tenant.customer.id}/mensajes/"
    assert tenant.client("oficial").get(file).json()["portal_since"] is not None
    gone = tenant.client("gerente").delete(f"/api/v1/clientes/{tenant.customer.id}/portal/")
    assert gone.status_code == 204
    assert tenant.client("oficial").get(file).json()["portal_since"] is None
    assert ask_code(visitor, newer, capture).json()["code"] == "invitation"
    assert tenant.client("cobrador").post(
        f"/api/v1/clientes/{tenant.customer.id}/portal/"
    ).status_code in (403, 404)


def test_the_portal_only_shows_the_customers_own_loans(
    tenant, other_tenant, django_capture_on_commit_callbacks
) -> None:
    capture = django_capture_on_commit_callbacks
    loan = make_loan(tenant, first_due_in=0)
    with company_context(tenant.company.id):
        neighbor = make_customer(tenant.company, tenant.branch, "00212345672", "Pedro")
    with_email(tenant, neighbor, "pedro@correo.do")
    visitor = enter(tenant, capture, neighbor)
    assert visitor.get(f"{PORTAL}/yo/").json()["loans"] == []
    assert visitor.get(f"{PORTAL}/prestamos/{loan.number}/").status_code == 404
    assert visitor.get(f"{PORTAL}/prestamos/{loan.number}/estado-de-cuenta/").status_code == 404

    # Another company's staff cannot invite this customer, and a staff
    # session is not a portal session.
    stranger = other_tenant.client("gerente")
    assert stranger.post(f"/api/v1/clientes/{tenant.customer.id}/portal/").status_code == 404
    assert tenant.client("gerente").get(f"{PORTAL}/yo/").status_code == 401


def test_the_portal_session_ends_after_thirty_idle_minutes(
    tenant, django_capture_on_commit_callbacks
) -> None:
    with_email(tenant)
    visitor = enter(tenant, django_capture_on_commit_callbacks)
    assert visitor.get(f"{PORTAL}/yo/").status_code == 200
    session = visitor.session
    data = session[portal.SESSION_KEY]
    data["seen"] -= portal.IDLE_SECONDS + 1
    session[portal.SESSION_KEY] = data
    session.save()
    assert visitor.get(f"{PORTAL}/yo/").status_code == 401


def test_the_portal_checks_csrf(tenant, django_capture_on_commit_callbacks) -> None:
    token = invite(tenant, django_capture_on_commit_callbacks)
    forged = APIClient(enforce_csrf_checks=True).post(
        f"{PORTAL}/codigo/", {"token": token}, format="json"
    )
    assert forged.status_code == 403
    assert "CSRF" in forged.json()["detail"]
