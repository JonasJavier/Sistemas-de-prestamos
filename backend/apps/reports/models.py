import pghistory
from django.conf import settings
from django.db import models
from django.db.models import Q

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


MONEY = {"max_digits": 14, "decimal_places": 2}


@pghistory.track()
class CommissionRule(CompanyScopedModel):
    """How a role (or one person) earns commission (P63, decision 089).

    The base is what the person did in the month: the interest and late
    fees they collected, everything they collected, or what the loans they
    originated disbursed. ``rate`` is a fraction of that base; with a
    ``goal``, nothing is earned below it (and the whole base counts above).
    A rule for one person replaces the one for their role.
    """

    class Base(models.TextChoices):
        INCOME_COLLECTED = "income_collected", "Interés y mora cobrados"
        TOTAL_COLLECTED = "total_collected", "Total cobrado"
        DISBURSED = "disbursed", "Monto desembolsado (colocación)"

    class Role(models.TextChoices):
        COLLECTOR = "Cobrador", "Cobrador"
        OFFICER = "Oficial de crédito", "Oficial de crédito"

    name = models.CharField(max_length=100)
    role = models.CharField(max_length=30, choices=Role)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    base = models.CharField(max_length=20, choices=Base)
    rate = models.DecimalField(max_digits=6, decimal_places=4)  # 0.1000 = 10 %
    goal = models.DecimalField(**MONEY, default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(rate__gt=0) & Q(rate__lte=1) & Q(goal__gte=0),
                name="commission_rule_rate_and_goal",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class CommissionRun(CompanyScopedModel):
    """The month's commissions: a draft recalculated at will until it is
    approved; approval turns each amount into a payable to the employee."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        APPROVED = "approved", "Aprobada"

    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=Status, default=Status.DRAFT)
    total = models.DecimalField(**MONEY, default=0)
    computed_at = models.DateTimeField()
    computed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "year", "month"], name="commission_run_one_per_month"
            ),
        ]


class CommissionLine(CompanyScopedModel):
    run = models.ForeignKey(CommissionRun, on_delete=models.CASCADE, related_name="lines")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    rule = models.ForeignKey(CommissionRule, on_delete=models.PROTECT, related_name="+")
    base_amount = models.DecimalField(**MONEY)
    rate = models.DecimalField(max_digits=6, decimal_places=4)
    goal = models.DecimalField(**MONEY, default=0)
    amount = models.DecimalField(**MONEY)
    detail = models.JSONField(default=dict, blank=True)
    payable = models.ForeignKey(
        "expenses.Payable", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
