"""F15 · Payables (P55, decision 082).

Doc 06 matrix: G and Ct. A single obligation is recognized at its invoice
date (expense against «Cuentas por pagar»); each occurrence of a series is
recognized when it falls due, by the nightly job, or earlier if it is paid
first. Payments, total or partial, debit the payable and credit the cash
box or bank; cancelling the unpaid remainder reverses that part of the
expense. A closed month is never touched.
"""

import calendar
import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Branch
from apps.expenses.models import (
    Expense,
    ExpenseCategory,
    Kind,
    Payable,
    PayablePayment,
    PayableSeries,
)
from apps.expenses.services import (
    ExpenseError,
    clean_ncf,
    clean_party_document,
    ensure_new_receipt,
)
from apps.ledger import accounting
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount
from engine.money import money

ZERO = Decimal("0.00")
ROLES = (authz.GERENTE, authz.CONTABILIDAD)
MAX_OCCURRENCES = 60


def _check(user: User) -> None:
    if not authz.has_any_role(user, *ROLES):
        raise ExpenseError(
            "Las cuentas por pagar las llevan el gerente y contabilidad.", "forbidden"
        )


def _date_ok(company_id, on: dt.date, field: str) -> None:
    if on > timezone.localdate():
        raise ExpenseError("La fecha no puede ser futura.", field)
    try:
        accounting.ensure_open(company_id, on)
    except accounting.AccountingError as exc:
        raise ExpenseError(str(exc), field) from exc


def _itbis(value: Decimal | None, amount: Decimal) -> Decimal:
    itbis = money(value or ZERO)
    if itbis < 0 or itbis > amount:
        raise ExpenseError("El ITBIS va incluido en el monto y no lo supera.", "itbis")
    return itbis


def occurrence_dates(start: dt.date, frequency: str, count: int) -> list[dt.date]:
    """Weekly, every 15 days, or monthly on the same day (the 31st becomes the
    month's last day)."""
    dates = []
    for index in range(count):
        if frequency == PayableSeries.Frequency.WEEKLY:
            dates.append(start + dt.timedelta(days=7 * index))
        elif frequency == PayableSeries.Frequency.BIWEEKLY:
            dates.append(start + dt.timedelta(days=15 * index))
        else:
            month = start.month - 1 + index
            year, month = start.year + month // 12, month % 12 + 1
            day = min(start.day, calendar.monthrange(year, month)[1])
            dates.append(dt.date(year, month, day))
    return dates


def _recognize(payable: Payable, on: dt.date, user: User | None) -> None:
    payables_account = ledger.system_account(payable.company_id, "payables")
    payable.recognized_entry = ledger.post_entry(
        company_id=payable.company_id,
        branch=payable.branch,
        on=on,
        description=f"Cuenta por pagar a {payable.party_name}: {payable.description}"[:300],
        source_type="expenses.payable",
        source_id=payable.id,
        lines=[
            ledger.debit(payable.category.account, payable.amount, memo=payable.description[:200]),
            ledger.credit(payables_account, payable.amount),
        ],
        created_by=user,
    )
    payable.recognized_on = on


