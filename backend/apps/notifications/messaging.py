"""F18 · Messages to customers (decision 097).

Each event (reminder, arrears, payment, portal) has one template per
channel that the administrator edits and turns on (P80). Sending records
every message with its status — also the ones not sent, and why (no
address, the customer opted out) — and hands it to the channel's provider
after the transaction commits. E-mail goes out through the mail server;
WhatsApp and SMS go through the contracted provider, and until there is
one they are recorded «sin proveedor» so nothing is lost.
"""

import datetime as dt
from collections.abc import Iterable

from django.conf import settings

from apps.core.tenancy import current_company_id, on_commit_in_tenant
from apps.notifications.models import (
    Channel,
    MessageEvent,
    MessageTemplate,
    OptOut,
    OutboundMessage,
)

E, S, W = Channel.EMAIL, Channel.SMS, Channel.WHATSAPP

# (event, channel): (subject, body, on by default)
DEFAULTS = {
    (MessageEvent.REMINDER, E): (
        "Mañana vence tu cuota",
        "Hola {nombre}: te recordamos que mañana {fecha} vence tu cuota de {monto} del préstamo "
        "{prestamo}. Gracias por tu puntualidad. {empresa}",
        True,
    ),
    (MessageEvent.OVERDUE, E): (
        "Tu préstamo tiene un pago vencido",
        "Hola {nombre}: tu préstamo {prestamo} tiene {monto} vencido. Pasa por la oficina o "
        "comunícate con nosotros para ponerte al día. {empresa}",
        True,
    ),
    (MessageEvent.PAYMENT, E): (
        "Recibimos tu pago",
        "Hola {nombre}: recibimos tu pago de {monto} del préstamo {prestamo}. Tu recibo: "
        "{enlace}. Gracias. {empresa}",
        True,
    ),
    (MessageEvent.PORTAL_INVITE, E): (
        "Tu portal de cliente",
        "Hola {nombre}: {empresa} te invita a su portal de clientes, donde ves tus préstamos, "
        "tu próximo pago y tus recibos: {enlace}",
        True,
    ),
    (MessageEvent.PORTAL_CODE, E): (
        "Tu código de acceso",
        "Tu código para entrar al portal de {empresa} es {codigo}. Vence en 10 minutos. Si no lo "
        "pediste, ignora este mensaje.",
        True,
    ),
    (MessageEvent.TEST, E): (
        "Mensaje de prueba",
        "Mensaje de prueba de {empresa} desde Cobradía.",
        True,
    ),
}
for (event, _channel), (_subject, body, _on) in list(DEFAULTS.items()):
    # The same texts for WhatsApp and SMS, off until a provider is contracted
    # (codes and tests on, so the portal and P80 can be tried with it).
    for other in (S, W):
        on = event in (MessageEvent.PORTAL_CODE, MessageEvent.TEST)
        DEFAULTS[(event, other)] = ("", body, on)


class _Blank(dict):
    def __missing__(self, key: str) -> str:
        return ""


def render(text: str, context: dict) -> str:
    try:
        return text.format_map(_Blank({k: "" if v is None else v for k, v in context.items()}))
    except ValueError, IndexError:  # a stray brace in an edited template
        return text


def templates() -> list[MessageTemplate]:
    """Every (event, channel), created with its default the first time."""
    company_id = current_company_id()
    existing = {(t.event, t.channel): t for t in MessageTemplate.objects.all()}
    missing = [
        MessageTemplate(
            company_id=company_id,
            event=event,
            channel=channel,
            subject=subject,
            body=body,
            is_active=on,
        )
        for (event, channel), (subject, body, on) in DEFAULTS.items()
        if (event, channel) not in existing
    ]
    if missing and company_id:
        MessageTemplate.objects.bulk_create(missing, ignore_conflicts=True)
        existing = {(t.event, t.channel): t for t in MessageTemplate.objects.all()}
    order = list(DEFAULTS)
    return sorted(existing.values(), key=lambda t: order.index((t.event, t.channel)))


def phone_e164(raw: str) -> str:
    digits = "".join(ch for ch in raw or "" if ch.isdigit())
    if len(digits) == 10:  # Dominican numbers: country code +1
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return ""


def address_of(customer, channel: str) -> str:
    if channel == Channel.EMAIL:
        return (customer.email or "").strip()
    return phone_e164(customer.phone)


def opted_out(customer, channel: str) -> bool:
    return OptOut.objects.filter(customer=customer, channel__in=["", channel]).exists()


def public_url(path: str) -> str:
    base = settings.FRONTEND_URL or "http://localhost:5173"
    return f"{base}{path}"


