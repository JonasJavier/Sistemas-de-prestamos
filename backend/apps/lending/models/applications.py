"""Applications: flow F3 (doc 04) on the doc 05 - section 4.4 model.

Lifecycle (doc 05 - 5.1): draft -> in_review -> approved | rejected |
returned; approved -> disbursed | expired | withdrawn. Nobody decides on
what they created (decision 023) and every decision keeps who, when and
why; nothing is deleted, so the customer's history keeps every request
(reference defect #22).
"""

import pghistory
from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import Branch, CompanyScopedModel, Reason
from apps.customers.models import Collateral, Customer, PrivateFileBase
from apps.lending.models.products import FREQUENCY_CHOICES, RATE_UNIT_CHOICES, LoanProduct


@pghistory.track()
class Application(CompanyScopedModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Borrador"
        IN_REVIEW = "in_review", "En evaluación"
        RETURNED = "returned", "Devuelta"
        APPROVED = "approved", "Aprobada"
        REJECTED = "rejected", "Rechazada"
        DISBURSED = "disbursed", "Desembolsada"
        EXPIRED = "expired", "Vencida"
        WITHDRAWN = "withdrawn", "Desistida"

    EDITABLE = frozenset({Status.DRAFT, Status.RETURNED})
    SUBMITTABLE = frozenset({Status.DRAFT, Status.RETURNED, Status.EXPIRED})
    WITHDRAWABLE = frozenset({Status.DRAFT, Status.RETURNED, Status.APPROVED, Status.EXPIRED})

    class BureauProvider(models.TextChoices):
        DATACREDITO = "datacredito", "DataCrédito"
        TRANSUNION = "transunion", "TransUnion"

    number = models.CharField(max_length=30)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="applications")
    product = models.ForeignKey(LoanProduct, on_delete=models.PROTECT, related_name="applications")

    # Requested conditions, always inside the product's ranges (F3 step 1).
    currency = models.CharField(max_length=3, default="DOP")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    frequency = models.CharField(max_length=12, choices=FREQUENCY_CHOICES)
    installments = models.PositiveSmallIntegerField()
    rate = models.DecimalField(max_digits=9, decimal_places=6)
    rate_unit = models.CharField(max_length=10, choices=RATE_UNIT_CHOICES)
    first_due = models.DateField(null=True, blank=True)
    purpose = models.CharField(max_length=300, blank=True)
    notes = models.TextField(blank=True)

    status = models.CharField(max_length=10, choices=Status, default=Status.DRAFT)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    assigned_approver = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="+",
    )

    # Decision (F3 step 4)
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_reason = models.ForeignKey(
        Reason, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decision_note = models.TextField(blank=True)

    # Approved conditions: what the disbursement uses (may be adjusted).
    approved_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    approved_installments = models.PositiveSmallIntegerField(null=True, blank=True)
    approved_rate = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    approved_frequency = models.CharField(max_length=12, choices=FREQUENCY_CHOICES, blank=True)
    approved_first_due = models.DateField(null=True, blank=True)
    valid_until = models.DateField(null=True, blank=True)  # F3 step 5

    # Evaluation snapshot taken when sent to approval.
    capacity_ratio = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)

    # External bureau, consulted outside the system (decision 026).
    bureau_provider = models.CharField(max_length=12, choices=BureauProvider, blank=True)
    bureau_score = models.PositiveSmallIntegerField(null=True, blank=True)
    bureau_date = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "number"], name="application_number_unique"),
            models.CheckConstraint(condition=Q(amount__gt=0), name="application_amount_positive"),
            models.CheckConstraint(
                condition=Q(installments__gte=1), name="application_installments_positive"
            ),
            models.CheckConstraint(
                condition=Q(approved_amount__isnull=True) | Q(approved_amount__gt=0),
                name="application_approved_amount_positive",
            ),
            # Decision 023 at the database level: the decider is never the author.
            models.CheckConstraint(
                condition=Q(decided_by__isnull=True) | ~Q(decided_by=models.F("created_by")),
                name="application_not_self_decided",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "customer"]),
        ]

    def __str__(self) -> str:
        return self.number


class ApplicationBudgetItem(CompanyScopedModel):
    """Income, expenses and assets declared for the capacity evaluation.

    Replaces the reference's «Calculadora» (doc 05 - section 4.4).
    """

    class Kind(models.TextChoices):
        INCOME = "income", "Ingreso"
        EXPENSE = "expense", "Gasto"
        ASSET = "asset", "Activo"

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="budget_items"
    )
    kind = models.CharField(max_length=10, choices=Kind)
    category = models.CharField(max_length=60, blank=True)
    description = models.CharField(max_length=200)
    monthly_amount = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(monthly_amount__gte=0), name="budget_item_amount_non_negative"
            ),
        ]


class ApplicationGuarantor(CompanyScopedModel):
    """Only customers of our own base (reference defect #27)."""

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="guarantors"
    )
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["application", "customer"], name="application_guarantor_unique"
            ),
        ]


class ApplicationCollateral(CompanyScopedModel):
    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="collaterals"
    )
    collateral = models.ForeignKey(Collateral, on_delete=models.PROTECT, related_name="+")
    considered_value = models.DecimalField(max_digits=14, decimal_places=2)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["application", "collateral"], name="application_collateral_unique"
            ),
            models.CheckConstraint(
                condition=Q(considered_value__gte=0), name="application_collateral_value_ok"
            ),
        ]


class ApplicationFile(PrivateFileBase):
    """Bureau report and requirement documents; private like customer files."""

    class Kind(models.TextChoices):
        BUREAU_REPORT = "bureau_report", "Reporte de buró"
        DOCUMENT = "document", "Documento"

    application = models.ForeignKey(Application, on_delete=models.CASCADE, related_name="files")
    kind = models.CharField(max_length=20, choices=Kind)
    description = models.CharField(max_length=200, blank=True)


@pghistory.track()
class ApplicationRequirement(CompanyScopedModel):
    """One line of the product's document checklist (F3 step 2)."""

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name="requirements"
    )
    name = models.CharField(max_length=150)
    file = models.ForeignKey(
        ApplicationFile, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["application", "name"], name="application_requirement_unique"
            ),
        ]
