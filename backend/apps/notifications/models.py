"""Internal notices (doc 05 - 4.10, P11): the bell in the top bar.

Written by services when someone must know or act: an authorization to
decide, a cash difference, a collector over the cash limit, a nightly
reconciliation that did not match. Read-only for the recipient, who only
marks them read.
"""

import pghistory
from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import CompanyScopedModel


class Notification(CompanyScopedModel):
    class Kind(models.TextChoices):
        APPROVAL_REQUESTED = "approval_requested", "Autorización pedida"
        APPROVAL_DECIDED = "approval_decided", "Autorización respondida"
        CASH_DIFFERENCE = "cash_difference", "Diferencia de caja"
        CLOSING_TO_APPROVE = "closing_to_approve", "Cierre por aprobar"
        CASH_LIMIT = "cash_limit", "Límite de efectivo"
        RECONCILIATION = "reconciliation", "Conciliación"
        ESCALATION = "escalation", "Escalamiento"
        PROMISES_BROKEN = "promises_broken", "Promesas incumplidas"
        FRAUD_ALERT = "fraud_alert", "Alerta antifraude"
        SUPPORT_ACCESS = "support_access", "Acceso de soporte"
        SECURITY = "security", "Seguridad de la cuenta"
        SUBSCRIPTION = "subscription", "Suscripción"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=30, choices=Kind)
    text = models.CharField(max_length=300)
    link = models.CharField(max_length=200, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "user", "read_at"])]

    def __str__(self) -> str:
        return self.text


# --- F18 · Messages to customers (phase 9, decision 097) ---------------------------------------


class Channel(models.TextChoices):
    EMAIL = "email", "Correo"
    SMS = "sms", "SMS"
    WHATSAPP = "whatsapp", "WhatsApp"


class MessageEvent(models.TextChoices):
    REMINDER = "reminder", "Recordatorio del vencimiento"
    OVERDUE = "overdue", "Aviso de atraso"
    PAYMENT = "payment", "Confirmación de pago"
    PORTAL_INVITE = "portal_invite", "Invitación al portal"
    PORTAL_CODE = "portal_code", "Código de acceso al portal"
    TEST = "test", "Mensaje de prueba"


@pghistory.track()
class MessageTemplate(CompanyScopedModel):
    """The text of one event on one channel, edited by the administrator.
    ``{nombre}``, ``{monto}``, ``{fecha}``, ``{prestamo}``, ``{empresa}`` and
    ``{enlace}`` are filled in when sending."""

    event = models.CharField(max_length=20, choices=MessageEvent)
    channel = models.CharField(max_length=10, choices=Channel)
    subject = models.CharField(max_length=150, blank=True)  # email only
    body = models.TextField()
    is_active = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "event", "channel"], name="template_one_per_event_channel"
            ),
        ]


class OutboundMessage(CompanyScopedModel):
    """Every message sent (or not) to a customer, with its status (F18)."""

    class Status(models.TextChoices):
        QUEUED = "queued", "En cola"
        SENT = "sent", "Enviado"
        LOGGED = "logged", "Registrado sin proveedor"
        FAILED = "failed", "Falló"
        SKIPPED = "skipped", "No enviado"

    customer = models.ForeignKey(
        "customers.Customer",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="messages",
    )
    loan = models.ForeignKey(
        "lending.Loan", null=True, blank=True, on_delete=models.PROTECT, related_name="messages"
    )
    event = models.CharField(max_length=20, choices=MessageEvent)
    channel = models.CharField(max_length=10, choices=Channel)
    to = models.CharField(max_length=150)
    subject = models.CharField(max_length=150, blank=True)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=Status, default=Status.QUEUED)
    provider = models.CharField(max_length=30, blank=True)
    provider_ref = models.CharField(max_length=100, blank=True)
    error = models.CharField(max_length=300, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        indexes = [
            models.Index(fields=["company", "-created_at"]),
            models.Index(fields=["company", "customer", "-created_at"]),
        ]


class OptOut(CompanyScopedModel):
    """The customer asked not to be written to: on one channel, or on all
    when ``channel`` is empty. Codes to enter the portal are still sent."""

    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="opt_outs"
    )
    channel = models.CharField(max_length=10, choices=Channel, blank=True)
    reason = models.CharField(max_length=200, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["customer", "channel"], name="opt_out_once"),
            models.CheckConstraint(
                condition=Q(channel__in=["", "email", "sms", "whatsapp"]), name="opt_out_channel"
            ),
        ]
