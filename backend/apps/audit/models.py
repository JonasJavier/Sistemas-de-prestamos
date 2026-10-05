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

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    action = models.CharField(max_length=20, choices=Action)
    target_type = models.CharField(max_length=50)
    target_id = models.UUIDField()
    detail = models.CharField(max_length=300, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "target_type", "target_id"])]

    def __str__(self) -> str:
        return f"{self.user} {self.action} {self.target_type}"
