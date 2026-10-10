"""Expenses, other income and payables (doc 05 - section 4.8; F15).

An ``Expense`` row is either an expense or another income (``kind``): both
are the same record with the money going one way or the other, so one
model, one screen (P54) and one approval path (decision 081). Nothing is
deleted: a mistake is voided with the inverse entry, and descriptive
fields change with history (#18).
"""

import pghistory
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.core.models import Branch, CompanyScopedModel
from apps.customers.models import PrivateFileBase
from apps.ledger.models import FinancialAccount, JournalEntry, LedgerAccount

MONEY = {"max_digits": 14, "decimal_places": 2}


class Kind(models.TextChoices):
    EXPENSE = "expense", "Gasto"
    INCOME = "income", "Ingreso"


@pghistory.track()
class ExpenseCategory(CompanyScopedModel):
    """What the money was for; its ledger account decides where it lands.

    The owner's personal expenses go to «Retiros del dueño» (equity), never
    to the operating result (reference defect #12).
    """

    class Nature(models.TextChoices):
        OPERATING = "operating", "Operativo"
        OWNER = "owner", "Del dueño"

    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, choices=Kind)
    nature = models.CharField(max_length=10, choices=Nature, default=Nature.OPERATING)
    account = models.ForeignKey(LedgerAccount, on_delete=models.PROTECT, related_name="+")
    # «Tipo de bienes y servicios comprados» of the DGII 606 (decision 085):
    # 01 personal, 02 services and supplies, 03 rent, 06 other deductions,
    # 07 financial expenses, 11 insurance...
    dgii_type = models.CharField(max_length=2, default="02")
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "kind", "name"], name="expense_category_name_unique"
            ),
        ]

    def __str__(self) -> str:
        return self.name


@pghistory.track()
class Expense(CompanyScopedModel):
    """A paid expense or a received income, with its supplier's receipt."""

    class Status(models.TextChoices):
        PENDING = "pending", "Por aprobar"
        POSTED = "posted", "Registrado"
        REJECTED = "rejected", "Rechazado"
        VOIDED = "voided", "Anulado"

    class Method(models.TextChoices):
        CASH = "cash", "Efectivo"
        TRANSFER = "transfer", "Transferencia"
        CHECK = "check", "Cheque"
        CARD = "card", "Tarjeta"

    number = models.CharField(max_length=30)
    kind = models.CharField(max_length=10, choices=Kind)
    date = models.DateField()  # the receipt's date; the entry carries it
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name="items")
    description = models.CharField(max_length=300)
    amount = models.DecimalField(**MONEY)
    itbis = models.DecimalField(**MONEY, default=0)  # included in amount (606 report)
    method = models.CharField(max_length=10, choices=Method, default=Method.CASH)
    # Where the money leaves (or enters): a cash box or bank, or a cashier's
    # drawer through the open session (petty cash, F7 step 2).
    account = models.ForeignKey(FinancialAccount, on_delete=models.PROTECT, related_name="+")
    cash_session = models.ForeignKey(
        "cash.CashSession", null=True, blank=True, on_delete=models.PROTECT, related_name="expenses"
    )
    party_name = models.CharField(max_length=200, blank=True)  # supplier or payer
    party_document = models.CharField(max_length=11, blank=True)  # RNC or cédula
    ncf = models.CharField(max_length=13, blank=True)
    status = models.CharField(max_length=10, choices=Status, default=Status.PENDING)
    entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.CharField(max_length=300, blank=True)
    voided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    voided_at = models.DateTimeField(null=True, blank=True)
    void_reason = models.CharField(max_length=300, blank=True)
    void_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "number"], name="expense_number_unique"),
            models.CheckConstraint(condition=Q(amount__gt=0), name="expense_amount_positive"),
            models.CheckConstraint(
                condition=Q(itbis__gte=0) & Q(itbis__lte=F("amount")), name="expense_itbis_range"
            ),
            models.CheckConstraint(
                condition=~Q(status__in=["posted", "voided"]) | Q(entry__isnull=False),
                name="expense_posted_has_entry",
            ),
            models.CheckConstraint(
                condition=~Q(status="voided") | Q(void_entry__isnull=False),
                name="expense_voided_has_entry",
            ),
            # Approval by someone else (decision 081), as with applications.
            models.CheckConstraint(
                condition=Q(decided_by__isnull=True) | ~Q(decided_by=F("created_by")),
                name="expense_not_self_decided",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "kind", "date"]),
            models.Index(fields=["company", "status"]),
        ]

    def __str__(self) -> str:
        return self.number


