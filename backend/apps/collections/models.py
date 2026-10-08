"""Collections: the day's route, visits, collectors' location and the
daily delinquency picture (doc 05 - section 4.7).

Phase 4 builds the route (F6), the visit result and the nightly snapshot;
promises, escalation and the agenda arrive in phase 5 on the same models.
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
        NOT_HOME = "not_home", "No estaba"
        PROMISED = "promised", "Prometió pagar"
        REFUSED = "refused", "Se negó"
        OTHER = "other", "Otro"

    loan = models.ForeignKey(Loan, on_delete=models.PROTECT, related_name="actions")
    customer = models.ForeignKey(
        "customers.Customer", on_delete=models.PROTECT, related_name="collection_actions"
    )
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=10, choices=Kind)
    result = models.CharField(max_length=10, choices=Result)
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
