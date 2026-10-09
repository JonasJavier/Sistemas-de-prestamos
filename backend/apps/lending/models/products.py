"""Loan products (doc 05 - section 4.4; parameters from doc 03 - section 1).

Editing a product never alters existing loans: conditions are frozen
into LoanTerms at disbursement.
"""

import pghistory
from django.db import models
from django.db.models import Q

from apps.core.models import CompanyScopedModel
from engine.rates import Frequency, RateUnit
from engine.schedule import Method

FREQUENCY_CHOICES = [(f.value, f.value) for f in Frequency]
METHOD_CHOICES = [(m.value, m.value) for m in Method]
RATE_UNIT_CHOICES = [(u.value, u.value) for u in RateUnit]


def default_required_documents() -> list[str]:
    return ["Cédula o RNC"]


@pghistory.track()
class LoanProduct(CompanyScopedModel):
    class Type(models.TextChoices):
        PERSONAL = "personal", "Personal"
        VEHICLE = "vehicle", "Vehículo"
        MORTGAGE = "mortgage", "Hipotecario"
        MICRO = "micro", "Microcrédito"

    class Rounding(models.TextChoices):
        CENT = "cent", "Al centavo"
        PESO = "peso", "Al peso"
        FIVE = "five", "A 5"
        TEN = "ten", "A 10"

    class AllocationOrder(models.TextChoices):
        STANDARD = "standard", "Cargos → mora → interés → capital"
        PROPORTIONAL = "proportional", "Proporcional"

    class GuaranteeRequirement(models.TextChoices):
        NONE = "none", "No requerida"
        GUARANTOR = "guarantor", "Garante"
        ASSET = "asset", "Bien en garantía"

    name = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=Type)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    allowed_frequencies = models.JSONField(default=list)  # Frequency values
    rate_unit = models.CharField(
        max_length=10, choices=RATE_UNIT_CHOICES, default=RateUnit.PER_PERIOD
    )

    min_amount = models.DecimalField(max_digits=14, decimal_places=2)
    max_amount = models.DecimalField(max_digits=14, decimal_places=2)
    min_rate = models.DecimalField(max_digits=9, decimal_places=6)
    max_rate = models.DecimalField(max_digits=9, decimal_places=6)
    default_rate = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    min_term = models.PositiveSmallIntegerField()
    max_term = models.PositiveSmallIntegerField()

    payment_rounding = models.CharField(max_length=5, choices=Rounding, default=Rounding.CENT)
    collect_saturdays = models.BooleanField(default=True)
    collect_sundays = models.BooleanField(default=False)
    collect_holidays = models.BooleanField(default=False)
    allocation_order = models.CharField(
        max_length=15, choices=AllocationOrder, default=AllocationOrder.STANDARD
    )

    # Early payoff (doc 03 - section 9)
    payoff_full_current_period = models.BooleanField(default=True)
    payoff_future_interest_pct = models.DecimalField(max_digits=5, decimal_places=4, default=0)

    guarantee = models.CharField(
        max_length=10, choices=GuaranteeRequirement, default=GuaranteeRequirement.NONE
    )
    min_coverage = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    # Checklist an application must verify before approval (F3 step 2).
    required_documents = models.JSONField(default=default_required_documents, blank=True)

    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "name"], name="product_name_unique"),
            models.CheckConstraint(
                condition=Q(min_amount__lte=models.F("max_amount")),
                name="product_amount_range_valid",
            ),
            models.CheckConstraint(
                condition=Q(min_term__lte=models.F("max_term")),
                name="product_term_range_valid",
            ),
            models.CheckConstraint(
                condition=Q(min_rate__lte=models.F("max_rate")),
                name="product_rate_range_valid",
            ),
        ]

    def __str__(self) -> str:
        return self.name


@pghistory.track()
class LateFeePolicy(CompanyScopedModel):
    """Copied onto the loan at disbursement (doc 03 - section 7)."""

    class FeeMethod(models.TextChoices):
        PRORATED_DAILY = "prorated_daily", "Prorrateada por día"
        FULL_PERIOD = "full_period", "Porcentaje por período completo"
        FIXED = "fixed", "Cargo fijo por cuota"

    product = models.OneToOneField(
        LoanProduct, on_delete=models.CASCADE, related_name="late_fee_policy"
    )
    grace_days = models.PositiveSmallIntegerField(default=3)
    fee_method = models.CharField(
        max_length=20, choices=FeeMethod, default=FeeMethod.PRORATED_DAILY
    )
    monthly_rate = models.DecimalField(max_digits=9, decimal_places=6, default="0.05")
    fixed_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    cap_pct = models.DecimalField(max_digits=5, decimal_places=4, default="0.10")

    def __str__(self) -> str:
        return f"Mora de {self.product.name}"


@pghistory.track()
class ProductCharge(CompanyScopedModel):
    """Closing costs and friends (doc 03 - section 5)."""

    class Basis(models.TextChoices):
        PERCENT = "percent", "Porcentaje del monto"
        FIXED = "fixed", "Monto fijo"

    class Mode(models.TextChoices):
        DISCOUNTED = "discounted", "Descontado del desembolso"
        FINANCED = "financed", "Financiado"
        CASH = "cash", "Cobrado en caja"

    product = models.ForeignKey(LoanProduct, on_delete=models.CASCADE, related_name="charges")
    name = models.CharField(max_length=100)
    basis = models.CharField(max_length=10, choices=Basis)
    value = models.DecimalField(max_digits=14, decimal_places=6)
    mode = models.CharField(max_length=12, choices=Mode, default=Mode.DISCOUNTED)
    # Decision 075: interest is ITBIS-exempt (art. 344 of the Tax Code), but
    # a charge that is not the financial service itself (a resold insurance,
    # a GPS) may carry the 18 %: its amount then includes the tax.
    taxed = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return f"{self.name} ({self.product.name})"