@transaction.atomic
def create(
    *,
    user: User,
    branch: Branch,
    category: ExpenseCategory,
    party_name: str,
    description: str,
    amount: Decimal,
    due_on: dt.date,
    invoice_on: dt.date | None = None,
    party_document: str = "",
    ncf: str = "",
    itbis: Decimal = ZERO,
    frequency: str = "",
    count: int = 1,
) -> list[Payable]:
    """One obligation (recognized at ``invoice_on``) or a series of
    ``count`` occurrences from ``due_on`` (each recognized when due)."""
    _check(user)
    if not authz.in_scope(user, branch.id):
        raise ExpenseError("No trabajas en esa sucursal.", "out_of_scope")
    if category.kind != Kind.EXPENSE or not category.is_active:
        raise ExpenseError("Elige una categoría de gasto activa.", "category")
    amount = money(amount)
    if amount <= 0:
        raise ExpenseError("El monto debe ser mayor que cero.", "amount")
    if not party_name.strip() or not description.strip():
        raise ExpenseError("Indica a quién se le debe y por qué.", "party_name")
    party_document, ncf = clean_party_document(party_document), clean_ncf(ncf)
    itbis = _itbis(itbis, amount)
    series = None
    if frequency:
        if frequency not in PayableSeries.Frequency.values or not 2 <= count <= MAX_OCCURRENCES:
            raise ExpenseError(
                f"Una serie lleva una frecuencia y de 2 a {MAX_OCCURRENCES} ocurrencias.", "count"
            )
        series = PayableSeries.objects.create(
            company_id=user.company_id,
            frequency=frequency,
            count=count,
            start_on=due_on,
            created_by=user,
        )
        dates = occurrence_dates(due_on, frequency, count)
        # Each occurrence gets its receipt when its invoice arrives (set_receipt).
        ncf, itbis = "", ZERO
    else:
        if invoice_on is None:
            raise ExpenseError("Indica la fecha de la factura.", "invoice_on")
        _date_ok(user.company_id, invoice_on, "invoice_on")
        if due_on < invoice_on:
            raise ExpenseError("Vence en la fecha de la factura o después.", "due_on")
        ensure_new_receipt(kind=Kind.EXPENSE, ncf=ncf, party_document=party_document)
        dates = [due_on]
    created = []
    for index, due in enumerate(dates, start=1):
        payable = Payable.objects.create(
            company_id=user.company_id,
            branch=branch,
            category=category,
            party_name=party_name.strip()[:200],
            party_document=party_document,
            ncf=ncf,
            itbis=itbis,
            description=(
                description.strip()
                if series is None
                else f"{description.strip()} ({index}/{count})"
            )[:300],
            amount=amount,
            due_on=due,
            series=series,
            occurrence=index,
            created_by=user,
        )
        if series is None:
            _recognize(payable, invoice_on, user)
            payable.save(update_fields=["recognized_entry", "recognized_on", "updated_at"])
        created.append(payable)
    record_event(
        company_id=user.company_id,
        type="payable.created",
        target=created[0],
        actor=user,
        summary=f"Cuenta por pagar a {party_name.strip()}: RD$ {amount:,.2f}"
        + (f" × {count} ({series.get_frequency_display().lower()})" if series else ""),
    )
    return created


def recognize_due(today: dt.date) -> int:
    """Nightly: series occurrences that fell due become expense and debt."""
    count = 0
    due = Payable.objects.filter(recognized_entry__isnull=True, due_on__lte=today).exclude(
        status=Payable.Status.CANCELLED
    )
    for payable in due.select_related("category__account", "branch"):
        with transaction.atomic():
            locked = Payable.objects.select_for_update().get(pk=payable.pk)
            if locked.recognized_entry_id:
                continue
            locked.category, locked.branch = payable.category, payable.branch
            # On its due date, or today if that month is already closed.
            on = (
                locked.due_on
                if not accounting.is_closed(locked.company_id, locked.due_on)
                else today
            )
            _recognize(locked, on, None)
            locked.save(update_fields=["recognized_entry", "recognized_on", "updated_at"])
            count += 1
    return count


@transaction.atomic
def pay(
    *,
    payable: Payable,
    user: User,
    amount: Decimal,
    account: FinancialAccount,
    on: dt.date,
    method: str = Expense.Method.TRANSFER,
    reference: str = "",
) -> PayablePayment:
    _check(user)
    payable = (
        Payable.objects.select_for_update(of=("self",))
        .select_related("category__account", "branch")
        .get(pk=payable.pk)
    )
    if payable.status in (Payable.Status.PAID, Payable.Status.CANCELLED):
        raise ExpenseError("Esa cuenta ya está pagada o cancelada.", "state")
    if not account.is_active or account.is_personal:
        raise ExpenseError("Paga desde la caja general o un banco.", "account")
    amount = money(amount)
    if amount <= 0 or amount > payable.outstanding:
        raise ExpenseError(
            f"El pago va de RD$ 0.01 a lo pendiente (RD$ {payable.outstanding:,.2f}).", "amount"
        )
    _date_ok(payable.company_id, on, "date")
    if payable.recognized_entry_id is None:  # paid before it fell due
        _recognize(payable, on, user)
    entry = ledger.post_entry(
        company_id=payable.company_id,
        branch=payable.branch,
        on=on,
        description=f"Pago a {payable.party_name}: {payable.description}"[:300],
        source_type="expenses.payable_payment",
        source_id=payable.id,
        lines=[
            ledger.debit(ledger.system_account(payable.company_id, "payables"), amount),
            ledger.cash_line(account, credit_amount=amount),
        ],
        created_by=user,
    )
    payment = PayablePayment.objects.create(
        company_id=payable.company_id,
        payable=payable,
        amount=amount,
        date=on,
        account=account,
        method=method,
        reference=reference.strip()[:100],
        entry=entry,
        created_by=user,
    )
    payable.paid = F("paid") + amount
    payable.save(update_fields=["paid", "recognized_entry", "recognized_on", "updated_at"])
    payable.refresh_from_db(fields=["paid"])
    payable.status = (
        Payable.Status.PAID if payable.paid == payable.amount else Payable.Status.PARTIAL
    )
    payable.save(update_fields=["status", "updated_at"])
    record_event(
        company_id=payable.company_id,
        type="payable.paid",
        target=payable,
        actor=user,
        summary=f"Pago de RD$ {amount:,.2f} a {payable.party_name} "
        f"({payable.get_status_display()})",
    )
    return payment


