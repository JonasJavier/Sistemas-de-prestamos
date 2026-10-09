from django.conf import settings
from django.db import models

from apps.core.models import CompanyScopedModel


class ExportJob(CompanyScopedModel):
    """A report exported in the background (P64, decision 087).

    Keeps the exact filters the screen used, so the file is the same
    report; whether it carries personal data (only G and Au may export it,
    and each such export is also logged as a sensitive read). Files expire
    after ``EXPORT_DAYS`` days.
    """

    class Format(models.TextChoices):
        PDF = "pdf", "PDF"
        XLSX = "xlsx", "Excel"

    class Status(models.TextChoices):
        PENDING = "pending", "En cola"
        RUNNING = "running", "Generando"
        DONE = "done", "Lista"
        FAILED = "failed", "Falló"
        EXPIRED = "expired", "Vencida"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    report = models.CharField(max_length=30)
    title = models.CharField(max_length=120)
    filters = models.JSONField(default=dict, blank=True)
    filters_line = models.CharField(max_length=400, blank=True)
    format = models.CharField(max_length=5, choices=Format)
    status = models.CharField(max_length=10, choices=Status, default=Status.PENDING)
    personal = models.BooleanField(default=False)
    rows = models.PositiveIntegerField(default=0)
    file = models.FileField(upload_to="private/exports/%Y/%m/", blank=True)
    error = models.CharField(max_length=300, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "user", "-created_at"])]

    def __str__(self) -> str:
        return f"{self.title} ({self.get_format_display()})"


class CustomerScore(CompanyScopedModel):
    """The customer's classification A–D with its factors (decision 088),
    refreshed every night; ``grade`` empty means «Sin historial»."""

    customer = models.OneToOneField(
        "customers.Customer", on_delete=models.CASCADE, related_name="score"
    )
    score = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    grade = models.CharField(max_length=1, blank=True)
    factors = models.JSONField(default=list, blank=True)
    computed_at = models.DateTimeField()
    previous_grade = models.CharField(max_length=1, blank=True)
    grade_changed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "grade"])]

    def __str__(self) -> str:
        return f"{self.customer_id}: {self.grade or '—'}"
