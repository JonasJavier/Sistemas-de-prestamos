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
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["company", "name"], name="financial_account_name_unique"
            ),
        ]

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
        triggers = [_append_only("journal_entry_append_only")]

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
        ]
        triggers = [_append_only("journal_line_append_only"), BALANCED_ENTRY_TRIGGER]