@transaction.atomic
def cancel(*, payable: Payable, user: User, reason: str) -> Payable:
    """The unpaid remainder is no longer owed: its expense is reversed today."""
    _check(user)
    payable = (
        Payable.objects.select_for_update(of=("self",))
        .select_related("category__account", "branch")
        .get(pk=payable.pk)
    )
    if payable.status in (Payable.Status.PAID, Payable.Status.CANCELLED):
        raise ExpenseError("Esa cuenta ya está pagada o cancelada.", "state")
    if not reason.strip():
        raise ExpenseError("Escribe por qué se cancela.", "reason")
    remainder = payable.outstanding
    if payable.recognized_entry_id and remainder > 0:
        payable.cancel_entry = ledger.post_entry(
            company_id=payable.company_id,
            branch=payable.branch,
            on=timezone.localdate(),
            description=f"Cancelación de lo pendiente con {payable.party_name}: {reason.strip()}"[
                :300
            ],
            source_type="expenses.payable_cancel",
            source_id=payable.id,
            lines=[
                ledger.debit(ledger.system_account(payable.company_id, "payables"), remainder),
                ledger.credit(payable.category.account, remainder),
            ],
            created_by=user,
        )
    payable.status = Payable.Status.CANCELLED
    payable.cancelled_by, payable.cancelled_at = user, timezone.now()
    payable.cancel_reason = reason.strip()[:300]
    payable.save(
        update_fields=[
            "status",
            "cancelled_by",
            "cancelled_at",
            "cancel_reason",
            "cancel_entry",
            "updated_at",
        ]
    )
    record_event(
        company_id=payable.company_id,
        type="payable.cancelled",
        target=payable,
        actor=user,
        summary=f"Cancelada (RD$ {remainder:,.2f} pendientes): {payable.cancel_reason}",
    )
    return payable


@transaction.atomic
def set_receipt(
    *, payable: Payable, user: User, party_document: str, ncf: str, itbis: Decimal | None
) -> Payable:
    """The supplier's invoice for an obligation (e.g. this month's rent of a
    series): its NCF, RNC and ITBIS, for the 606. Money and dates stay."""
    _check(user)
    payable = Payable.objects.select_for_update(of=("self",)).get(pk=payable.pk)
    if payable.status == Payable.Status.CANCELLED:
        raise ExpenseError("Una cuenta cancelada ya no se edita.", "state")
    party_document, ncf = clean_party_document(party_document), clean_ncf(ncf)
    if ncf and not party_document:
        raise ExpenseError("Con el NCF va el RNC o la cédula del proveedor.", "party_document")
    itbis = _itbis(itbis, payable.amount)
    ensure_new_receipt(kind=Kind.EXPENSE, ncf=ncf, party_document=party_document, payable=payable)
    payable.party_document, payable.ncf, payable.itbis = party_document, ncf, itbis
    payable.save(update_fields=["party_document", "ncf", "itbis", "updated_at"])
    record_event(
        company_id=payable.company_id,
        type="payable.receipt",
        target=payable,
        actor=user,
        summary=f"Comprobante de {payable.party_name}: NCF {ncf or '—'}, ITBIS RD$ {itbis:,.2f}",
    )
    return payable
