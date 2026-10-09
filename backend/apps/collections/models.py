"""Collections: the day's route, visits, collectors' location and the
daily delinquency picture (doc 05 - section 4.7).

Phase 4 built the route (F6), the visit result and the nightly snapshot;
phase 5 adds promises, follow-ups (the agenda), escalation rules and the
collection agent of each loan (F8 steps 3-6, decisions 076-079).
"""

from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import Branch, CompanyScopedModel
from apps.lending.models import Loan

MONEY = {"max_digits": 14, "decimal_places": 2}


class CollectionAction(CompanyScopedModel):
    """A call, visit or message with its result (F8 step 3)."""

    class Kind(models.TextChoices):
        VISIT = "visit", "Visita"
        CALL = "call", "Llamada"
        MESSAGE = "message", "Mensaje"

    class Result(models.TextChoices):
        PAID = "paid", "Pagó"
        PROMISED = "promised", "Prometió pagar"
        CONTACTED = "contacted", "Habló, sin compromiso"
        NOT_HOME = "not_home", "No estaba"
        NO_ANSWER = "no_answer", "No contestó"
        WRONG_NUMBER = "wrong_number", "Número equivocado"
        REFUSED = "refused", "Se negó"
        OTHER = "other", "Otro"

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="actions")
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="collection_actions"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=10, choices=Kind)
    result = models.CharField(max_length=15, choices=Result)
    note = models.TextField(blank=True)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "loan", "created_at"])]


class RouteStop(CompanyScopedModel):
    """One loan to visit today; generated each morning (F6 step 1)."""

    class Reason(models.TextChoices):
        OVERDUE = "overdue", "Vencida"
        DUE_TODAY = "due_today", "Vence hoy"
        PROMISE = "promise", "Promesa de hoy"

    collector = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    date = models.DateField()
    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="route_stops")
    position = models.PositiveIntegerField()
    reason = models.CharField(max_length=10, choices=Reason)
    amount_due = models.DecimalField(**MONEY)  # overdue + due today, when generated
    visited_at = models.DateTimeField(null=True, blank=True)
    payment = models.ForeignKey(
        "payments.Payment", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    action = models.ForeignKey(
        CollectionAction, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["collector", "date", "loan"], name="route_stop_once_a_day"
            ),
        ]
        indexes = [models.Index(fields=["company", "collector", "date"])]


class LocationPing(CompanyScopedModel):
    """Decision 031: only with the route open; deleted after 90 days."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    route_session = models.ForeignKey(
        "cash.RouteSession", on_delete=models.PROTECT, related_name="pings"
    )
    at = models.DateTimeField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    accuracy = models.PositiveIntegerField(null=True, blank=True)  # meters

    class Meta:
        indexes = [models.Index(fields=["company", "route_session", "at"])]


class DelinquencySnapshot(CompanyScopedModel):
    """The nightly picture of each active loan (PAR over time, phase 7)."""

    date = models.DateField()
    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="snapshots")
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    days_past_due = models.PositiveIntegerField()
    bucket = models.CharField(max_length=10)
    principal_outstanding = models.DecimalField(**MONEY)
    principal_overdue = models.DecimalField(**MONEY)
    interest_overdue = models.DecimalField(**MONEY)
    late_fee_outstanding = models.DecimalField(**MONEY)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["loan", "date"], name="snapshot_once_a_day"),
            models.CheckConstraint(
                condition=Q(principal_overdue__gte=0) & Q(interest_overdue__gte=0),
                name="snapshot_non_negative",
            ),
        ]
        indexes = [models.Index(fields=["company", "date", "bucket"])]


class PaymentPromise(CompanyScopedModel):
    """A date and an amount the customer committed to (F8 step 4, decision 076).

    Kept when the payments since it was made reach the amount by its date;
    otherwise the nightly job marks it broken. One pending promise per loan:
    a new one replaces the previous (cancelled, with the reason).
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        KEPT = "kept", "Cumplida"
        BROKEN = "broken", "Incumplida"
        CANCELLED = "cancelled", "Cancelada"

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="promises")
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="promises"
    )
    action = models.ForeignKey(
        CollectionAction, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    promised_on = models.DateField()
    amount = models.DecimalField(**MONEY)
    status = models.CharField(max_length=10, choices=Status, default=Status.PENDING)
    paid = models.DecimalField(**MONEY, default=0)  # counted when resolved
    resolved_at = models.DateTimeField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["loan"], condition=Q(status="pending"), name="promise_one_pending_per_loan"
            ),
            models.CheckConstraint(condition=Q(amount__gt=0), name="promise_amount_positive"),
            models.CheckConstraint(
                condition=Q(status="pending") | Q(resolved_at__isnull=False),
                name="promise_resolved_has_time",
            ),
        ]
        indexes = [models.Index(fields=["company", "status", "promised_on"])]


