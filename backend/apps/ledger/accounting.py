"""P56 «Contabilidad» (F15, decision 080): periods, manual entries and the
books built from the immutable ledger: journal, general ledger, trial
balance, income statement and balance sheet.

Every figure is read from the journal lines, never from a cache, so the
statements agree with the books to the cent by construction; the balance
sheet balances because every entry does.
"""

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal
from uuid import UUID

from django.db import transaction
from django.db.models import Q, QuerySet, Sum

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Branch
from apps.ledger import chart
from apps.ledger import services as ledger
from apps.ledger.models import AccountingPeriod, JournalEntry, JournalLine, LedgerAccount
from engine.money import money

ZERO = Decimal("0.00")


class AccountingError(ledger.LedgerError):
    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


# --- Periods ------------------------------------------------------------------------------------


def is_closed(company_id: UUID, on: dt.date) -> bool:
    return AccountingPeriod.objects.filter(
        company_id=company_id, year=on.year, month=on.month, status=AccountingPeriod.Status.CLOSED
    ).exists()


def ensure_open(company_id: UUID, on: dt.date) -> None:
    """The friendly refusal; the database trigger is the second barrier."""
    if is_closed(company_id, on):
        raise AccountingError(
            f"El mes {on:%m/%Y} está cerrado: no admite movimientos con esa fecha.", "closed"
        )


def month_bounds(year: int, month: int) -> tuple[dt.date, dt.date]:
    first = dt.date(year, month, 1)
    following = dt.date(year + (month == 12), month % 12 + 1, 1)
    return first, following - dt.timedelta(days=1)


# --- Manual entries («Ajustes contables con motivo», G only) -------------------------------------


@dataclass
class ManualLine:
    account: LedgerAccount
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    memo: str = ""


@transaction.atomic
def manual_entry(
    *,
    user: User,
    branch: Branch,
    on: dt.date,
    description: str,
    lines: list[ManualLine],
) -> JournalEntry:
    if not authz.has_any_role(user, authz.GERENTE):
        raise AccountingError("Solo el gerente registra ajustes contables.", "forbidden")
    if not description.strip():
        raise AccountingError("Escribe el motivo del ajuste.", "description")
    if len(lines) < 2:
        raise AccountingError("Un asiento necesita al menos dos líneas.", "lines")
    ensure_open(user.company_id, on)
    posted = []
    for line in lines:
        account = line.account
        if account.system_key in chart.SUBLEDGER_KEYS:
            raise AccountingError(
                f"«{account.name}» lleva un registro auxiliar: solo la mueve su operación.",
                "account",
            )
        financial = getattr(account, "financial_account", None)
        if financial is not None and financial.is_personal:
            raise AccountingError(ledger.PERSONAL_ACCOUNT_ERROR, "account")
        if not account.is_active:
            raise AccountingError(f"«{account.name}» está inactiva.", "account")
        posted.append(
            ledger.Line(
                account=account,
                debit=money(line.debit),
                credit=money(line.credit),
                memo=line.memo[:200],
                financial_account=financial,
            )
        )
    entry = ledger.post_entry(
        company_id=user.company_id,
        branch=branch,
        on=on,
        description=f"Ajuste contable: {description.strip()}"[:300],
        source_type="ledger.manual",
        source_id=None,
        lines=posted,
        created_by=user,
    )
    record_event(
        company_id=user.company_id,
        type="ledger.manual_entry",
        target=entry,
        actor=user,
        summary=f"Ajuste contable {entry.number}: {description.strip()}",
    )
    return entry


# --- The books ----------------------------------------------------------------------------------


def _lines(branch_id: UUID | None) -> QuerySet:
    lines = JournalLine.objects.all()
    if branch_id:
        lines = lines.filter(branch_id=branch_id)
    return lines


def _natural(account: LedgerAccount, debit: Decimal, credit: Decimal) -> Decimal:
    return debit - credit if account.debit_normal else credit - debit


@dataclass
class TrialRow:
    account: LedgerAccount
    opening: Decimal
    debit: Decimal
    credit: Decimal
    closing: Decimal


