"""Tenant foundation: companies, branches and shared abstract bases.

Every operational record in Cobradia carries a `company` foreign key
(decisions 041-042). `CompanyScopedModel` is the abstract base the rest
of the apps inherit from; PostgreSQL row-level security is layered on top
of it in the phase 1 RLS migration.
"""

import uuid

from django.db import models


class TimeStampedModel(models.Model):
    """UUIDv7 primary key plus creation/update instants (doc 05 - section 2)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Company(TimeStampedModel):
    """A tenant: one lending company using Cobradia (doc 05 - section 4.1)."""

    class Status(models.TextChoices):
        TRIAL = "trial", "En prueba"
        ACTIVE = "active", "Activa"
        SUSPENDED = "suspended", "Suspendida"
        CLOSED = "closed", "Cerrada"

    legal_name = models.CharField(max_length=200)
    trade_name = models.CharField(max_length=200, blank=True)
    rnc = models.CharField(max_length=11, blank=True)
    address = models.CharField(max_length=300, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    logo = models.ImageField(upload_to="company-logos/", blank=True)
    status = models.CharField(max_length=10, choices=Status, default=Status.TRIAL)
    trial_ends_on = models.DateField(null=True, blank=True)
    status_reason = models.CharField(max_length=300, blank=True)

    def __str__(self) -> str:
        return self.trade_name or self.legal_name


class CompanyScopedModel(TimeStampedModel):
    """Abstract base for every record that belongs to one tenant."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="+")

    class Meta:
        abstract = True


class Branch(CompanyScopedModel):
    """A branch office; its code prefixes document numbers (decision 030)."""

    code = models.CharField(max_length=10)
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=300, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "code"], name="branch_code_unique_per_company"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"