class EscalationRule(CompanyScopedModel):
    """F8 step 5: past these days of delinquency, someone must act (077)."""

    class Action(models.TextChoices):
        REVIEW = "review", "Revisar el caso"
        INTIMATION = "intimation", "Preparar la intimación"
        LEGAL = "legal", "Proponer la vía legal"

    min_days = models.PositiveIntegerField()
    action = models.CharField(max_length=12, choices=Action)
    role = models.CharField(max_length=40)  # who acts: a role name of accounts.authz
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "action"], name="escalation_action_unique"),
            models.CheckConstraint(condition=Q(min_days__gte=1), name="escalation_days_positive"),
        ]


class CollectionTask(CompanyScopedModel):
    """A follow-up in someone's agenda (P44, decision 078).

    Assigned to one person, or to a role of the loan's branch (escalations:
    whoever has that role acts). An escalation task belongs to one
    delinquency episode, so the same rule does not fire twice for it.
    """

    class Kind(models.TextChoices):
        FOLLOW_UP = "follow_up", "Seguimiento"
        BROKEN_PROMISE = "broken_promise", "Promesa incumplida"
        ESCALATION = "escalation", "Escalamiento"

    class Status(models.TextChoices):
        OPEN = "open", "Pendiente"
        DONE = "done", "Hecho"
        CANCELLED = "cancelled", "Cancelado"

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="collection_tasks")
    kind = models.CharField(max_length=15, choices=Kind)
    status = models.CharField(max_length=10, choices=Status, default=Status.OPEN)
    due_on = models.DateField()
    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    assigned_role = models.CharField(max_length=40, blank=True)
    note = models.CharField(max_length=500, blank=True)
    rule = models.ForeignKey(
        EscalationRule, null=True, blank=True, on_delete=models.PROTECT, related_name="tasks"
    )
    episode_start = models.DateField(null=True, blank=True)  # oldest unpaid due date
    promise = models.ForeignKey(
        PaymentPromise, null=True, blank=True, on_delete=models.PROTECT, related_name="tasks"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    done_at = models.DateTimeField(null=True, blank=True)
    done_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    done_note = models.CharField(max_length=500, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=(Q(assigned_to__isnull=False) & Q(assigned_role=""))
                | (Q(assigned_to__isnull=True) & ~Q(assigned_role="")),
                name="task_one_assignee",
            ),
            models.CheckConstraint(
                condition=Q(status="open") | Q(done_at__isnull=False), name="task_closed_has_time"
            ),
            models.UniqueConstraint(
                fields=["loan", "rule", "episode_start"],
                condition=Q(kind="escalation"),
                name="task_escalation_once_per_episode",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "status", "due_on"]),
            models.Index(fields=["company", "assigned_to", "status"]),
        ]


class AgentAssignment(CompanyScopedModel):
    """Who manages a loan's collection and since when (F8 step 6, 079)."""

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="agent_history")
    agent = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    since = models.DateField()
    until = models.DateField(null=True, blank=True)
    note = models.CharField(max_length=300, blank=True)
    assigned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
