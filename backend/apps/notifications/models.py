"""Internal notices (doc 05 - 4.10, P11): the bell in the top bar.

Written by services when someone must know or act: an authorization to
decide, a cash difference, a collector over the cash limit, a nightly
reconciliation that did not match. Read-only for the recipient, who only
marks them read.
"""

from django.conf import settings
from django.db import models

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
