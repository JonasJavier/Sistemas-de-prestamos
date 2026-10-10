"""F15 · Month-end close (P56, decisions 075 and 084).

The manager closes a month once its checklist is clean: no open drawer or
route of that month, every bank with movements reconciled and no expense
waiting for approval. Closing then

1. books the **accrual** of interest earned and not collected by month end
   on the loans up to 90 days late (NIIF para las PYMES, accrual basis;
   decision 075), dated the month's last day, and its automatic reversal on
   the first day of the next month, so collections keep being booked as
   they happen;
2. locks the period: from then on nothing posts with a date in it (the
   database refuses it too);
3. issues the closing pack (income statement and balance sheet) as a PDF.

Reopening is the manager's, with a reason, only for the latest closed month;
it cancels that month's accrual so closing again books it anew.
"""

import datetime as dt
from collections import defaultdict
from dataclasses import asdict, dataclass, field
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Branch
from apps.core.tenancy import on_commit_in_tenant
from apps.core.text import plural
from apps.ledger import accounting, banking
from apps.ledger import services as ledger
from apps.ledger.models import AccountingPeriod, JournalEntry
from engine.money import money

ZERO = Decimal("0.00")
NON_ACCRUAL_DAYS = 90


class ClosingError(ledger.LedgerError):
    def __init__(self, message: str, code: str = "invalid", checklist=None) -> None:
        super().__init__(message)
        self.code = code
        self.checklist = checklist


# --- Accrual ------------------------------------------------------------------------------------


def _paid_as_of(as_of: dt.date) -> dict:
    """Interest and principal paid per installment by ``as_of``, counting a
    payment reversed later as still standing on that day."""
    from apps.payments.models import Payment, PaymentAllocation

    rows = (
        PaymentAllocation.objects.filter(
            component__in=["interest", "principal"], payment__value_date__lte=as_of
        )
        .filter(
            Q(payment__status=Payment.Status.POSTED) | Q(payment__reversal__reversed_on__gt=as_of)
        )
        .values("installment_id", "component")
        .annotate(total=Sum("amount"))
    )
    paid: dict = defaultdict(lambda: {"interest": ZERO, "principal": ZERO})
    for row in rows:
        paid[row["installment_id"]][row["component"]] = row["total"]
    return paid


@dataclass
class LoanAccrual:
    loan_id: object
    number: str
    branch_id: object
    days_past_due: int
    amount: Decimal


def accrual(as_of: dt.date) -> list[LoanAccrual]:
    """Interest earned and unpaid at ``as_of``: the unpaid interest of the
    installments already due, plus the elapsed share of the current one.
    Loans more than 90 days late accrue nothing (prudence)."""
    from apps.lending.models import Installment, Loan

    paid = _paid_as_of(as_of)
    # The loans active AT ``as_of``: one paid off, renewed or written off
    # after it (a month closed a few days late) still earned its interest
    # that month, and a migrated loan is in the books only from the day it
    # was migrated (F16).
    loans = (
        Loan.objects.filter(disbursed_on__lte=as_of)
        .filter(Q(status=Loan.Status.ACTIVE) | Q(closed_on__gt=as_of) | Q(written_off_on__gt=as_of))
        .exclude(status=Loan.Status.VOIDED)
        .exclude(is_migrated=True, created_at__date__gt=as_of)
        .only("id", "number", "branch_id", "disbursed_on")
    )
    rows_by_loan = defaultdict(list)
    for inst in (
        Installment.objects.filter(loan__in=loans)
        .exclude(status=Installment.Status.SUPERSEDED)
        .order_by("loan_id", "number")
    ):
        rows_by_loan[inst.loan_id].append(inst)
    result = []
    for loan in loans:
        rows = rows_by_loan.get(loan.id, [])
        total, oldest_late, start = ZERO, None, loan.disbursed_on
        for inst in rows:
            done = paid[inst.id]
            interest_left = inst.interest_due - inst.interest_waived - done["interest"]
            if inst.due_date <= as_of:
                owed = interest_left + inst.principal_due - done["principal"]
                if owed > 0 and inst.due_date < as_of and oldest_late is None:
                    oldest_late = inst.due_date
                total += max(interest_left, ZERO)
            else:
                span = (inst.due_date - start).days
                share = Decimal((as_of - start).days) / span if span > 0 else Decimal(0)
                earned = money(inst.interest_due * max(min(share, Decimal(1)), Decimal(0)))
                total += max(earned - done["interest"] - inst.interest_waived, ZERO)
                break
            start = inst.due_date
        days = (as_of - oldest_late).days if oldest_late else 0
        if days > NON_ACCRUAL_DAYS or not total:
            continue
        result.append(LoanAccrual(loan.id, loan.number, loan.branch_id, days, total))
    return result


