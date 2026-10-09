"""F15 · Bank reconciliation (P56, decision 083).

Each month a bank account's statement (CSV or Excel) is imported and every
statement line is matched to a book movement of that bank, automatically
(same amount, at most three days apart) or by hand; a bank charge or
interest found only in the statement is booked from its line. The month is
reconciled when every statement line is matched and

    statement closing = book balance at month end - book items in transit

where «in transit» are book movements up to month end the bank has not
shown yet (deposits on the way, checks not cashed).
"""

import csv
import datetime as dt
import io
import re
import unicodedata
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.db.models import QuerySet, Sum
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Branch
from apps.core.text import plural
from apps.ledger import accounting, chart
from apps.ledger import services as ledger
from apps.ledger.models import (
    BankReconciliation,
    BankStatementLine,
    FinancialAccount,
    JournalLine,
    LedgerAccount,
)
from engine.money import money

ZERO = Decimal("0.00")
ROLES = (authz.GERENTE, authz.CONTABILIDAD)
MATCH_DAYS = 3
MAX_FILE_BYTES = 5 * 1024 * 1024


class BankingError(ledger.LedgerError):
    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


def _check(user: User) -> None:
    if not authz.has_any_role(user, *ROLES):
        raise BankingError("La conciliación la hacen el gerente y contabilidad.", "forbidden")


def _locked_draft(reconciliation: BankReconciliation) -> BankReconciliation:
    reconciliation = (
        BankReconciliation.objects.select_for_update(of=("self",))
        .select_related("account__ledger_account")
        .get(pk=reconciliation.pk)
    )
    if reconciliation.status != BankReconciliation.Status.DRAFT:
        raise BankingError("Esa conciliación ya está cerrada.", "state")
    return reconciliation


@transaction.atomic
def start(
    *, user: User, account: FinancialAccount, year: int, month: int, statement_closing: Decimal
) -> BankReconciliation:
    _check(user)
    if account.kind != FinancialAccount.Kind.BANK:
        raise BankingError("Solo se concilian las cuentas de banco.", "account")
    first, last = accounting.month_bounds(year, month)
    if first > timezone.localdate():
        raise BankingError("Ese mes todavía no empieza.", "month")
    reconciliation, created = BankReconciliation.objects.get_or_create(
        account=account,
        year=year,
        month=month,
        defaults={
            "company_id": account.company_id,
            "statement_closing": money(statement_closing),
            "created_by": user,
        },
    )
    if not created and reconciliation.status == BankReconciliation.Status.DRAFT:
        reconciliation.statement_closing = money(statement_closing)
        reconciliation.save(update_fields=["statement_closing", "updated_at"])
    return reconciliation


# --- Importing the statement ------------------------------------------------------------------


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", str(text or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", text.lower())


HEADERS = {
    "date": {"fecha", "date", "fechavalor", "fechaoperacion", "fechatransaccion"},
    "description": {"descripcion", "description", "concepto", "detalle", "transaccion"},
    "reference": {"referencia", "reference", "ref", "documento", "numero", "nodocumento"},
    "amount": {"monto", "amount", "importe", "valor"},
    "debit": {"debito", "debit", "retiro", "retiros", "cargo", "cargos", "salida"},
    "credit": {"credito", "credit", "deposito", "depositos", "abono", "abonos", "entrada"},
}


def _parse_amount(raw) -> Decimal | None:
    if raw is None or raw == "":
        return None
    if isinstance(raw, (int, float, Decimal)):
        return money(Decimal(str(raw)))
    text = str(raw).strip().replace("RD$", "").replace("$", "").replace(" ", "")
    negative = text.startswith("(") and text.endswith(")") or text.endswith("-")
    text = text.strip("()-") if negative else text
    if "," in text and "." in text:  # the last separator is the decimal one
        if text.rfind(".") > text.rfind(","):
            text = text.replace(",", "")
        else:
            text = text.replace(".", "").replace(",", ".")
    elif "," in text:  # 1,234 is thousands; 12,50 is a decimal comma
        decimals = text.rsplit(",", 1)[1]
        text = text.replace(",", "") if len(decimals) == 3 else text.replace(",", ".")
    try:
        value = money(Decimal(text))
    except InvalidOperation:
        return None
    return -value if negative else value