def trial_balance(
    date_from: dt.date, date_to: dt.date, *, branch_id: UUID | None = None
) -> list[TrialRow]:
    """Every account with movement or balance: opening, period and closing,
    on each account's natural side."""
    lines = _lines(branch_id)
    before = {
        row["account_id"]: (row["d"] or ZERO, row["c"] or ZERO)
        for row in lines.filter(entry__date__lt=date_from)
        .values("account_id")
        .annotate(d=Sum("debit"), c=Sum("credit"))
    }
    during = {
        row["account_id"]: (row["d"] or ZERO, row["c"] or ZERO)
        for row in lines.filter(entry__date__gte=date_from, entry__date__lte=date_to)
        .values("account_id")
        .annotate(d=Sum("debit"), c=Sum("credit"))
    }
    rows = []
    for account in LedgerAccount.objects.filter(id__in=set(before) | set(during)).order_by("code"):
        d0, c0 = before.get(account.id, (ZERO, ZERO))
        d1, c1 = during.get(account.id, (ZERO, ZERO))
        opening = _natural(account, d0, c0)
        closing = _natural(account, d0 + d1, c0 + c1)
        if not (opening or d1 or c1 or closing):
            continue
        rows.append(TrialRow(account, opening, d1, c1, closing))
    return rows


@dataclass
class Section:
    title: str
    rows: list[tuple[LedgerAccount, Decimal]] = field(default_factory=list)

    @property
    def total(self) -> Decimal:
        return sum((amount for _, amount in self.rows), ZERO)


def _balances(
    types: list[str], *, date_from: dt.date | None, date_to: dt.date, branch_id: UUID | None
) -> list[tuple[LedgerAccount, Decimal]]:
    lines = _lines(branch_id).filter(entry__date__lte=date_to, account__type__in=types)
    if date_from is not None:
        lines = lines.filter(entry__date__gte=date_from)
    totals = {
        row["account_id"]: (row["d"] or ZERO, row["c"] or ZERO)
        for row in lines.values("account_id").annotate(d=Sum("debit"), c=Sum("credit"))
    }
    result = []
    for account in LedgerAccount.objects.filter(id__in=totals).order_by("code"):
        amount = _natural(account, *totals[account.id])
        if amount:
            result.append((account, amount))
    return result


@dataclass
class IncomeStatement:
    date_from: dt.date
    date_to: dt.date
    income: Section
    expenses: Section

    @property
    def result(self) -> Decimal:
        return self.income.total - self.expenses.total


def income_statement(
    date_from: dt.date, date_to: dt.date, *, branch_id: UUID | None = None
) -> IncomeStatement:
    """Income minus expenses of the period. The owner's withdrawals are
    equity, so they never lower the result (#12)."""
    income = Section(
        "Ingresos",
        _balances(
            [LedgerAccount.Type.INCOME], date_from=date_from, date_to=date_to, branch_id=branch_id
        ),
    )
    expenses = Section(
        "Gastos",
        _balances(
            [LedgerAccount.Type.EXPENSE], date_from=date_from, date_to=date_to, branch_id=branch_id
        ),
    )
    return IncomeStatement(date_from, date_to, income, expenses)


@dataclass
class BalanceSheet:
    as_of: dt.date
    assets: Section
    liabilities: Section
    equity: Section
    retained: Decimal  # results of earlier years
    current: Decimal  # result of this year up to the date

    @property
    def equity_total(self) -> Decimal:
        return self.equity.total + self.retained + self.current

    @property
    def balances(self) -> bool:
        return self.assets.total == self.liabilities.total + self.equity_total


def balance_sheet(as_of: dt.date, *, branch_id: UUID | None = None) -> BalanceSheet:
    year_start = dt.date(as_of.year, 1, 1)
    earlier = income_statement(
        dt.date(1900, 1, 1), year_start - dt.timedelta(days=1), branch_id=branch_id
    )
    this_year = income_statement(year_start, as_of, branch_id=branch_id)
    kind = LedgerAccount.Type
    return BalanceSheet(
        as_of=as_of,
        assets=Section(
            "Activos", _balances([kind.ASSET], date_from=None, date_to=as_of, branch_id=branch_id)
        ),
        liabilities=Section(
            "Pasivos",
            _balances([kind.LIABILITY], date_from=None, date_to=as_of, branch_id=branch_id),
        ),
        equity=Section(
            "Patrimonio",
            _balances([kind.EQUITY], date_from=None, date_to=as_of, branch_id=branch_id),
        ),
        retained=earlier.result,
        current=this_year.result,
    )


@dataclass
class LedgerRow:
    line: JournalLine
    balance: Decimal


def account_ledger(
    account: LedgerAccount,
    date_from: dt.date,
    date_to: dt.date,
    *,
    branch_id: UUID | None = None,
    limit: int = 1000,
) -> tuple[Decimal, list[LedgerRow], bool]:
    """The account's movements with a running balance (the general ledger)."""
    lines = _lines(branch_id).filter(account=account)
    opening_totals = lines.filter(entry__date__lt=date_from).aggregate(
        d=Sum("debit"), c=Sum("credit")
    )
    opening = _natural(account, opening_totals["d"] or ZERO, opening_totals["c"] or ZERO)
    period = (
        lines.filter(entry__date__gte=date_from, entry__date__lte=date_to)
        .select_related("entry")
        .order_by("entry__date", "entry__created_at", "id")
    )
    rows, balance = [], opening
    for line in period[: limit + 1]:
        balance += _natural(account, line.debit, line.credit)
        rows.append(LedgerRow(line, balance))
    truncated = len(rows) > limit
    return opening, rows[:limit], truncated


