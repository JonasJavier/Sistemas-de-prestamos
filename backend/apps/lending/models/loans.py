"""Loans: born at disbursement (F4) with frozen, versioned conditions.

- ``LoanTerms`` copies the product the day the money leaves; editing the
  product later never touches existing loans (doc 03, principles). A
  version is never modified, only replaced (doc 05 - section 2).
- ``Installment`` rows belong to one terms version; a new version marks
  the unpaid ones of the previous version as superseded.
- Cached balances on ``Loan`` are updated in the same transaction as
  each operation and reconciled against the ledger every night.
"""

import pghistory
import pgtrigger
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.core.models import Branch, CompanyScopedModel, Reason
from apps.customers.models import Collateral, Customer, PrivateFileBase
from apps.ledger.models import FinancialAccount, JournalEntry
from apps.lending.models.applications import Application
from apps.lending.models.products import (
    FREQUENCY_CHOICES,
    METHOD_CHOICES,
    RATE_UNIT_CHOICES,
    LateFeePolicy,
    LoanProduct,
    ProductCharge,
)

MONEY = {"max_digits": 14, "decimal_places": 2}


@pghistory.track()
class Loan(CompanyScopedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Activo"
        PAID_OFF = "paid_off", "Saldado"
        RENEWED = "renewed", "Renovado"
        WRITTEN_OFF = "written_off", "Castigado"
        VOIDED = "voided", "Anulado"

    number = models.CharField(max_length=30)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="loans")
    application = models.OneToOneField(
        Application, null=True, blank=True, on_delete=models.PROTECT, related_name="loan"
    )
    product = models.ForeignKey(LoanProduct, on_delete=models.PROTECT, related_name="loans")
    status = models.CharField(max_length=12, choices=Status, default=Status.ACTIVE)

    principal = models.DecimalField(**MONEY)  # base of the installments (amount + financed)
    currency = models.CharField(max_length=3, default="DOP")
    disbursed_on = models.DateField()
    officer = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )
    collector = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    renewed_from = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="renewals"
    )
    is_restructured = models.BooleanField(default=False)
    is_migrated = models.BooleanField(default=False)
    closed_on = models.DateField(null=True, blank=True)
    written_off_on = models.DateField(null=True, blank=True)
    voided_on = models.DateField(null=True, blank=True)
    void_reason = models.ForeignKey(
        Reason, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    void_note = models.TextField(blank=True)
    promissory_note_signed_at = models.DateTimeField(null=True, blank=True)

    # Cached balances (doc 05 - 4.4): same-transaction updates, nightly check.
    principal_outstanding = models.DecimalField(**MONEY, default=0)
    interest_outstanding = models.DecimalField(**MONEY, default=0)
    late_fee_outstanding = models.DecimalField(**MONEY, default=0)
    days_past_due = models.PositiveIntegerField(default=0)
    next_due_date = models.DateField(null=True, blank=True)
    last_payment_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "number"], name="loan_number_unique"),
            models.CheckConstraint(condition=Q(principal__gt=0), name="loan_principal_positive"),
            models.CheckConstraint(
                condition=Q(principal_outstanding__gte=0)
                & Q(interest_outstanding__gte=0)
                & Q(late_fee_outstanding__gte=0),
                name="loan_balances_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "status"]),
            models.Index(fields=["company", "customer"]),
            models.Index(fields=["company", "branch", "status"]),
        ]

    def __str__(self) -> str:
        return self.number


class LoanTerms(CompanyScopedModel):
    """Frozen conditions, one immutable row per version (append-only)."""

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="terms")
    version = models.PositiveSmallIntegerField()
    effective_from = models.DateField()
    reason = models.CharField(max_length=200)

    principal = models.DecimalField(**MONEY)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES)
    frequency = models.CharField(max_length=12, choices=FREQUENCY_CHOICES)
    rate = models.DecimalField(max_digits=9, decimal_places=6)
    rate_unit = models.CharField(max_length=10, choices=RATE_UNIT_CHOICES)
    # Derived per-period rate; more precision than the nominal one so
    # 5% monthly as a daily rate (0.0016666...) survives the copy.
    periodic_rate = models.DecimalField(max_digits=16, decimal_places=12)
    installments = models.PositiveSmallIntegerField()
    first_due = models.DateField()
    payment_rounding = models.CharField(max_length=5, choices=LoanProduct.Rounding)
    allocation_order = models.CharField(max_length=15, choices=LoanProduct.AllocationOrder)
    collect_saturdays = models.BooleanField()
    collect_sundays = models.BooleanField()
    collect_holidays = models.BooleanField()
    payoff_full_current_period = models.BooleanField()
    payoff_future_interest_pct = models.DecimalField(max_digits=5, decimal_places=4)

    # Copy of the late-fee policy (doc 05: «se copia al préstamo»).
    late_fee_grace_days = models.PositiveSmallIntegerField()
    late_fee_method = models.CharField(max_length=20, choices=LateFeePolicy.FeeMethod)
    late_fee_monthly_rate = models.DecimalField(max_digits=9, decimal_places=6)
    late_fee_fixed_amount = models.DecimalField(**MONEY, null=True, blank=True)
    late_fee_cap_pct = models.DecimalField(max_digits=5, decimal_places=4)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["loan", "version"], name="loan_terms_version_unique"),
        ]
        triggers = [
            pgtrigger.Protect(
                name="loan_terms_append_only", operation=pgtrigger.Update | pgtrigger.Delete
            )
        ]


