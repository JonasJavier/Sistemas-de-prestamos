"""Posting to the ledger: the only way money moves in Cobradía.

``post_entry`` validates the entry in Python (balanced, positive, same
company), then locks the affected balance rows in a fixed order (no
deadlocks between concurrent postings) and applies the movement. The
database repeats every rule (doc 05 - section 7), so a bug here fails
closed instead of corrupting the books.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from uuid import UUID

from django.db import transaction
from django.db.models import Sum

from apps.core.models import Branch, Company, Sequence
from apps.ledger import chart
from apps.ledger.models import (
    AccountBalance,
    FinancialAccount,
    JournalEntry,
    JournalLine,
    LedgerAccount,
)
from engine.money import money

ZERO = Decimal("0.00")


class LedgerError(Exception):
    """A posting that would break the books; the message is user-facing."""


class InsufficientFunds(LedgerError):
    pass


@dataclass(frozen=True)
class Line:
    account: LedgerAccount
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    memo: str = ""
    financial_account: FinancialAccount | None = None
    loan_id: UUID | None = None
    customer_id: UUID | None = None


def system_account(company_id: UUID, key: str) -> LedgerAccount:
    return LedgerAccount.objects.get(company_id=company_id, system_key=key)


def debit(account: LedgerAccount, amount: Decimal, **dims) -> Line:
    return Line(account=account, debit=money(amount), **dims)


def credit(account: LedgerAccount, amount: Decimal, **dims) -> Line:
    return Line(account=account, credit=money(amount), **dims)


def cash_line(fa: FinancialAccount, *, debit_amount=ZERO, credit_amount=ZERO, **dims) -> Line:
    """A movement of a financial account: its ledger line carries the dimension."""
    return Line(
        account=fa.ledger_account,
        debit=money(debit_amount),
        credit=money(credit_amount),
        financial_account=fa,
        **dims,
    )


@transaction.atomic
def post_entry(
    *,
    company_id: UUID,
    branch: Branch,
    on: date,
    description: str,
    source_type: str,
    source_id: UUID | None,
    lines: Iterable[Line],
    created_by=None,
    reversal_of: JournalEntry | None = None,
) -> JournalEntry:
    lines = [line for line in lines if line.debit or line.credit]
    if len(lines) < 2:
        raise LedgerError("Un asiento necesita al menos dos líneas.")
    for line in lines:
        if line.debit < 0 or line.credit < 0 or (line.debit and line.credit):
            raise LedgerError("Cada línea va a un solo lado y con importe positivo.")
        if line.account.company_id != company_id:
            raise LedgerError("La cuenta no pertenece a la empresa.")
    total_debit = sum((line.debit for line in lines), ZERO)
    total_credit = sum((line.credit for line in lines), ZERO)
    if total_debit != total_credit:
        raise LedgerError(f"Asiento desbalanceado: débitos {total_debit}, créditos {total_credit}.")

    entry = JournalEntry.objects.create(
        company_id=company_id,
        number=Sequence.allocate(branch, Sequence.DocType.JOURNAL),
        date=on,
        branch=branch,
        description=description,
        source_type=source_type,
        source_id=source_id,
        reversal_of=reversal_of,
        created_by=created_by,
    )
    JournalLine.objects.bulk_create(
        JournalLine(
            company_id=company_id,
            entry=entry,
            account=line.account,
            debit=line.debit,
            credit=line.credit,
            memo=line.memo,
            branch=branch,
            financial_account=line.financial_account,
            loan_id=line.loan_id,
            customer_id=line.customer_id,
        )
        for line in lines
    )

    # Net movement per account on its normal side, applied under row locks
    # taken in account-id order.
    movement: dict[UUID, Decimal] = {}
    accounts: dict[UUID, LedgerAccount] = {}
    for line in lines:
        signed = line.debit - line.credit
        if not line.account.debit_normal:
            signed = -signed
        movement[line.account.id] = movement.get(line.account.id, ZERO) + signed
        accounts[line.account.id] = line.account
    balances = (
        AccountBalance.objects.select_for_update()
        .filter(account_id__in=sorted(movement))
        .order_by("account_id")
    )
    for balance in balances:
        balance.balance += movement[balance.account_id]
        if balance.balance < 0 and not balance.allows_negative:
            account = accounts[balance.account_id]
            raise InsufficientFunds(
                f"Fondos insuficientes en «{account.name}»: no se permite sobregiro."
            )
        balance.save(update_fields=["balance", "updated_at"])
    return entry


@transaction.atomic
def reverse_entry(
    entry: JournalEntry, *, on: date, description: str, created_by=None
) -> JournalEntry:
    """The inverse entry, linked to the original (nothing is deleted)."""
    if JournalEntry.objects.filter(reversal_of=entry).exists():
        raise LedgerError("Ese asiento ya fue revertido.")
    lines = [
        Line(
            account=line.account,
            debit=line.credit,
            credit=line.debit,
            memo=line.memo,
            financial_account=line.financial_account,
            loan_id=line.loan_id,
            customer_id=line.customer_id,
        )
        for line in entry.lines.select_related("account", "financial_account")
    ]
    return post_entry(
        company_id=entry.company_id,
        branch=entry.branch,
        on=on,
        description=description,
        source_type=entry.source_type,
        source_id=entry.source_id,
        lines=lines,
        created_by=created_by,
        reversal_of=entry,
    )


def balance_of(account: LedgerAccount) -> Decimal:
    return AccountBalance.objects.get(account=account).balance


def recomputed_balance(account: LedgerAccount) -> Decimal:
    """From the lines, ignoring the cache: what the nightly check compares."""
    totals = JournalLine.objects.filter(account=account).aggregate(
        debit=Sum("debit"), credit=Sum("credit")
    )
    net = (totals["debit"] or ZERO) - (totals["credit"] or ZERO)
    return net if account.debit_normal else -net


# --- Chart and financial accounts --------------------------------------------


def _create_account(company_id: UUID, **fields) -> LedgerAccount:
    account = LedgerAccount.objects.create(company_id=company_id, **fields)
    AccountBalance.objects.create(
        company_id=company_id, account=account, allows_negative=account.allows_negative
    )
    return account


def seed_chart(company: Company, branch: Branch) -> FinancialAccount:
    """System accounts plus the branch's «Caja general» (signup, F19)."""
    for key, code, name, type_, allows_negative in chart.SYSTEM_ACCOUNTS:
        _create_account(
            company.id,
            code=code,
            name=name,
            type=type_,
            system_key=key,
            is_system=True,
            allows_negative=allows_negative,
        )
    return create_financial_account(
        company_id=company.id,
        name=chart.DEFAULT_CASH_ACCOUNT_NAME,
        kind=FinancialAccount.Kind.CASH,
        branch=branch,
    )


