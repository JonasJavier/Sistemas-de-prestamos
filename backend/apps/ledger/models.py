"""The immutable ledger (doc 05 - section 4.9; decisions 011 and 032).

Every money movement is a balanced journal entry; balances are derived
from it. PostgreSQL enforces the rules even if application code fails
(doc 05 - section 7):

1. every entry balances (deferred constraint trigger, checked at commit);
2. entries and lines admit no UPDATE nor DELETE (triggers);
9. an account that does not allow negatives never goes below zero
   (CHECK on the balance row, which services update under a row lock);
10. amounts are never negative: the side gives the sign.
"""

import pghistory
import pgtrigger
from django.conf import settings
from django.db import models
from django.db.models import Q

from apps.core.models import Branch, CompanyScopedModel
from apps.ledger import chart

# Fires once per inserted line, at COMMIT: by then the whole entry exists.
# The check reads the entry's lines under the row's own company (the row
# already passed the RLS WITH CHECK when it was inserted), so it does not
# depend on the session still carrying the tenant at commit time; the
# previous value is restored right after.
BALANCED_ENTRY_TRIGGER = pgtrigger.Trigger(
    name="entry_balanced",
    when=pgtrigger.After,
    operation=pgtrigger.Insert,
    timing=pgtrigger.Deferred,
    declare=[
        ("total_debit", "numeric"),
        ("total_credit", "numeric"),
        ("line_count", "int"),
        ("previous_company", "text"),
    ],
    func="""
        previous_company := current_setting('app.current_company', true);
        PERFORM set_config('app.current_company', NEW.company_id::text, true);
        SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0), COUNT(*)
          INTO total_debit, total_credit, line_count
          FROM ledger_journalline WHERE entry_id = NEW.entry_id;
        PERFORM set_config('app.current_company', COALESCE(previous_company, ''), true);
        IF total_debit <> total_credit OR line_count < 2 THEN
            RAISE EXCEPTION 'Asiento % desbalanceado: débitos %, créditos %, líneas %',
                NEW.entry_id, total_debit, total_credit, line_count
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NULL;
    """,
)


# A closed month refuses entries even if code forgets to ask (decision 080):
# the period row is read under the entry's own company, like the balance check.
CLOSED_PERIOD_TRIGGER = pgtrigger.Trigger(
    name="entry_period_open",
    when=pgtrigger.Before,
    operation=pgtrigger.Insert,
    func="""
        IF EXISTS (
            SELECT 1 FROM ledger_accountingperiod
             WHERE company_id = NEW.company_id
               AND year = EXTRACT(YEAR FROM NEW.date)
               AND month = EXTRACT(MONTH FROM NEW.date)
               AND status = 'closed'
        ) THEN
            RAISE EXCEPTION 'El mes de % está cerrado: no admite asientos.',
                to_char(NEW.date, 'MM/YYYY')
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    """,
)


def _append_only(name: str) -> pgtrigger.Protect:
    return pgtrigger.Protect(name=name, operation=pgtrigger.Update | pgtrigger.Delete)


class LedgerAccount(CompanyScopedModel):
    class Type(models.TextChoices):
        ASSET = chart.ASSET, "Activo"
        LIABILITY = chart.LIABILITY, "Pasivo"
        EQUITY = chart.EQUITY, "Patrimonio"
        INCOME = chart.INCOME, "Ingreso"
        EXPENSE = chart.EXPENSE, "Gasto"

    code = models.CharField(max_length=20)
    name = models.CharField(max_length=150)
    type = models.CharField(max_length=10, choices=Type)
    # Phase 6: optional grouping for the statements (doc 05 - 4.9).
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    system_key = models.CharField(max_length=30, blank=True)
    is_system = models.BooleanField(default=False)
    allows_negative = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "code"], name="ledger_account_code_unique"),
            models.UniqueConstraint(
                fields=["company", "system_key"],
                condition=~Q(system_key=""),
                name="ledger_account_system_key_unique",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.code} {self.name}"

    @property
    def debit_normal(self) -> bool:
        """Assets and expenses grow with debits; the rest with credits."""
        return self.type in (self.Type.ASSET, self.Type.EXPENSE)


