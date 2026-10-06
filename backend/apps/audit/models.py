"""Sensitive-read log (doc 06 - section 9, «Lecturas sensibles»).

Who opened a cedula file, exported personal data or generated a share
link. Append-only from the application's point of view: rows are
created, never edited.
"""

from django.conf import settings
from django.db import models

from apps.core.models import CompanyScopedModel


class SensitiveAccessLog(CompanyScopedModel):
    class Action(models.TextChoices):
        FILE_DOWNLOAD = "file_download", "Descarga de archivo"
        FILE_LINK = "file_link", "Enlace temporal de archivo"
        EXPORT = "export", "Exportación de datos"
        DOCUMENT = "document", "Documento emitido"

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
