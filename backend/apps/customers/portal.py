"""P92–P93 · Portal del cliente (decision 099).

Staff invite the customer with a personal, revocable link. From it the
customer asks for a one-time code, sent to the e-mail or phone on file
(never to an address typed by the visitor), and enters with it. The portal
session is not a staff session: it lives in its own key of the session,
knows one customer of one company, and ends after 30 minutes idle.
"""

import datetime as dt
import secrets

from django.contrib.auth.hashers import check_password, make_password
from django.utils import timezone

from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import PublicLink
from apps.core.tenancy import company_context
from apps.customers.models import Customer, PortalCode

SESSION_KEY = "cobradia_portal"
CODE_MINUTES = 10
MAX_TRIES = 5
RESEND_SECONDS = 60  # each code costs a message: no bursts…
CODES_PER_DAY = 10  # …and a daily cap per customer
IDLE_SECONDS = 30 * 60
TOUCH_SECONDS = 60


class PortalError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def invite(*, customer: Customer, user: User) -> PublicLink:
    """A new personal link (the old one stops working) and the invitation."""
    from apps.core.qr import public_url
    from apps.notifications import messaging
    from apps.notifications.models import MessageEvent

    PublicLink.objects.filter(
        kind=PublicLink.Kind.PORTAL, object_id=customer.id, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())
    link = PublicLink.objects.create(
        token=secrets.token_urlsafe(24),
        tenant=customer.company_id,
        kind=PublicLink.Kind.PORTAL,
        object_id=customer.id,
    )
    messaging.send(
        event=MessageEvent.PORTAL_INVITE,
        customer=customer,
        context={"enlace": public_url(f"/portal/entrar?t={link.token}")},
        created_by=user,
    )
    record_event(
        company_id=customer.company_id,
        type="customer.portal_invited",
        target=customer,
        actor=user,
        summary="Invitado al portal de clientes",
    )
    return link


def revoke(*, customer: Customer, user: User) -> int:
    revoked = PublicLink.objects.filter(
        kind=PublicLink.Kind.PORTAL, object_id=customer.id, revoked_at__isnull=True
    ).update(revoked_at=timezone.now())
    if revoked:
        record_event(
            company_id=customer.company_id,
            type="customer.portal_revoked",
            target=customer,
            actor=user,
            summary="Acceso al portal revocado",
        )
    return revoked


def _link(token: str) -> PublicLink:
    link = PublicLink.objects.filter(
        token=token, kind=PublicLink.Kind.PORTAL, revoked_at__isnull=True
    ).first()
    if link is None:
        raise PortalError("Esta invitación no existe o ya no es válida. Pide otra.", "invitation")
    return link


def _mask(value: str, channel: str) -> str:
    if channel == "email" and "@" in value:
        name, domain = value.split("@", 1)
        return f"{name[:2]}•••@{domain}"
    return f"•••{value[-4:]}" if value else ""


def request_code(token: str) -> dict:
    """Send a new code to what the company has on file for the customer."""
    from apps.notifications import messaging, providers
    from apps.notifications.models import MessageEvent, OutboundMessage

    link = _link(token)
    with company_context(link.tenant):
        customer = Customer.objects.get(pk=link.object_id)
        now = timezone.now()
        # Counted per invitation: a new one from the staff starts afresh.
        recent = PortalCode.objects.filter(
            customer=customer,
            created_at__gte=max(now - dt.timedelta(days=1), link.created_at),
        ).values_list("created_at", flat=True)
        if any(created > now - dt.timedelta(seconds=RESEND_SECONDS) for created in recent):
            raise PortalError("Ya te enviamos un código: espera un minuto para pedir otro.", "wait")
        if len(recent) >= CODES_PER_DAY:
            raise PortalError(
                "Pediste demasiados códigos hoy. Inténtalo mañana o llama a la financiera.",
                "limit",
            )
        code = f"{secrets.randbelow(1_000_000):06d}"
        PortalCode.objects.filter(customer=customer, used_at__isnull=True).update(
            used_at=timezone.now()
        )
        pending = PortalCode.objects.create(
            company_id=customer.company_id,
            customer=customer,
            code_hash=make_password(code),
            expires_at=timezone.now() + dt.timedelta(minutes=CODE_MINUTES),
        )
        sent = messaging.send(
            event=MessageEvent.PORTAL_CODE,
            customer=customer,
            context={},
            secret={"codigo": code},  # the record never shows it
            respect_opt_out=False,  # the customer asked for it
        )
        # Only channels that really deliver: WhatsApp and SMS without a
        # contracted provider are recorded, not sent (decision 097).
        reachable = [
            _mask(m.to, m.channel)
            for m in sent
            if m.status != OutboundMessage.Status.SKIPPED
            and (m.channel == "email" or providers.status(m.channel)["ready"])
        ]
        if not reachable:
            pending.delete()  # nothing reached the customer: no wait for a retry
            raise PortalError(
                "No tenemos un correo ni un teléfono tuyo para enviarte el código. Llama a la "
                "financiera.",
                "unreachable",
            )
        return {"customer": customer.display_name.split(" ")[0], "sent_to": reachable}


def enter(request, token: str, code: str) -> Customer:
    link = _link(token)
    with company_context(link.tenant):
        customer = Customer.objects.get(pk=link.object_id)
        pending = (
            PortalCode.objects.filter(customer=customer, used_at__isnull=True)
            .order_by("-created_at")
            .first()
        )
        if pending is None or pending.expires_at <= timezone.now():
            raise PortalError("El código venció: pide uno nuevo.", "expired")
        if pending.attempts >= MAX_TRIES:
            raise PortalError("Demasiados intentos: pide un código nuevo.", "tries")
        if not check_password(code.strip(), pending.code_hash):
            pending.attempts += 1
            pending.save(update_fields=["attempts", "updated_at"])
            raise PortalError("El código no coincide.", "code")
        pending.used_at = timezone.now()
        pending.save(update_fields=["used_at", "updated_at"])
        record_event(
            company_id=customer.company_id,
            type="customer.portal_entered",
            target=customer,
            summary="Entró al portal de clientes",
        )
    request.session.cycle_key()  # a fresh session id on every entry
    request.session[SESSION_KEY] = {
        "customer": str(customer.id),
        "company": str(link.tenant),
        "seen": int(timezone.now().timestamp()),
    }
    return customer


def current(request) -> tuple[str, str] | None:
    """(company id, customer id) of a live portal session, refreshed."""
    data = request.session.get(SESSION_KEY)
    if not data:
        return None
    now = int(timezone.now().timestamp())
    seen = int(data.get("seen", 0))
    if now - seen > IDLE_SECONDS:
        request.session.pop(SESSION_KEY, None)
        return None
    if now - seen >= TOUCH_SECONDS:  # saving renews the cookie too
        data["seen"] = now
        request.session[SESSION_KEY] = data
    return data["company"], data["customer"]


def leave(request) -> None:
    request.session.pop(SESSION_KEY, None)