def _parse_date(raw) -> dt.date | None:
    if isinstance(raw, dt.datetime):
        return raw.date()
    if isinstance(raw, dt.date):
        return raw
    text = str(raw or "").strip()
    for pattern in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d"):
        try:
            return dt.datetime.strptime(text[:10], pattern).date()
        except ValueError:
            continue
    return None


def _rows(upload: UploadedFile) -> list[list]:
    if upload.size and upload.size > MAX_FILE_BYTES:
        raise BankingError("El extracto pesa más de 5 MB.", "file")
    head = upload.read(4)
    upload.seek(0)
    if head.startswith(b"PK"):  # .xlsx is a zip
        from openpyxl import load_workbook

        try:
            sheet = load_workbook(upload, read_only=True, data_only=True).active
        except Exception as exc:  # noqa: BLE001 - any broken workbook reads the same
            raise BankingError("No se pudo leer el archivo de Excel.", "file") from exc
        return [list(row) for row in sheet.iter_rows(values_only=True)]
    raw = upload.read()
    for encoding in ("utf-8-sig", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    try:
        dialect = csv.Sniffer().sniff(text[:2048], delimiters=",;\t")
    except csv.Error:  # one column or odd text: the header search explains it
        dialect = csv.excel
    return [row for row in csv.reader(io.StringIO(text), dialect)]


@dataclass
class Parsed:
    date: dt.date
    description: str
    reference: str
    amount: Decimal


def parse_statement(upload: UploadedFile) -> list[Parsed]:
    """Find the header row (date, description and an amount or debit/credit
    columns) and read every line under it."""
    rows = _rows(upload)
    columns: dict[str, int] = {}
    start = None
    for index, row in enumerate(rows[:30]):
        found = {}
        for position, cell in enumerate(row):
            name = _norm(cell)
            for key, names in HEADERS.items():
                if name in names and key not in found:
                    found[key] = position
        if "date" in found and ("amount" in found or "debit" in found or "credit" in found):
            columns, start = found, index + 1
            break
    if start is None:
        raise BankingError(
            "No encontré las columnas: el extracto necesita fecha y monto (o débito y crédito).",
            "file",
        )
    parsed = []
    for row in rows[start:]:

        def cell(key: str, row: list = row) -> object:
            position = columns.get(key)
            return row[position] if position is not None and position < len(row) else None

        date = _parse_date(cell("date"))
        if date is None:
            continue
        if "amount" in columns:
            amount = _parse_amount(cell("amount"))
        else:
            credit = _parse_amount(cell("credit")) or ZERO
            debit = _parse_amount(cell("debit")) or ZERO
            amount = abs(credit) - abs(debit)
        if not amount:
            continue
        parsed.append(
            Parsed(
                date=date,
                description=str(cell("description") or "").strip()[:300] or "Movimiento",
                reference=str(cell("reference") or "").strip()[:100],
                amount=amount,
            )
        )
    if not parsed:
        raise BankingError("El extracto no trae movimientos legibles.", "file")
    return parsed


@transaction.atomic
def import_statement(
    *, reconciliation: BankReconciliation, user: User, upload: UploadedFile
) -> tuple[int, int]:
    """Adds the lines (skipping ones already imported); returns (added, skipped)."""
    _check(user)
    reconciliation = _locked_draft(reconciliation)
    existing = set(reconciliation.lines.values_list("date", "amount", "description", "reference"))
    added = skipped = 0
    for line in parse_statement(upload):
        key = (line.date, line.amount, line.description, line.reference)
        if key in existing:
            skipped += 1
            continue
        BankStatementLine.objects.create(
            company_id=reconciliation.company_id,
            reconciliation=reconciliation,
            date=line.date,
            description=line.description,
            reference=line.reference,
            amount=line.amount,
        )
        existing.add(key)
        added += 1
    return added, skipped


# --- Matching ------------------------------------------------------------------------------------


def _signed(line: JournalLine) -> Decimal:
    return line.debit - line.credit  # a bank is an asset: debits are deposits


def unmatched_book_lines(reconciliation: BankReconciliation) -> QuerySet:
    """Book movements of the bank up to month end that no statement shows."""
    _, last = accounting.month_bounds(reconciliation.year, reconciliation.month)
    return (
        JournalLine.objects.filter(
            account_id=reconciliation.account.ledger_account_id, entry__date__lte=last
        )
        .filter(statement_line__isnull=True)
        .select_related("entry")
        .order_by("entry__date", "id")
    )


@transaction.atomic
def auto_match(*, reconciliation: BankReconciliation, user: User) -> int:
    _check(user)
    reconciliation = _locked_draft(reconciliation)
    candidates = list(unmatched_book_lines(reconciliation))
    taken: set = set()
    matched = 0
    for line in reconciliation.lines.filter(matched_line__isnull=True).order_by("date"):
        options = [
            book
            for book in candidates
            if book.id not in taken
            and _signed(book) == line.amount
            and abs((book.entry.date - line.date).days) <= MATCH_DAYS
        ]
        if not options:
            continue
        best = min(options, key=lambda book: abs((book.entry.date - line.date).days))
        line.matched_line, line.matched_at, line.matched_by = best, timezone.now(), user
        line.save(update_fields=["matched_line", "matched_at", "matched_by", "updated_at"])
        taken.add(best.id)
        matched += 1
    return matched


@transaction.atomic
def match(*, line: BankStatementLine, book: JournalLine, user: User) -> BankStatementLine:
    _check(user)
    reconciliation = _locked_draft(line.reconciliation)
    line = BankStatementLine.objects.select_for_update().get(pk=line.pk)
    if line.matched_line_id:
        raise BankingError("Esa línea ya está emparejada.", "state")
    if book.account_id != reconciliation.account.ledger_account_id:
        raise BankingError("Ese movimiento es de otra cuenta.", "book")
    if BankStatementLine.objects.filter(matched_line=book).exists():
        raise BankingError("Ese movimiento ya está emparejado con otra línea.", "book")
    if _signed(book) != line.amount:
        raise BankingError("Los montos no coinciden.", "book")
    line.matched_line, line.matched_at, line.matched_by = book, timezone.now(), user
    line.save(update_fields=["matched_line", "matched_at", "matched_by", "updated_at"])
    return line


@transaction.atomic
def unmatch(*, line: BankStatementLine, user: User) -> BankStatementLine:
    _check(user)
    _locked_draft(line.reconciliation)
    line = BankStatementLine.objects.select_for_update().get(pk=line.pk)
    line.matched_line, line.matched_at, line.matched_by = None, None, None
    line.save(update_fields=["matched_line", "matched_at", "matched_by", "updated_at"])
    return line


@transaction.atomic
def book_from_line(
    *,
    line: BankStatementLine,
    user: User,
    counterpart: LedgerAccount,
    branch: Branch,
    description: str = "",
) -> BankStatementLine:
    """A bank charge or interest the books did not have yet: entered from the
    statement line (expense or income against the bank) and matched to it."""
    _check(user)
    reconciliation = _locked_draft(line.reconciliation)
    line = BankStatementLine.objects.select_for_update().get(pk=line.pk)
    if line.matched_line_id:
        raise BankingError("Esa línea ya está emparejada.", "state")
    expected = LedgerAccount.Type.EXPENSE if line.amount < 0 else LedgerAccount.Type.INCOME
    if counterpart.type != expected or counterpart.system_key in chart.SUBLEDGER_KEYS:
        raise BankingError(
            "Un cargo del banco va a una cuenta de gasto; un abono, a una de ingreso.", "account"
        )
    bank = reconciliation.account
    amount = abs(line.amount)
    text = (description or line.description).strip()
    lines = (
        [
            ledger.debit(counterpart, amount, memo=text[:200]),
            ledger.cash_line(bank, credit_amount=amount),
        ]
        if line.amount < 0
        else [
            ledger.cash_line(bank, debit_amount=amount),
            ledger.credit(counterpart, amount, memo=text[:200]),
        ]
    )
    entry = ledger.post_entry(
        company_id=line.company_id,
        branch=branch,
        on=line.date,
        description=f"Según extracto de {bank.name}: {text}"[:300],
        source_type="ledger.bank_statement",
        source_id=line.id,
        lines=lines,
        created_by=user,
    )
    book = entry.lines.get(account_id=bank.ledger_account_id)
    line.matched_line, line.matched_at, line.matched_by = book, timezone.now(), user
    line.save(update_fields=["matched_line", "matched_at", "matched_by", "updated_at"])
    return line


# --- Result and closing --------------------------------------------------------------------------


@dataclass
class Summary:
    book_balance: Decimal  # bank account in the books at month end
    in_transit: Decimal  # book movements the bank has not shown yet (signed)
    unmatched_statement: int
    statement_closing: Decimal

    @property
    def expected_statement(self) -> Decimal:
        return self.book_balance - self.in_transit

    @property
    def difference(self) -> Decimal:
        return self.statement_closing - self.expected_statement

    @property
    def can_close(self) -> bool:
        return self.difference == 0 and self.unmatched_statement == 0


def summary(reconciliation: BankReconciliation) -> Summary:
    _, last = accounting.month_bounds(reconciliation.year, reconciliation.month)
    totals = JournalLine.objects.filter(
        account_id=reconciliation.account.ledger_account_id, entry__date__lte=last
    ).aggregate(d=Sum("debit"), c=Sum("credit"))
    in_transit = unmatched_book_lines(reconciliation).aggregate(d=Sum("debit"), c=Sum("credit"))
    return Summary(
        book_balance=(totals["d"] or ZERO) - (totals["c"] or ZERO),
        in_transit=(in_transit["d"] or ZERO) - (in_transit["c"] or ZERO),
        unmatched_statement=reconciliation.lines.filter(matched_line__isnull=True).count(),
        statement_closing=reconciliation.statement_closing,
    )


@transaction.atomic
def close(*, reconciliation: BankReconciliation, user: User) -> BankReconciliation:
    _check(user)
    reconciliation = _locked_draft(reconciliation)
    result = summary(reconciliation)
    if result.unmatched_statement:
        raise BankingError(
            f"Faltan {plural(result.unmatched_statement, 'línea', 'líneas')} del extracto por "
            "emparejar o registrar.",
            "unmatched",
        )
    if result.difference:
        raise BankingError(
            f"No cuadra: el extracto dice RD$ {result.statement_closing:,.2f} y el libro, menos "
            f"lo que está en tránsito, RD$ {result.expected_statement:,.2f}.",
            "difference",
        )
    reconciliation.status = BankReconciliation.Status.CLOSED
    reconciliation.closed_at, reconciliation.closed_by = timezone.now(), user
    reconciliation.save(update_fields=["status", "closed_at", "closed_by", "updated_at"])
    record_event(
        company_id=reconciliation.company_id,
        type="ledger.bank_reconciled",
        target=reconciliation,
        actor=user,
        summary=f"{reconciliation.account} conciliada: "
        f"{reconciliation.month:02d}/{reconciliation.year}",
    )
    return reconciliation


def pending_for_month(year: int, month: int) -> list[FinancialAccount]:
    """Active banks with movements or a balance that the month has not
    reconciled yet (the month-end checklist)."""
    _, last = accounting.month_bounds(year, month)
    first, _ = accounting.month_bounds(year, month)
    pending = []
    for bank in FinancialAccount.objects.filter(kind=FinancialAccount.Kind.BANK).select_related(
        "ledger_account"
    ):
        lines = JournalLine.objects.filter(account_id=bank.ledger_account_id, entry__date__lte=last)
        moved = lines.filter(entry__date__gte=first).exists()
        totals = lines.aggregate(d=Sum("debit"), c=Sum("credit"))
        balance = (totals["d"] or ZERO) - (totals["c"] or ZERO)
        if not (moved or balance):
            continue
        done = BankReconciliation.objects.filter(
            account=bank, year=year, month=month, status=BankReconciliation.Status.CLOSED
        ).exists()
        if not done:
            pending.append(bank)
    return pending
