"""Payments: the receipt and its exact breakdown (doc 05 - section 4.5).

A ``Payment`` is the receipt; its ``PaymentAllocation`` rows say which
installment and which component (charges, late fee, interest, principal)
each peso went to. PostgreSQL enforces (doc 05 - section 7):

3. the allocations of a payment add up exactly to its applied amount
   (deferred constraint trigger, checked at commit);
8. idempotency keys are unique: a double click never charges twice;
and the breakdown, the waivers and the reversals are append-only. A
payment is never edited nor deleted: it is reversed (doc 03 - 10).
"""

import pghistory
import pgtrigger
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.core.models import Branch, CompanyScopedModel, Reason
from apps.customers.models import Customer
from apps.ledger.models import FinancialAccount, JournalEntry
from apps.lending.models import Installment, Loan, LoanTerms

MONEY = {"max_digits": 14, "decimal_places": 2}

# Fires once per inserted allocation, at COMMIT, under the row's own
# company (same technique as the balanced-entry trigger of the ledger).
ALLOCATIONS_ADD_UP_TRIGGER = pgtrigger.Trigger(
    name="payment_allocations_add_up",
    when=pgtrigger.After,
    operation=pgtrigger.Insert,
    timing=pgtrigger.Deferred,
    declare=[
        ("allocated", "numeric"),
        ("applied", "numeric"),
        ("previous_company", "text"),
    ],
    func="""
        previous_company := current_setting('app.current_company', true);
        PERFORM set_config('app.current_company', NEW.company_id::text, true);
        SELECT COALESCE(SUM(amount), 0) INTO allocated
          FROM payments_paymentallocation WHERE payment_id = NEW.payment_id;
        SELECT amount INTO applied FROM payments_payment WHERE id = NEW.payment_id;
        PERFORM set_config('app.current_company', COALESCE(previous_company, ''), true);
        IF allocated <> applied THEN
            RAISE EXCEPTION 'Pago %: el desglose suma % y el monto aplicado es %',
                NEW.payment_id, allocated, applied
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
    """,
)


def _append_only(name: str) -> pgtrigger.Protect:
    return pgtrigger.Protect(name=name, operation=pgtrigger.Update | pgtrigger.Delete)


@pghistory.track()
class Payment(CompanyScopedModel):
    class Method(models.TextChoices):
        CASH = "cash", "Efectivo"
        TRANSFER = "transfer", "Transferencia"
        DEPOSIT = "deposit", "Depósito"
        CHECK = "check", "Cheque"

    class Kind(models.TextChoices):
        REGULAR = "regular", "Cobro"
        PAYOFF = "payoff", "Liquidación"
        PREPAYMENT = "prepayment", "Abono a capital"
        MIGRATED = "migrated", "Migrado"

    class Status(models.TextChoices):
        POSTED = "posted", "Registrado"
        REVERSED = "reversed", "Reversado"

    number = models.CharField(max_length=30)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="payments")
    customer = models.ForeignKey(Customer, on_delete=models.PROTECT, related_name="payments")
    kind = models.CharField(max_length=12, choices=Kind, default=Kind.REGULAR)
    status = models.CharField(max_length=10, choices=Status, default=Status.POSTED)

    paid_at = models.DateTimeField()
    value_date = models.DateField()  # business date, Santo Domingo
    method = models.CharField(max_length=10, choices=Method)
    reference = models.CharField(max_length=60, blank=True)
    received = models.DecimalField(**MONEY)  # what the customer handed over
    change = models.DecimalField(**MONEY, default=0)
    amount = models.DecimalField(**MONEY)  # applied: received - change
    currency = models.CharField(max_length=3, default="DOP")
    # Shown apart on the receipt (doc 03 - 7 and 9): never added to «amount».
    late_fee_waived = models.DecimalField(**MONEY, default=0)
    interest_waived = models.DecimalField(**MONEY, default=0)  # payoff: future interest
    discount = models.DecimalField(**MONEY, default=0)  # authorized payoff discount
    # «Saldo posterior» on the receipt: frozen when the payment is made.
    principal_after = models.DecimalField(**MONEY, default=0)
    owed_after = models.DecimalField(**MONEY, default=0)  # everything still scheduled

    # Where the money went: a cashier's session, a collector's route or a bank.
    financial_account = models.ForeignKey(
        FinancialAccount, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    cash_session = models.ForeignKey(
        "cash.CashSession",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    route_session = models.ForeignKey(
        "cash.RouteSession",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="payments",
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    off_route = models.BooleanField(default=False)  # a collector's payment outside today's route

    prepayment_mode = models.CharField(max_length=15, blank=True)
    new_terms = models.OneToOneField(
        LoanTerms, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    idempotency_key = models.CharField(max_length=64)
    journal_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="payment"
    )
    # The WhatsApp link (decision 024): unguessable, revocable.
    receipt_token = models.CharField(max_length=64, unique=True)
    receipt_revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "number"], name="payment_number_unique"),
            models.UniqueConstraint(
                fields=["company", "idempotency_key"], name="payment_idempotency_unique"
            ),
            models.CheckConstraint(
                condition=Q(amount__gt=0)
                & Q(change__gte=0)
                & Q(received=F("amount") + F("change"))
                & Q(late_fee_waived__gte=0)
                & Q(interest_waived__gte=0)
                & Q(discount__gte=0),
                name="payment_amounts_consistent",
            ),
            # Only cash gives change (E11).
            models.CheckConstraint(
                condition=Q(method="cash") | Q(change=0), name="payment_change_only_cash"
            ),
            # Migrated payments do not move money (doc 03 - section 11).
            models.CheckConstraint(
                condition=Q(kind="migrated") | Q(journal_entry__isnull=False),
                name="payment_posted_to_the_ledger",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "loan", "value_date"]),
            models.Index(fields=["company", "branch", "value_date"]),
        ]

    def __str__(self) -> str:
        return self.number