def _post_accrual(year: int, month: int, user: User) -> dict:
    _, last = accounting.month_bounds(year, month)
    following = last + dt.timedelta(days=1)
    by_branch: dict = defaultdict(lambda: ZERO)
    for item in accrual(last):
        by_branch[item.branch_id] += item.amount
    company_id = user.company_id
    receivable = ledger.system_account(company_id, "interest_receivable")
    income = ledger.system_account(company_id, "interest_income")
    posted = []
    for branch_id, amount in by_branch.items():
        branch = Branch.objects.get(pk=branch_id)
        entry = ledger.post_entry(
            company_id=company_id,
            branch=branch,
            on=last,
            description=f"Devengo de intereses no cobrados al {last:%d/%m/%Y}",
            source_type="ledger.accrual",
            source_id=None,
            lines=[ledger.debit(receivable, amount), ledger.credit(income, amount)],
            created_by=user,
        )
        reversal = ledger.reverse_entry(
            entry,
            on=following,
            description=f"Reverso automático del devengo al {last:%d/%m/%Y}",
            created_by=user,
        )
        posted.append(
            {
                "branch": str(branch_id),
                "amount": str(amount),
                "entry": str(entry.id),
                "reversal": str(reversal.id),
            }
        )
    return {"total": str(sum(by_branch.values(), ZERO)), "entries": posted}


# --- Checklist ----------------------------------------------------------------------------------


@dataclass
class Check:
    key: str
    label: str
    ok: bool
    detail: str = ""
    blocking: bool = True


@dataclass
class Checklist:
    year: int
    month: int
    checks: list[Check] = field(default_factory=list)

    @property
    def ready(self) -> bool:
        return all(c.ok for c in self.checks if c.blocking)

    def as_dict(self) -> dict:
        return {"ready": self.ready, "checks": [asdict(c) for c in self.checks]}


def _earlier_open_months(year: int, month: int) -> list[str]:
    first_entry = JournalEntry.objects.order_by("date").values_list("date", flat=True).first()
    if first_entry is None:
        return []
    closed = set(
        AccountingPeriod.objects.filter(status=AccountingPeriod.Status.CLOSED).values_list(
            "year", "month"
        )
    )
    pending = []
    y, m = first_entry.year, first_entry.month
    while (y, m) < (year, month):
        first, last = accounting.month_bounds(y, m)
        if (y, m) not in closed and JournalEntry.objects.filter(
            date__gte=first, date__lte=last
        ).exists():
            pending.append(f"{m:02d}/{y}")
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return pending


def checklist(year: int, month: int) -> Checklist:
    from apps.cash.models import CashSession, RouteSession
    from apps.expenses.models import Expense

    _, last = accounting.month_bounds(year, month)
    result = Checklist(year, month)
    earlier = _earlier_open_months(year, month)
    result.checks.append(
        Check(
            "earlier",
            "Los meses anteriores con movimientos están cerrados",
            not earlier,
            ", ".join(earlier),
        )
    )
    over = last < timezone.localdate()
    result.checks.append(
        Check("over", "El mes terminó", over, "" if over else f"Termina el {last:%d/%m/%Y}.")
    )
    drawers = list(
        CashSession.objects.filter(
            business_date__lte=last, status=CashSession.Status.OPEN
        ).values_list("number", flat=True)
    )
    result.checks.append(
        Check("cash", "Todas las cajas del mes están cerradas", not drawers, ", ".join(drawers))
    )
    routes = RouteSession.objects.filter(
        business_date__lte=last, status=RouteSession.Status.OPEN
    ).count()
    result.checks.append(
        Check(
            "routes",
            "Todas las rutas del mes están rendidas",
            not routes,
            f"{plural(routes, 'ruta')} sin rendir" if routes else "",
        )
    )
    banks = [str(b) for b in banking.pending_for_month(year, month)]
    result.checks.append(
        Check("banks", "Los bancos con movimientos están conciliados", not banks, ", ".join(banks))
    )
    pending = list(
        Expense.objects.filter(status=Expense.Status.PENDING, date__lte=last).values_list(
            "number", flat=True
        )
    )
    result.checks.append(
        Check("expenses", "Ningún gasto del mes espera aprobación", not pending, ", ".join(pending))
    )
    # Phase 7 (decision 089): with commission rules, the month's run is approved.
    from apps.reports.commissions import is_settled

    settled, detail = is_settled(year, month)
    result.checks.append(Check("commissions", "Comisiones del mes aprobadas", settled, detail))
    return result