@transaction.atomic
def create_financial_account(
    *,
    company_id: UUID,
    name: str,
    kind: str,
    branch: Branch | None = None,
    bank_name: str = "",
    account_number: str = "",
) -> FinancialAccount:
    prefix = chart.FINANCIAL_ACCOUNT_PREFIX[kind]
    siblings = LedgerAccount.objects.filter(company_id=company_id, code__startswith=f"{prefix}-")
    next_index = siblings.count() + 1
    while siblings.filter(code=f"{prefix}-{next_index:02d}").exists():
        next_index += 1
    digits = "".join(ch for ch in account_number if ch.isdigit())
    label = f"{name} ••{digits[-4:]}" if digits else name
    ledger_account = _create_account(
        company_id,
        code=f"{prefix}-{next_index:02d}",
        name=label,
        type=LedgerAccount.Type.ASSET,
        allows_negative=False,  # never overdrawn (reference defect #30)
    )
    return FinancialAccount.objects.create(
        company_id=company_id,
        name=name,
        kind=kind,
        branch=branch,
        bank_name=bank_name,
        account_number_last4=digits[-4:],  # stored masked (doc 06 - section 7)
        ledger_account=ledger_account,
    )


def capital_movement(
    *,
    account: FinancialAccount,
    amount: Decimal,
    increase: bool,
    branch: Branch,
    on: date,
    note: str,
    created_by,
) -> JournalEntry:
    """Owner's contribution or withdrawal against equity (P53 «Ajuste»)."""
    equity = system_account(account.company_id, "owner_equity")
    amount = money(amount)
    if amount <= 0:
        raise LedgerError("El monto debe ser mayor que cero.")
    lines = (
        [cash_line(account, debit_amount=amount), credit(equity, amount)]
        if increase
        else [debit(equity, amount), cash_line(account, credit_amount=amount)]
    )
    verb = "Aporte de capital a" if increase else "Retiro de capital de"
    return post_entry(
        company_id=account.company_id,
        branch=branch,
        on=on,
        description=f"{verb} {account.name}: {note}",
        source_type="ledger.capital",
        source_id=account.id,
        lines=lines,
        created_by=created_by,
    )


def transfer(
    *,
    source: FinancialAccount,
    target: FinancialAccount,
    amount: Decimal,
    branch: Branch,
    on: date,
    note: str,
    created_by,
) -> JournalEntry:
    if source.id == target.id:
        raise LedgerError("Elige dos cuentas distintas.")
    amount = money(amount)
    if amount <= 0:
        raise LedgerError("El monto debe ser mayor que cero.")
    return post_entry(
        company_id=source.company_id,
        branch=branch,
        on=on,
        description=f"Transferencia de {source.name} a {target.name}"
        + (f": {note}" if note else ""),
        source_type="ledger.transfer",
        source_id=None,
        lines=[
            cash_line(target, debit_amount=amount),
            cash_line(source, credit_amount=amount),
        ],
        created_by=created_by,
    )