class AccountBalance(CompanyScopedModel):
    """Cached balance on the account's normal side (doc 05: AccountBalance).

    Services lock this row (SELECT ... FOR UPDATE) in the same transaction
    as the entry; the nightly reconciliation recomputes it from the lines.
    """

    account = models.OneToOneField(LedgerAccount, on_delete=models.PROTECT, related_name="balance")
    balance = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    allows_negative = models.BooleanField(default=True)  # copy, so the CHECK can see it

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(allows_negative=True) | Q(balance__gte=0),
                name="account_balance_no_overdraft",
            ),
        ]


class FinancialAccount(CompanyScopedModel):
    """Where money physically is: a cash box or a bank account (P53).

    Never overdrawn (reference defect #30): its ledger account does not
    allow negatives. Bank numbers are stored masked (doc 06 - section 7).
    """

    class Kind(models.TextChoices):
        CASH = "cash", "Caja"
        BANK = "bank", "Banco"
        # Phase 4: one per cashier and per collector, moved only through
        # their sessions (cash and route), never by hand (F6, F7).
        DRAWER = "drawer", "Caja de cajero"
        ROUTE = "route", "Efectivo de cobrador"

    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, choices=Kind)
    bank_name = models.CharField(max_length=100, blank=True)
    account_number_last4 = models.CharField(max_length=4, blank=True)
    branch = models.ForeignKey(
        Branch, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    currency = models.CharField(max_length=3, default="DOP")
    ledger_account = models.OneToOneField(
        LedgerAccount, on_delete=models.PROTECT, related_name="financial_account"
    )
    holder = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"], name="financial_account_name_unique"
            ),
            # A drawer or a collector's cash belongs to exactly one person.
            models.CheckConstraint(
                condition=Q(kind__in=["drawer", "route"], holder__isnull=False)
                | (~Q(kind__in=["drawer", "route"]) & Q(holder__isnull=True)),
                name="financial_account_holder_by_kind",
            ),
            models.UniqueConstraint(
                fields=["holder", "branch", "kind"],
                condition=Q(holder__isnull=False),
                name="financial_account_one_per_holder",
            ),
        ]

    @property
    def is_personal(self) -> bool:
        """Drawers and collectors' cash move only through their sessions."""
        return self.holder_id is not None

    def __str__(self) -> str:
        if self.account_number_last4:
            return f"{self.name} ••{self.account_number_last4}"
        return self.name


class JournalEntry(CompanyScopedModel):
    number = models.CharField(max_length=30)
    date = models.DateField()  # business date, Santo Domingo
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    description = models.CharField(max_length=300)
    source_type = models.CharField(max_length=50)  # e.g. "lending.disbursement"
    source_id = models.UUIDField(null=True, blank=True)
    reversal_of = models.OneToOneField(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="reversed_by"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["company", "number"], name="journal_number_unique"),
        ]
        indexes = [
            models.Index(fields=["company", "date"]),
            models.Index(fields=["company", "source_type", "source_id"]),
        ]
        triggers = [_append_only("journal_entry_append_only"), CLOSED_PERIOD_TRIGGER]

    def __str__(self) -> str:
        return f"{self.number} {self.description}"


