"""Tenant foundation: companies, branches and shared abstract bases.

Every operational record in Cobradia carries a `company` foreign key
(decisions 041-042). `CompanyScopedModel` is the abstract base the rest
of the apps inherit from; PostgreSQL row-level security is layered on top
of it in the phase 1 RLS migration.
"""

import uuid

import pghistory
from django.db import models


class TimeStampedModel(models.Model):
    """UUIDv7 primary key plus creation/update instants (doc 05 - section 2)."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid7, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


@pghistory.track()
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


@pghistory.track()
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


@pghistory.track()
class Holiday(CompanyScopedModel):
    """Per-company holiday calendar; seeded at signup (doc 03 - section 4).

    Fixed-date holidays arrive confirmed; the ones Dominican law moves to
    Monday arrive unconfirmed and each company confirms them yearly.
    """

    date = models.DateField()
    name = models.CharField(max_length=100)
    is_confirmed = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "date"], name="holiday_unique_per_company"),
        ]

    def __str__(self) -> str:
        return f"{self.date} {self.name}"


@pghistory.track()
class Reason(CompanyScopedModel):
    """Catalog of reasons for sensitive actions; a free note always accompanies it."""

    class Kind(models.TextChoices):
        REJECTION = "rejection", "Rechazo"
        REVERSAL = "reversal", "Reverso"
        WRITE_OFF = "write_off", "Castigo"
        VOID = "void", "Anulación"
        BLOCK = "block", "Bloqueo de cliente"
        DATE_CHANGE = "date_change", "Cambio de fecha"
        CASH_DIFFERENCE = "cash_difference", "Diferencia de caja"

    kind = models.CharField(max_length=20, choices=Kind)
    text = models.CharField(max_length=150)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "kind", "text"], name="reason_unique_per_company"
            ),
        ]

    def __str__(self) -> str:
        return self.text


class Sequence(CompanyScopedModel):
    """Gapless per-branch document numbering (decision 030).

    `allocate()` locks the row inside the caller's transaction, so the
    number is only consumed if the document commits with it.
    """

    class DocType(models.TextChoices):
        LOAN = "loan", "Préstamo"
        RECEIPT = "receipt", "Recibo"
        APPLICATION = "application", "Solicitud"
        CASH_SESSION = "cash_session", "Caja"
        PAYOFF_QUOTE = "payoff_quote", "Carta de saldo"
        EXPENSE = "expense", "Gasto"

    branch = models.ForeignKey(Branch, on_delete=models.CASCADE, related_name="sequences")
    doc_type = models.CharField(max_length=20, choices=DocType)
    prefix = models.CharField(max_length=15)
    next_value = models.BigIntegerField(default=1)
    padding = models.PositiveSmallIntegerField(default=6)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "branch", "doc_type"], name="sequence_unique_per_branch"
            ),
        ]

    def __str__(self) -> str:
        return f"{self.branch.code} {self.doc_type}"

    @classmethod
    def allocate(cls, branch: Branch, doc_type: str) -> str:
        """Return the next number (e.g. ``SD-000125``). Call inside a transaction."""
        seq = cls.objects.select_for_update().get(branch=branch, doc_type=doc_type)
        number = f"{seq.prefix}{seq.next_value:0{seq.padding}d}"
        seq.next_value += 1
        seq.save(update_fields=["next_value", "updated_at"])
        return number


class Province(TimeStampedModel):
    """Platform-wide geography catalog (doc 05 - section 4.1); no company column."""

    name = models.CharField(max_length=100, unique=True)

    def __str__(self) -> str:
        return self.name


class Municipality(TimeStampedModel):
    province = models.ForeignKey(Province, on_delete=models.CASCADE, related_name="municipalities")
    name = models.CharField(max_length=100)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["province", "name"], name="municipality_unique_per_province"
            ),
        ]

    def __str__(self) -> str:
        return self.name


class Sector(TimeStampedModel):
    municipality = models.ForeignKey(Municipality, on_delete=models.CASCADE, related_name="sectors")
    name = models.CharField(max_length=100)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["municipality", "name"], name="sector_unique_per_municipality"
            ),
        ]

    def __str__(self) -> str:
        return self.name
