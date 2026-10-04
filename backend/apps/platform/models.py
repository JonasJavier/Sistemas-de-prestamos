"""Platform-side models: what the Cobradia owner manages (doc 05 - section 4.0).

These tables are global (no row-level security): tenants never query them
directly, except each company reading its own subscription through a
dedicated endpoint.
"""

import uuid

import pghistory
from django.conf import settings
from django.db import models


class TimeStamped(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


@pghistory.track()
class Plan(TimeStamped):
    """A commercial plan; prices and limits are finalized in phase 10 (decision 045)."""

    name = models.CharField(max_length=50, unique=True)
    monthly_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="DOP")
    max_users = models.PositiveIntegerField(null=True, blank=True)
    max_branches = models.PositiveIntegerField(null=True, blank=True)
    max_active_loans = models.PositiveIntegerField(null=True, blank=True)
    is_trial = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name


@pghistory.track()
class Subscription(TimeStamped):
    """One per company: its plan and payment standing."""

    class Status(models.TextChoices):
        TRIAL = "trial", "En prueba"
        ACTIVE = "active", "Activa"
        PAST_DUE = "past_due", "Atrasada"
        CANCELED = "canceled", "Cancelada"

    company = models.OneToOneField(
        "core.Company", on_delete=models.CASCADE, related_name="subscription"
    )
    plan = models.ForeignKey(Plan, on_delete=models.PROTECT, related_name="subscriptions")
    status = models.CharField(max_length=10, choices=Status, default=Status.TRIAL)
    started_on = models.DateField()
    paid_until = models.DateField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.company} - {self.plan} ({self.status})"


@pghistory.track()
class SubscriptionPayment(TimeStamped):
    """A manually recorded subscription payment (decision 045: no gateway yet)."""

    class Method(models.TextChoices):
        TRANSFER = "transfer", "Transferencia"
        DEPOSIT = "deposit", "Depósito"
        OTHER = "other", "Otro"

    subscription = models.ForeignKey(
        Subscription, on_delete=models.PROTECT, related_name="payments"
    )
    period_start = models.DateField()
    period_end = models.DateField()
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="DOP")
    method = models.CharField(max_length=10, choices=Method)
    reference = models.CharField(max_length=100, blank=True)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    def __str__(self) -> str:
        return f"{self.subscription.company} {self.period_start} - {self.period_end}"


@pghistory.track()
class SupportAccessGrant(TimeStamped):
    """Temporary, read-only, visible and audited support access (decision 046)."""

    company = models.ForeignKey(
        "core.Company", on_delete=models.CASCADE, related_name="support_grants"
    )
    granted_to = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="support_grants"
    )
    reason = models.CharField(max_length=300)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"Soporte en {self.company} hasta {self.ends_at:%d/%m/%Y %H:%M}"