class Installment(CompanyScopedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        PARTIAL = "partial", "Pago parcial"
        PAID = "paid", "Pagada"
        SUPERSEDED = "superseded", "Reemplazada"

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="installments")
    terms = models.ForeignKey(LoanTerms, on_delete=models.PROTECT, related_name="schedule")
    number = models.PositiveSmallIntegerField()
    due_date = models.DateField()
    original_due_date = models.DateField()  # before the non-working-day shift

    principal_due = models.DecimalField(**MONEY)
    interest_due = models.DecimalField(**MONEY)
    charges_due = models.DecimalField(**MONEY, default=0)
    principal_paid = models.DecimalField(**MONEY, default=0)
    interest_paid = models.DecimalField(**MONEY, default=0)
    charges_paid = models.DecimalField(**MONEY, default=0)
    late_fee_paid = models.DecimalField(**MONEY, default=0)
    late_fee_waived = models.DecimalField(**MONEY, default=0)
    late_fee_accrued = models.DecimalField(**MONEY, default=0)  # nightly cache

    status = models.CharField(max_length=10, choices=Status, default=Status.PENDING)
    paid_on = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["terms", "number"], name="installment_number_unique"),
            # Doc 05 - section 7, rule 4: paid never exceeds due, per component.
            models.CheckConstraint(
                condition=Q(principal_paid__lte=F("principal_due"))
                & Q(interest_paid__lte=F("interest_due"))
                & Q(charges_paid__lte=F("charges_due")),
                name="installment_paid_within_due",
            ),
            models.CheckConstraint(
                condition=Q(principal_due__gte=0)
                & Q(interest_due__gte=0)
                & Q(charges_due__gte=0)
                & Q(principal_paid__gte=0)
                & Q(interest_paid__gte=0)
                & Q(charges_paid__gte=0)
                & Q(late_fee_paid__gte=0)
                & Q(late_fee_waived__gte=0)
                & Q(late_fee_accrued__gte=0),
                name="installment_amounts_non_negative",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "due_date", "status"]),
            models.Index(fields=["loan", "number"]),
        ]

    @property
    def total_due(self):
        return self.principal_due + self.interest_due + self.charges_due


class LoanCharge(CompanyScopedModel):
    """A product charge as applied to this loan; voiding reverses it (#31)."""

    class Status(models.TextChoices):
        APPLIED = "applied", "Aplicado"
        REVERSED = "reversed", "Revertido"

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="charges")
    product_charge = models.ForeignKey(
        ProductCharge, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    name = models.CharField(max_length=100)
    basis = models.CharField(max_length=10, choices=ProductCharge.Basis)
    value = models.DecimalField(max_digits=14, decimal_places=6)
    mode = models.CharField(max_length=12, choices=ProductCharge.Mode)
    amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=10, choices=Status, default=Status.APPLIED)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gte=0), name="loan_charge_non_negative"),
        ]


class LoanGuarantor(CompanyScopedModel):
    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="guarantors")
    customer = models.ForeignKey(
        Customer, on_delete=models.PROTECT, related_name="guaranteed_loans"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["loan", "customer"], name="loan_guarantor_unique"),
        ]


class LoanCollateral(CompanyScopedModel):
    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="collaterals")
    collateral = models.ForeignKey(Collateral, on_delete=models.PROTECT, related_name="loans")
    considered_value = models.DecimalField(**MONEY)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["loan", "collateral"], name="loan_collateral_unique"),
        ]


class Disbursement(CompanyScopedModel):
    """The money leaving (F4). One per loan, idempotent by key (doc 03 - 6)."""

    class Method(models.TextChoices):
        CASH = "cash", "Efectivo"
        TRANSFER = "transfer", "Transferencia"
        CHECK = "check", "Cheque"

    loan = models.OneToOneField(Loan, on_delete=models.PROTECT, related_name="disbursement")
    disbursed_on = models.DateField()
    source_account = models.ForeignKey(
        FinancialAccount, on_delete=models.PROTECT, related_name="disbursements"
    )
    method = models.CharField(max_length=10, choices=Method)
    reference = models.CharField(max_length=60, blank=True)
    gross = models.DecimalField(**MONEY)  # approved amount
    discounted_charges = models.DecimalField(**MONEY, default=0)
    financed_charges = models.DecimalField(**MONEY, default=0)
    cash_charges = models.DecimalField(**MONEY, default=0)
    net = models.DecimalField(**MONEY)  # what the customer receives
    charge_account = models.ForeignKey(
        FinancialAccount, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    idempotency_key = models.CharField(max_length=64)
    journal_entry = models.OneToOneField(
        JournalEntry, on_delete=models.PROTECT, related_name="disbursement"
    )
    reversal_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    disbursed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            # Doc 05 - section 7, rule 8: a double click never pays twice.
            models.UniqueConstraint(
                fields=["company", "idempotency_key"], name="disbursement_idempotency_unique"
            ),
            models.CheckConstraint(
                condition=Q(net__gt=0) & Q(net=F("gross") - F("discounted_charges")),
                name="disbursement_net_consistent",
            ),
        ]


class LoanFile(PrivateFileBase):
    class Kind(models.TextChoices):
        SIGNED_PROMISSORY_NOTE = "signed_note", "Pagaré firmado"
        OTHER = "other", "Otro"

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="files")
    kind = models.CharField(max_length=20, choices=Kind)