class ExpenseFile(PrivateFileBase):
    """The supplier's receipt or invoice (PDF or photo), private."""

    expense = models.ForeignKey(Expense, on_delete=models.PROTECT, related_name="files")


class PayableSeries(CompanyScopedModel):
    """A recurring obligation (rent, a loan installment, a salary)."""

    class Frequency(models.TextChoices):
        WEEKLY = "weekly", "Semanal"
        BIWEEKLY = "biweekly", "Quincenal"
        MONTHLY = "monthly", "Mensual"

    frequency = models.CharField(max_length=10, choices=Frequency)
    count = models.PositiveSmallIntegerField()
    start_on = models.DateField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )


@pghistory.track()
class Payable(CompanyScopedModel):
    """What the company owes a supplier (F15, decision 082).

    Accrual: the expense and the debt are recognized when the invoice
    arrives (a single obligation) or when each occurrence of a series falls
    due; payments, total or partial, lower the debt (#10).
    """

    class Status(models.TextChoices):
        OPEN = "open", "Abierta"
        PARTIAL = "partial", "Pago parcial"
        PAID = "paid", "Pagada"
        CANCELLED = "cancelled", "Cancelada"

    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    category = models.ForeignKey(ExpenseCategory, on_delete=models.PROTECT, related_name="+")
    party_name = models.CharField(max_length=200)
    party_document = models.CharField(max_length=11, blank=True)
    ncf = models.CharField(max_length=13, blank=True)
    description = models.CharField(max_length=300)
    amount = models.DecimalField(**MONEY)
    itbis = models.DecimalField(**MONEY, default=0)  # included in amount (606 report)
    due_on = models.DateField()
    series = models.ForeignKey(
        PayableSeries, null=True, blank=True, on_delete=models.PROTECT, related_name="payables"
    )
    occurrence = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(max_length=10, choices=Status, default=Status.OPEN)
    paid = models.DecimalField(**MONEY, default=0)
    recognized_on = models.DateField(null=True, blank=True)
    recognized_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    cancel_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="payable_amount_positive"),
            models.CheckConstraint(
                condition=Q(itbis__gte=0) & Q(itbis__lte=F("amount")), name="payable_itbis_range"
            ),
            models.CheckConstraint(
                condition=Q(paid__gte=0) & Q(paid__lte=F("amount")), name="payable_paid_range"
            ),
            models.CheckConstraint(
                condition=~Q(status="paid") | Q(paid=F("amount")), name="payable_paid_is_full"
            ),
            models.CheckConstraint(
                condition=Q(paid=0) | Q(recognized_entry__isnull=False),
                name="payable_paid_after_recognized",
            ),
        ]
        indexes = [models.Index(fields=["company", "status", "due_on"])]

    @property
    def outstanding(self):
        return self.amount - self.paid

    def __str__(self) -> str:
        return f"{self.party_name}: {self.description}"


class PayablePayment(CompanyScopedModel):
    """A payment of an obligation, from a cash box or bank (append-only)."""

    payable = models.ForeignKey(Payable, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(**MONEY)
    date = models.DateField()
    account = models.ForeignKey(FinancialAccount, on_delete=models.PROTECT, related_name="+")
    method = models.CharField(
        max_length=10, choices=Expense.Method, default=Expense.Method.TRANSFER
    )
    reference = models.CharField(max_length=100, blank=True)
    entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, related_name="+")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="payable_payment_positive"),
        ]