def send(
    *,
    event: str,
    customer=None,
    loan=None,
    context: dict,
    channels: Iterable[str] | None = None,
    to: str = "",
    created_by=None,
    respect_opt_out: bool = True,
) -> list[OutboundMessage]:
    """Record and dispatch the event's active templates for the customer
    (or ``to``, a test address). Returns what was recorded."""
    from apps.core.models import Company

    company_id = current_company_id()
    company = Company.objects.only("legal_name", "trade_name").get(pk=company_id)
    context = {"empresa": str(company), **context}
    if customer is not None:
        context.setdefault("nombre", customer.display_name.split(" ")[0])
    wanted = set(channels) if channels else None
    messages = []
    for template in templates():
        if template.event != event or not template.is_active:
            continue
        if wanted is not None and template.channel not in wanted:
            continue
        channel = template.channel
        target = to or (address_of(customer, channel) if customer is not None else "")
        if channel != Channel.EMAIL and to:
            target = phone_e164(to) or to
        status, error = OutboundMessage.Status.QUEUED, ""
        if not target:
            status = OutboundMessage.Status.SKIPPED
            error = "Sin correo" if channel == Channel.EMAIL else "Sin teléfono válido"
        elif respect_opt_out and customer is not None and opted_out(customer, channel):
            status, error = OutboundMessage.Status.SKIPPED, "El cliente pidió no recibir mensajes"
        message = OutboundMessage.objects.create(
            company_id=company_id,
            customer=customer,
            loan=loan,
            event=event,
            channel=channel,
            to=target or "—",
            subject=render(template.subject, context),
            body=render(template.body, context),
            status=status,
            error=error,
            created_by=created_by,
        )
        messages.append(message)
        if status == OutboundMessage.Status.QUEUED:
            from apps.notifications.tasks import deliver_message

            on_commit_in_tenant(
                company_id,
                lambda pk=message.pk: deliver_message.delay(str(company_id), str(pk)),
            )
    return messages


# --- The automatic ones ------------------------------------------------------------------------


def _money(amount) -> str:
    return f"RD$ {amount:,.2f}"


def payment_received(payment) -> list[OutboundMessage]:
    return send(
        event=MessageEvent.PAYMENT,
        customer=payment.customer,
        loan=payment.loan,
        context={
            "monto": _money(payment.amount),
            "prestamo": payment.loan.number,
            "fecha": f"{payment.value_date:%d/%m/%Y}",
            "enlace": public_url(f"/r/{payment.receipt_token}"),
        },
    )


def nightly(today: dt.date) -> dict:
    """Reminders for tomorrow's installments and the arrears notice on the
    third day late, once each (the nightly run of the company)."""
    from apps.lending.models import Installment, Loan
    from apps.payments import portfolio

    tomorrow = today + dt.timedelta(days=1)
    sent_today = set(
        OutboundMessage.objects.filter(created_at__date=today).values_list("loan_id", "event")
    )
    reminders = overdue = 0
    due = (
        Installment.objects.filter(due_date=tomorrow, loan__status=Loan.Status.ACTIVE)
        .exclude(status__in=[Installment.Status.SUPERSEDED, Installment.Status.PAID])
        .select_related("loan__customer")
    )
    for inst in due:
        loan = inst.loan
        if (loan.id, MessageEvent.REMINDER) in sent_today:
            continue
        owed = inst.principal_outstanding + inst.interest_outstanding + inst.charges_outstanding
        send(
            event=MessageEvent.REMINDER,
            customer=loan.customer,
            loan=loan,
            context={
                "monto": _money(owed),
                "prestamo": loan.number,
                "fecha": f"{tomorrow:%d/%m/%Y}",
            },
        )
        reminders += 1
    for loan in Loan.objects.filter(status=Loan.Status.ACTIVE, days_past_due=3).select_related(
        "customer"
    ):
        if (loan.id, MessageEvent.OVERDUE) in sent_today:
            continue
        lines = portfolio.position(loan, today)
        owed = sum((line.total for line in lines if line.installment.due_date < today), 0)
        send(
            event=MessageEvent.OVERDUE,
            customer=loan.customer,
            loan=loan,
            context={"monto": _money(owed), "prestamo": loan.number},
        )
        overdue += 1
    return {"reminders": reminders, "overdue_notices": overdue}


def provider_status() -> dict:
    from apps.notifications import providers

    return {
        Channel.EMAIL: {"provider": "correo", "ready": True},
        Channel.SMS: providers.status(Channel.SMS),
        Channel.WHATSAPP: providers.status(Channel.WHATSAPP),
    }
