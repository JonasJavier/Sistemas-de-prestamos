"""Cashiers' and collectors' days (doc 05 - section 4.6; flows F6 and F7).

A ``CashSession`` is one cashier's day at one branch, over the cashier's
own drawer (a personal ``FinancialAccount``). A ``RouteSession`` is one
collector's day over the collector's cash. Neither has a movements table:
cash movements are journal lines carrying the session, so the expected
cash of a session always comes from the books (decision 032). Strict cash
(decision 025): one open session per person, enforced by the database.
"""

import pghistory
import pgtrigger
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.core.models import Branch, CompanyScopedModel, Reason
from apps.ledger.models import FinancialAccount, JournalEntry

MONEY = {"max_digits": 14, "decimal_places": 2}

# Dominican peso bills and coins counted at closing (F7 step 3).
DENOMINATIONS = ["2000", "1000", "500", "200", "100", "50", "25", "10", "5", "1"]


@pghistory.track()
class CashSession(CompanyScopedModel):
    class Status(models.TextChoices):
        OPEN = "open", "Abierta"
        CLOSED = "closed", "Cerrada"
        APPROVED = "approved", "Aprobada"

    number = models.CharField(max_length=30)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    drawer = models.ForeignKey(FinancialAccount, on_delete=models.PROTECT, related_name="sessions")
    status = models.CharField(max_length=10, choices=Status, default=Status.OPEN)
    business_date = models.DateField()

    opened_at = models.DateTimeField(auto_now_add=True)
    carried_over = models.DecimalField(**MONEY, default=0)  # left in the drawer last time
    funded_amount = models.DecimalField(**MONEY, default=0)  # moved in from the general cash
    funded_from = models.ForeignKey(
        FinancialAccount, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    closed_at = models.DateTimeField(null=True, blank=True)
    expected = models.DecimalField(**MONEY, null=True, blank=True)
    counted = models.DecimalField(**MONEY, null=True, blank=True)
    difference = models.DecimalField(**MONEY, null=True, blank=True)  # counted - expected
    difference_reason = models.ForeignKey(
        Reason, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    difference_note = models.TextField(blank=True)
    difference_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # What leaves the drawer at closing; the rest stays as next day's fund.
    returned_amount = models.DecimalField(**MONEY, default=0)
    returned_to = models.ForeignKey(
        FinancialAccount, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    approval_note = models.TextField(blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "number"], name="cash_session_number_unique"
            ),
            # Doc 05 - section 7, rule 5: one open session per cashier.
            models.UniqueConstraint(
                fields=["cashier"],
                condition=Q(status="open"),
                name="cash_session_one_open_per_cashier",
            ),
            models.CheckConstraint(
                condition=Q(carried_over__gte=0)
                & Q(funded_amount__gte=0)
                & Q(returned_amount__gte=0)
                & (Q(counted__isnull=True) | Q(counted__gte=0)),
                name="cash_session_amounts_non_negative",
            ),
            models.CheckConstraint(
                condition=Q(status="open")
                | (
                    Q(closed_at__isnull=False)
                    & Q(expected__isnull=False)
                    & Q(counted__isnull=False)
                    & Q(difference=F("counted") - F("expected"))
                ),
                name="cash_session_closed_consistent",
            ),
            # Nobody approves the closing of their own cash (doc 06 - section 4).
            models.CheckConstraint(
                condition=Q(approved_by__isnull=True) | ~Q(approved_by=F("cashier")),
                name="cash_session_not_self_approved",
            ),
        ]
        indexes = [models.Index(fields=["company", "branch", "status"])]

    def __str__(self) -> str:
        return self.number


class CashCount(CompanyScopedModel):
    """The closing count by denomination (F7 step 3); immutable."""

    session = models.ForeignKey(CashSession, on_delete=models.PROTECT, related_name="counts")
    denomination = models.DecimalField(max_digits=8, decimal_places=2)
    quantity = models.PositiveIntegerField()
    subtotal = models.DecimalField(**MONEY)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["session", "denomination"], name="cash_count_one_per_denomination"
            ),
            models.CheckConstraint(
                condition=Q(subtotal=F("denomination") * F("quantity")),
                name="cash_count_subtotal_consistent",
            ),
        ]
        triggers = [
            pgtrigger.Protect(
                name="cash_count_append_only", operation=pgtrigger.Update | pgtrigger.Delete
            )
        ]


