"""Sensitive-read log (doc 06 - section 9, «Lecturas sensibles»).

Who opened a cedula file, exported personal data or generated a share
link. Append-only from the application's point of view: rows are
created, never edited.
"""

import pghistory
from django.conf import settings
from django.db import models

from apps.core.models import CompanyScopedModel


class SensitiveAccessLog(CompanyScopedModel):
    class Action(models.TextChoices):
        FILE_DOWNLOAD = "file_download", "Descarga de archivo"
        FILE_LINK = "file_link", "Enlace temporal de archivo"
        EXPORT = "export", "Exportación de datos"
        DOCUMENT = "document", "Documento emitido"
        OTHER_BRANCH = "other_branch", "Cliente de otra sucursal"
        LOCATION_MAP = "location_map", "Mapa de cobradores"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=20, choices=Action)
    target_type = models.CharField(max_length=50)
    target_id = models.UUIDField()
    detail = models.CharField(max_length=300, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "target_type", "target_id"])]

    def __str__(self) -> str:
        return f"{self.user} {self.action} {self.target_type}"


class DomainEvent(CompanyScopedModel):
    """A business fact (doc 05 - section 4.10): ``application.submitted``,
    ``loan.disbursed``... Feeds the customer and loan timelines. Written
    once by the services that perform the fact, never edited.
    """

    type = models.CharField(max_length=50)
    target_type = models.CharField(max_length=50)
    target_id = models.UUIDField()
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )
    summary = models.CharField(max_length=300)
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "target_type", "target_id", "created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.type} {self.target_type}:{self.target_id}"


def record_event(
    *,
    company_id,
    type: str,  # noqa: A002 - mirrors the column
    target,
    actor=None,
    summary: str,
    data: dict | None = None,
) -> DomainEvent:
    return DomainEvent.objects.create(
        company_id=company_id,
        type=type,
        target_type=target._meta.label_lower,
        target_id=target.pk,
        actor=actor,
        summary=summary,
        data=data or {},
    )


class LoginEvent(CompanyScopedModel):
    """Doc 06 §9 «Accesos»: every sign-in, with the device and whether it
    was new for the person or outside their branch hours (decision 090)."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    at = models.DateTimeField()
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    new_device = models.BooleanField(default=False)
    outside_hours = models.BooleanField(default=False)

    class Meta:
        indexes = [models.Index(fields=["company", "user", "-at"])]


class FraudKind(models.TextChoices):
    """Doc 06 §9 «Alertas antifraude» (decision 090)."""

    REVERSALS = "reversals", "Reversos pedidos por una misma persona"
    WAIVERS = "waivers", "Condonaciones y descuentos aprobados a una misma persona"
    CASH_DIFFERENCES = "cash_differences", "Diferencias de caja de una misma persona"
    OFF_HOURS = "off_hours", "Inicios de sesión fuera del horario de la sucursal"
    NEW_DEVICE = "new_device", "Inicios de sesión desde un dispositivo nuevo"
    OFF_ROUTE = "off_route", "Cobros fuera de la ruta del día"
    CASH_LIMIT = "cash_limit", "Rutas que superaron el límite de efectivo"
    PERMISSIONS = "permissions", "Cambios de roles, sucursales o límites"


@pghistory.track()
class FraudRule(CompanyScopedModel):
    """One pattern, its threshold and its window; editable by the manager."""

    kind = models.CharField(max_length=20, choices=FraudKind)
    threshold = models.PositiveSmallIntegerField()
    window_days = models.PositiveSmallIntegerField()
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "kind"], name="fraud_rule_one_per_kind"),
            models.CheckConstraint(
                condition=models.Q(threshold__gte=1)
                & models.Q(window_days__gte=1)
                & models.Q(window_days__lte=90),
                name="fraud_rule_sane",
            ),
        ]


class FraudAlert(CompanyScopedModel):
    """A pattern found by the nightly review; the manager reviews it."""

    class Status(models.TextChoices):
        OPEN = "open", "Por revisar"
        REVIEWED = "reviewed", "Revisada"

    kind = models.CharField(max_length=20, choices=FraudKind)
    subject = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    count = models.PositiveIntegerField()
    threshold = models.PositiveSmallIntegerField()
    window_days = models.PositiveSmallIntegerField()
    detail = models.CharField(max_length=300)
    status = models.CharField(max_length=10, choices=Status, default=Status.OPEN)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_note = models.TextField(blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "status", "-created_at"])]