class JournalLine(CompanyScopedModel):
    entry = models.ForeignKey(JournalEntry, on_delete=models.PROTECT, related_name="lines")
    account = models.ForeignKey(LedgerAccount, on_delete=models.PROTECT, related_name="lines")
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    currency = models.CharField(max_length=3, default="DOP")
    memo = models.CharField(max_length=200, blank=True)

    # Dimensions (doc 05 - section 4.9): cash movements are lines that
    # carry a financial account (or, from phase 4, a cash/route session).
    branch = models.ForeignKey(Branch, on_delete=models.PROTECT, related_name="+")
    financial_account = models.ForeignKey(
        FinancialAccount, null=True, blank=True, on_delete=models.PROTECT, related_name="lines"
    )
    loan = models.ForeignKey(
        "lending.Loan", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    customer = models.ForeignKey(
        "customers.Customer", null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    # A cashier's or collector's day (doc 05 - 4.6): the expected cash of a
    # session is the sum of its lines, so it can never disagree with the books.
    cash_session = models.ForeignKey(
        "cash.CashSession", null=True, blank=True, on_delete=models.PROTECT, related_name="lines"
    )
    route_session = models.ForeignKey(
        "cash.RouteSession", null=True, blank=True, on_delete=models.PROTECT, related_name="lines"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=Q(debit__gte=0) & Q(credit__gte=0), name="journal_line_non_negative"
            ),
            models.CheckConstraint(
                condition=(Q(debit__gt=0) & Q(credit=0)) | (Q(debit=0) & Q(credit__gt=0)),
                name="journal_line_one_side",
            ),
        ]
        indexes = [
            models.Index(fields=["company", "account", "entry"]),
            models.Index(fields=["company", "loan"]),
            models.Index(fields=["company", "cash_session"]),
            models.Index(fields=["company", "route_session"]),
        ]
        triggers = [_append_only("journal_line_append_only"), BALANCED_ENTRY_TRIGGER]


@pghistory.track()
class AccountingPeriod(CompanyScopedModel):
    """A month of the books (F15): open, or closed and locked."""

    class Status(models.TextChoices):
        OPEN = "open", "Abierto"
        CLOSED = "closed", "Cerrado"

    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=Status, default=Status.OPEN)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    checklist = models.JSONField(default=dict, blank=True)  # what was verified at closing
    reopen_reason = models.CharField(max_length=300, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "year", "month"], name="accounting_period_unique"
            ),
            models.CheckConstraint(
                condition=Q(month__gte=1) & Q(month__lte=12), name="accounting_period_month"
            ),
            models.CheckConstraint(
                condition=Q(status="open") | Q(closed_at__isnull=False),
                name="accounting_period_closed_has_time",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.month:02d}/{self.year}"


class BankReconciliation(CompanyScopedModel):
    """A bank account's month checked against its statement (F15, 083)."""

    class Status(models.TextChoices):
        DRAFT = "draft", "En curso"
        CLOSED = "closed", "Conciliada"

    account = models.ForeignKey(
        FinancialAccount, on_delete=models.PROTECT, related_name="reconciliations"
    )
    year = models.PositiveSmallIntegerField()
    month = models.PositiveSmallIntegerField()
    statement_closing = models.DecimalField(max_digits=16, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status, default=Status.DRAFT)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["account", "year", "month"], name="bank_reconciliation_unique"
            ),
            models.CheckConstraint(
                condition=Q(status="draft") | Q(closed_at__isnull=False),
                name="bank_reconciliation_closed_has_time",
            ),
        ]


class BankStatementLine(CompanyScopedModel):
    """One line of the imported statement and what it was matched to."""

    reconciliation = models.ForeignKey(
        BankReconciliation, on_delete=models.CASCADE, related_name="lines"
    )
    date = models.DateField()
    description = models.CharField(max_length=300)
    reference = models.CharField(max_length=100, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)  # + deposit, - withdrawal
    matched_line = models.OneToOneField(
        JournalLine, null=True, blank=True, on_delete=models.PROTECT, related_name="statement_line"
    )
    matched_at = models.DateTimeField(null=True, blank=True)
    matched_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        constraints = [
            models.CheckConstraint(condition=~Q(amount=0), name="statement_line_not_zero"),
        ]
        indexes = [models.Index(fields=["company", "reconciliation", "date"])]