@pghistory.track()
class RouteSession(CompanyScopedModel):
    """A collector's day: a small cash box in the collector's name (F6)."""

    class Status(models.TextChoices):
        OPEN = "open", "Abierta"
        SETTLED = "settled", "Rendida"

    collector = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    bag = models.ForeignKey(FinancialAccount, on_delete=models.PROTECT, related_name="routes")
    business_date = models.DateField()
    status = models.CharField(max_length=10, choices=Status, default=Status.OPEN)
    opened_at = models.DateTimeField(auto_now_add=True)
    # When the cash in hand first went over the company's limit (F6 control).
    limit_alerted_at = models.DateTimeField(null=True, blank=True)

    settled_at = models.DateTimeField(null=True, blank=True)
    expected = models.DecimalField(**MONEY, null=True, blank=True)
    delivered = models.DecimalField(**MONEY, null=True, blank=True)
    difference = models.DecimalField(**MONEY, null=True, blank=True)  # delivered - expected
    difference_reason = models.ForeignKey(
        Reason, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    difference_note = models.TextField(blank=True)
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    cash_session = models.ForeignKey(
        CashSession, null=True, blank=True, on_delete=models.PROTECT, related_name="settlements"
    )
    settlement_entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["collector"],
                condition=Q(status="open"),
                name="route_session_one_open_per_collector",
            ),
            models.CheckConstraint(
                condition=Q(status="open")
                | (
                    Q(settled_at__isnull=False)
                    & Q(expected__isnull=False)
                    & Q(delivered__gte=0)
                    & Q(difference=F("delivered") - F("expected"))
                ),
                name="route_session_settled_consistent",
            ),
            models.CheckConstraint(
                condition=Q(received_by__isnull=True) | ~Q(received_by=F("collector")),
                name="route_session_not_self_received",
            ),
        ]
        indexes = [models.Index(fields=["company", "branch", "status"])]


class RouteHandover(CompanyScopedModel):
    """Cash a collector leaves at a cashier's drawer before the day ends.

    Decision 075: the cash limit is only useful if the collector can unload
    without closing the route. The cashier counts it on the spot; whatever
    is left is settled at the end as usual. Append-only, like the books.
    """

    route = models.ForeignKey(RouteSession, on_delete=models.PROTECT, related_name="handovers")
    cash_session = models.ForeignKey(CashSession, on_delete=models.PROTECT, related_name="+")
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    amount = models.DecimalField(**MONEY)
    entry = models.OneToOneField(JournalEntry, on_delete=models.PROTECT, related_name="+")

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="route_handover_positive"),
        ]
        triggers = [
            pgtrigger.Protect(
                name="route_handover_append_only", operation=pgtrigger.Update | pgtrigger.Delete
            )
        ]


class CashDifference(CompanyScopedModel):
    """A shortage or an overage found when counting (decision 075).

    A shortage is owed by the person until repaid into a drawer or taken
    as a loss by the manager; an overage awaits a claim for 30 days (it may
    belong to a customer) and then becomes other income. ``resolved`` grows
    with each action; the nightly reconciliation compares what is open with
    the two ledger accounts.
    """

    class Kind(models.TextChoices):
        SHORTAGE = "shortage", "Faltante"
        OVERAGE = "overage", "Sobrante"

    class Status(models.TextChoices):
        OPEN = "open", "Por resolver"
        RESOLVED = "resolved", "Resuelta"

    kind = models.CharField(max_length=10, choices=Kind)
    amount = models.DecimalField(**MONEY)
    resolved = models.DecimalField(**MONEY, default=0)
    status = models.CharField(max_length=10, choices=Status, default=Status.OPEN)
    person = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    cash_session = models.ForeignKey(
        CashSession, null=True, blank=True, on_delete=models.PROTECT, related_name="differences"
    )
    route_session = models.ForeignKey(
        RouteSession, null=True, blank=True, on_delete=models.PROTECT, related_name="differences"
    )
    occurred_on = models.DateField()
    warned_at = models.DateTimeField(null=True, blank=True)  # a shortage open for 30 days

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="cash_difference_positive"),
            models.CheckConstraint(
                condition=Q(resolved__gte=0) & Q(resolved__lte=F("amount")),
                name="cash_difference_resolved_range",
            ),
            models.CheckConstraint(
                condition=~Q(status="resolved") | Q(resolved=F("amount")),
                name="cash_difference_resolved_full",
            ),
        ]
        indexes = [models.Index(fields=["company", "status", "kind"])]

    @property
    def outstanding(self):
        return self.amount - self.resolved


class CashDifferenceAction(CompanyScopedModel):
    """One step resolving a difference, with its entry (append-only)."""

    class Action(models.TextChoices):
        REPAID = "repaid", "Repuesto por el responsable"
        LOSS = "loss", "Asumido como pérdida"
        APPLIED = "applied", "Aplicado (devuelto o cubre un pago)"
        INCOME = "income", "Pasado a otros ingresos"

    difference = models.ForeignKey(CashDifference, on_delete=models.PROTECT, related_name="actions")
    action = models.CharField(max_length=10, choices=Action)
    amount = models.DecimalField(**MONEY)
    entry = models.OneToOneField(
        JournalEntry, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    note = models.CharField(max_length=300, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=0), name="cash_difference_action_positive"
            ),
        ]
        triggers = [
            pgtrigger.Protect(
                name="cash_difference_action_append_only",
                operation=pgtrigger.Update | pgtrigger.Delete,
            )
        ]
