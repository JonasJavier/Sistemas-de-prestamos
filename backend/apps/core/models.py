"""Tenant foundation: companies, branches and shared abstract bases.

Every operational record in Cobradia carries a `company` foreign key
(decisions 041-042). `CompanyScopedModel` is the abstract base the rest
of the apps inherit from; PostgreSQL row-level security is layered on top
of it in the phase 1 RLS migration.
"""

import datetime as dt
import uuid
from decimal import Decimal

import pghistory
from django.conf import settings
from django.db import models
from django.db.models import F, Q

from apps.core.tenancy import TenantManager


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

    # Operating defaults of F3 (decision 027), editable per company.
    application_validity_days = models.PositiveSmallIntegerField(default=15)
    capacity_alert_ratio = models.DecimalField(
        max_digits=4, decimal_places=3, default=Decimal("0.400")
    )
    # F6 control: above this cash in hand the supervisor is warned (075).
    collector_cash_limit = models.DecimalField(
        max_digits=14, decimal_places=2, default=Decimal("25000.00")
    )
    # Decision 075: the company's own ceiling on a loan's annual effective
    # cost (a fraction; 2.5 = 250 %), on top of the legal one in settings.
    max_effective_annual_rate = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    # F13 (decision 094): past these days late the system suggests writing off.
    write_off_days = models.PositiveSmallIntegerField(default=180)

    def __str__(self) -> str:
        return self.trade_name or self.legal_name

    def effective_rate_ceiling(self) -> Decimal | None:
        """The stricter of the company's ceiling and the legal one."""
        ceilings = [self.max_effective_annual_rate]
        if settings.LEGAL_MAX_EFFECTIVE_ANNUAL_RATE:
            ceilings.append(Decimal(settings.LEGAL_MAX_EFFECTIVE_ANNUAL_RATE))
        known = [c for c in ceilings if c is not None]
        return min(known) if known else None


class CompanyScopedModel(TimeStampedModel):
    """Abstract base for every record that belongs to one tenant.

    ``objects`` only ever returns the running tenant's rows (barrier 1 of
    ``apps.core.tenancy``); RLS enforces the same thing in PostgreSQL.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="+")

    objects = TenantManager()

    class Meta:
        abstract = True


def default_workdays() -> list[int]:
    return [0, 1, 2, 3, 4, 5]  # Monday to Saturday (Python weekday numbers)


@pghistory.track()
class Branch(CompanyScopedModel):
    """A branch office; its code prefixes document numbers (decision 030)."""

    code = models.CharField(max_length=10)
    name = models.CharField(max_length=100)
    address = models.CharField(max_length=300, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True)
    # Decision 035: cashiers and collectors only work within these hours.
    opens_at = models.TimeField(default=dt.time(8, 0))
    closes_at = models.TimeField(default=dt.time(18, 0))
    workdays = models.JSONField(default=default_workdays)

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


class ApprovalRequest(CompanyScopedModel):
    """One mechanism for every authorization (doc 05 - 4.1, doc 06 - 4.6).

    Whoever is above their limit asks from the same screen; another person
    within the limit decides from their own session. A reversal runs when
    it is approved; a waiver or a discount is approved first and then used
    by the requester's payment, once.
    """

    class Kind(models.TextChoices):
        WAIVE_LATE_FEE = "waive_late_fee", "Condonar mora"
        PAYOFF_DISCOUNT = "payoff_discount", "Descuento en liquidación"
        REVERSAL = "reversal", "Reverso de pago"
        CORRECTION = "correction", "Corrección de pago"
        RESTRUCTURE = "restructure", "Reestructuración"

    class Status(models.TextChoices):
        PENDING = "pending", "Pendiente"
        APPROVED = "approved", "Aprobada"
        REJECTED = "rejected", "Rechazada"
        CANCELLED = "cancelled", "Cancelada"
        USED = "used", "Usada"
        EXPIRED = "expired", "Vencida"

    kind = models.CharField(max_length=20, choices=Kind)
    status = models.CharField(max_length=10, choices=Status, default=Status.PENDING)
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    target_type = models.CharField(max_length=50)
    target_id = models.UUIDField()
    target_label = models.CharField(max_length=60)  # «SD-000125» or «SD-R-000031»
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.ForeignKey(Reason, null=True, blank=True, on_delete=models.PROTECT)
    note = models.TextField()
    payload = models.JSONField(default=dict, blank=True)
    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    decided_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="approval_amount_positive"),
            # Nobody approves what they asked for (doc 06 - section 4, rule 1).
            models.CheckConstraint(
                condition=Q(decided_by__isnull=True) | ~Q(decided_by=F("requested_by")),
                name="approval_not_self_decided",
            ),
        ]
        indexes = [models.Index(fields=["company", "status", "kind"])]

    def __str__(self) -> str:
        return f"{self.get_kind_display()} {self.target_label}"


class PublicLink(TimeStampedModel):
    """A platform-wide index of the unguessable public links (decision 024):
    the receipt shared by WhatsApp, and the QR verifications of phase 9.

    It holds no business data, only which tenant and object a token points
    to, so a visitor without a session can be served inside that tenant's
    context. Revoking the link makes the token useless.
    """

    class Kind(models.TextChoices):
        RECEIPT = "receipt", "Recibo"
        DOCUMENT = "document", "Documento emitido"  # phase 9: its QR (decision 098)
        PORTAL = "portal", "Invitación al portal"  # phase 9: a customer's (decision 099)

    token = models.CharField(max_length=64, unique=True)
    tenant = models.UUIDField()  # the company; deliberately not a tenant-scoped FK
    kind = models.CharField(max_length=20, choices=Kind)
    object_id = models.UUIDField()
    revoked_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.kind} {self.object_id}"


class Sequence(CompanyScopedModel):
    """Gapless per-branch document numbering (decision 030).

    `allocate()` locks the row inside the caller's transaction, so the
    number is only consumed if the document commits with it. Rows are
    created on first use with the default prefix (``SD-000125``,
    ``SD-R-004512``); a company may later edit the prefix (P75).
    """

    class DocType(models.TextChoices):
        LOAN = "loan", "Préstamo"
        RECEIPT = "receipt", "Recibo"
        APPLICATION = "application", "Solicitud"
        CASH_SESSION = "cash_session", "Caja"
        PAYOFF_QUOTE = "payoff_quote", "Carta de saldo"
        EXPENSE = "expense", "Gasto"
        INCOME = "income", "Ingreso"
        JOURNAL = "journal", "Asiento"
        LEGAL_CASE = "legal_case", "Caso legal"

    # Letter between the branch code and the number; loans carry none.
    DEFAULT_INFIX = {
        DocType.LOAN: "",
        DocType.RECEIPT: "R-",
        DocType.APPLICATION: "S-",
        DocType.CASH_SESSION: "C-",
        DocType.PAYOFF_QUOTE: "CS-",
        DocType.EXPENSE: "G-",
        DocType.INCOME: "I-",
        DocType.JOURNAL: "A-",
        DocType.LEGAL_CASE: "L-",
    }

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
        # Race-free first use: two concurrent first documents both try the
        # insert, one wins, and both then queue on the same row lock.
        cls.objects.bulk_create(
            [
                cls(
                    company_id=branch.company_id,
                    branch=branch,
                    doc_type=doc_type,
                    prefix=f"{branch.code}-{cls.DEFAULT_INFIX[cls.DocType(doc_type)]}",
                )
            ],
            ignore_conflicts=True,
        )
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