def journal(date_from: dt.date, date_to: dt.date, *, branch_id: UUID | None = None) -> QuerySet:
    entries = JournalEntry.objects.filter(date__gte=date_from, date__lte=date_to)
    if branch_id:
        entries = entries.filter(Q(branch_id=branch_id) | Q(lines__branch_id=branch_id)).distinct()
    return entries.order_by("-date", "-created_at")


# --- P61 · Management results (cash basis) -----------------------------------------------------

ACCRUAL_SOURCES = ("ledger.accrual", "ledger.accrual_cancel")
INCOME_GROUPS = (
    ("interest_income", "Intereses cobrados"),
    ("late_fee_income", "Mora cobrada"),
    ("charge_income", "Cargos cobrados"),
    ("recovery_income", "Recuperación de cartera castigada"),
)


@dataclass
class ManagementResults:
    date_from: dt.date
    date_to: dt.date
    income: list[tuple[str, Decimal]]
    expenses: list[tuple[LedgerAccount, Decimal]]
    write_offs: Decimal
    owner_withdrawals: Decimal
    owner_capital: Decimal
    months: list[dict]

    @property
    def income_total(self) -> Decimal:
        return sum((amount for _, amount in self.income), ZERO)

    @property
    def expense_total(self) -> Decimal:
        return sum((amount for _, amount in self.expenses), ZERO)

    @property
    def result(self) -> Decimal:
        return self.income_total - self.expense_total


def management_results(
    date_from: dt.date, date_to: dt.date, *, branch_id: UUID | None = None
) -> ManagementResults:
    """«Ganancia cobrada» (doc 09): interest, late fees and charges as they
    were collected, other income, minus operating expenses. The month-end
    accrual is left out (it is accounting, not cash) and the owner's
    movements are shown apart (#12)."""
    lines = (
        _lines(branch_id)
        .filter(entry__date__gte=date_from, entry__date__lte=date_to)
        .exclude(entry__source_type__in=ACCRUAL_SOURCES)
    )
    totals = {
        row["account_id"]: (row["d"] or ZERO, row["c"] or ZERO)
        for row in lines.values("account_id").annotate(d=Sum("debit"), c=Sum("credit"))
    }
    accounts = {a.id: a for a in LedgerAccount.objects.filter(id__in=totals)}
    by_key = {a.system_key: _natural(a, *totals[a.id]) for a in accounts.values() if a.system_key}
    income = [(label, by_key.get(key, ZERO)) for key, label in INCOME_GROUPS]
    grouped = {key for key, _ in INCOME_GROUPS}
    others = sum(
        (
            _natural(a, *totals[a.id])
            for a in accounts.values()
            if a.type == LedgerAccount.Type.INCOME and a.system_key not in grouped
        ),
        ZERO,
    )
    income.append(("Otros ingresos", others))
    expenses = sorted(
        (
            (a, _natural(a, *totals[a.id]))
            for a in accounts.values()
            if a.type == LedgerAccount.Type.EXPENSE and a.system_key != "write_off_expense"
        ),
        key=lambda row: row[0].code,
    )
    months = []
    cursor = date_from.replace(day=1)
    while cursor <= date_to:
        first, last = month_bounds(cursor.year, cursor.month)
        span = lines.filter(
            entry__date__gte=max(first, date_from), entry__date__lte=min(last, date_to)
        )
        income_m = span.filter(account__type=LedgerAccount.Type.INCOME).aggregate(
            d=Sum("debit"), c=Sum("credit")
        )
        expense_m = (
            span.filter(account__type=LedgerAccount.Type.EXPENSE)
            .exclude(account__system_key="write_off_expense")
            .aggregate(d=Sum("debit"), c=Sum("credit"))
        )
        got = (income_m["c"] or ZERO) - (income_m["d"] or ZERO)
        spent = (expense_m["d"] or ZERO) - (expense_m["c"] or ZERO)
        months.append(
            {"year": cursor.year, "month": cursor.month, "income": got, "expenses": spent}
        )
        cursor = last + dt.timedelta(days=1)
    return ManagementResults(
        date_from=date_from,
        date_to=date_to,
        income=income,
        expenses=[row for row in expenses if row[1]],
        write_offs=by_key.get("write_off_expense", ZERO),
        owner_withdrawals=-by_key.get("owner_withdrawals", ZERO),
        owner_capital=by_key.get("owner_equity", ZERO),
        months=months,
    )