# --- Closing and reopening ----------------------------------------------------------------------


@transaction.atomic
def close_month(*, year: int, month: int, user: User) -> AccountingPeriod:
    if not authz.has_any_role(user, authz.GERENTE):
        raise ClosingError("Solo el gerente cierra el mes.", "forbidden")
    period = (
        AccountingPeriod.objects.select_for_update()
        .filter(company_id=user.company_id, year=year, month=month)
        .first()
    )
    if period is not None and period.status == AccountingPeriod.Status.CLOSED:
        raise ClosingError("Ese mes ya está cerrado.", "state")
    result = checklist(year, month)
    if not result.ready:
        failed = [c.label for c in result.checks if c.blocking and not c.ok]
        raise ClosingError(
            "No se puede cerrar todavía: " + "; ".join(failed) + ".", "checklist", result
        )
    accrued = _post_accrual(year, month, user)
    if period is None:
        period = AccountingPeriod(company_id=user.company_id, year=year, month=month)
    period.status = AccountingPeriod.Status.CLOSED
    period.closed_at, period.closed_by = timezone.now(), user
    period.checklist = {**result.as_dict(), "accrual": accrued}
    period.reopen_reason = ""
    period.save()
    record_event(
        company_id=user.company_id,
        type="ledger.month_closed",
        target=period,
        actor=user,
        summary=f"Mes {month:02d}/{year} cerrado; devengo RD$ {Decimal(accrued['total']):,.2f}",
    )
    from apps.documents.services import issue_month_close

    on_commit_in_tenant(user.company_id, lambda: issue_month_close(period, issued_by=user))
    return period


@transaction.atomic
def reopen_month(*, year: int, month: int, user: User, reason: str) -> AccountingPeriod:
    if not authz.has_any_role(user, authz.GERENTE):
        raise ClosingError("Solo el gerente reabre un mes.", "forbidden")
    if not reason.strip():
        raise ClosingError("Escribe por qué se reabre.", "reason")
    period = (
        AccountingPeriod.objects.select_for_update()
        .filter(year=year, month=month, status=AccountingPeriod.Status.CLOSED)
        .first()
    )
    if period is None:
        raise ClosingError("Ese mes no está cerrado.", "state")
    later = AccountingPeriod.objects.filter(status=AccountingPeriod.Status.CLOSED).filter(
        Q(year__gt=year) | Q(year=year, month__gt=month)
    )
    if later.exists():
        raise ClosingError("Primero reabre los meses posteriores.", "later")
    period.status = AccountingPeriod.Status.OPEN
    period.reopen_reason = reason.strip()[:300]
    period.save(update_fields=["status", "reopen_reason", "updated_at"])
    # Cancel the accrual pair, so closing again books it anew.
    _, last = accounting.month_bounds(year, month)
    company_id = user.company_id
    receivable = ledger.system_account(company_id, "interest_receivable")
    income = ledger.system_account(company_id, "interest_income")
    for item in period.checklist.get("accrual", {}).get("entries", []):
        amount = Decimal(item["amount"])
        branch = Branch.objects.get(pk=item["branch"])
        for on, lines, text in (
            (last, [ledger.debit(income, amount), ledger.credit(receivable, amount)], "devengo"),
            (
                last + dt.timedelta(days=1),
                [ledger.debit(receivable, amount), ledger.credit(income, amount)],
                "reverso del devengo",
            ),
        ):
            ledger.post_entry(
                company_id=company_id,
                branch=branch,
                on=on,
                description=f"Anula el {text} al {last:%d/%m/%Y}: mes reabierto",
                source_type="ledger.accrual_cancel",
                source_id=None,
                lines=lines,
                created_by=user,
            )
    period.checklist = {**period.checklist, "accrual": {"total": "0.00", "entries": []}}
    period.save(update_fields=["checklist", "updated_at"])
    record_event(
        company_id=company_id,
        type="ledger.month_reopened",
        target=period,
        actor=user,
        summary=f"Mes {month:02d}/{year} reabierto: {period.reopen_reason}",
    )
    return period