class PaymentAllocation(CompanyScopedModel):
    """One component of one installment paid by one payment (the breakdown)."""

    class Component(models.TextChoices):
        CHARGES = "charges", "Cargos"
        LATE_FEE = "late_fee", "Mora"
        INTEREST = "interest", "Interés"
        PRINCIPAL = "principal", "Capital"

    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="allocations")
    installment = models.ForeignKey(
        Installment, on_delete=models.PROTECT, related_name="allocations"
    )
    component = models.CharField(max_length=10, choices=Component)
    amount = models.DecimalField(**MONEY)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="allocation_positive"),
            models.UniqueConstraint(
                fields=["payment", "installment", "component"], name="allocation_unique"
            ),
        ]
        triggers = [_append_only("allocation_append_only"), ALLOCATIONS_ADD_UP_TRIGGER]


class PaymentReversal(CompanyScopedModel):
    """A whole payment undone, with its inverse entry (doc 03 - 10, F12)."""

    payment = models.OneToOneField(Payment, on_delete=models.PROTECT, related_name="reversal")
    reason = models.ForeignKey(Reason, on_delete=models.PROTECT, related_name="+")
    note = models.TextField()
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    authorized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    approval = models.OneToOneField(
        "core.ApprovalRequest", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    reversed_on = models.DateField()
    journal_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    cash_session = models.ForeignKey(
        "cash.CashSession", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # «Corregir pago»: the right payment, registered in the same operation.
    replacement = models.OneToOneField(
        Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="replaces"
    )
    restored_terms = models.OneToOneField(
        LoanTerms, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            # Nobody authorizes their own reversal (doc 06 - section 4).
            models.CheckConstraint(
                condition=~Q(authorized_by=F("requested_by")),
                name="reversal_not_self_authorized",
            ),
        ]
        triggers = [pgtrigger.Protect(name="reversal_no_delete", operation=pgtrigger.Delete)]


class LateFeeWaiver(CompanyScopedModel):
    """A late fee forgiven, with permission and reason; it only ever lowers it."""

    installment = models.ForeignKey(Installment, on_delete=models.PROTECT, related_name="waivers")
    payment = models.ForeignKey(
        Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="waivers"
    )
    amount = models.DecimalField(**MONEY)
    note = models.CharField(max_length=300)
    authorized_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    approval = models.ForeignKey(
        "core.ApprovalRequest", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="waiver_positive"),
        ]
        triggers = [_append_only("waiver_append_only")]


class PayoffQuote(CompanyScopedModel):
    """«Carta de saldo» (F10): the same computation the payoff uses."""

    number = models.CharField(max_length=30)
    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="payoff_quotes")
    as_of = models.DateField()
    valid_until = models.DateField()
    breakdown = models.JSONField()
    total = models.DecimalField(**MONEY)
    verification_token = models.CharField(max_length=64, unique=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "number"], name="payoff_quote_number_unique"
            ),
            models.CheckConstraint(
                condition=Q(valid_until__gte=F("as_of")), name="payoff_quote_validity"
            ),
        ]
        triggers = [_append_only("payoff_quote_append_only")]
