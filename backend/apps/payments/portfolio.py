"""A loan's position on a date: what each installment owes, its late fee,
the days past due and the cached balances (doc 05 - 4.4).

The late fee is always computed from the facts — due dates, the frozen
policy and the dated allocations of the payments still standing — so the
cashier, the nightly job and the reports can never disagree. The caches
on ``Loan`` and ``Installment`` only save reading time; the nightly job
recomputes them.
"""

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from django.db.models import Sum

from apps.customers.models import Collateral
from apps.lending.models import Installment, Loan, LoanTerms
from apps.payments.models import Payment, PaymentAllocation
from engine import late_fees
from engine.rates import DAYS_PER_PERIOD, Frequency

ZERO = Decimal("0.00")
BUCKETS = [(0, "al_dia"), (7, "1_7"), (30, "8_30"), (60, "31_60"), (90, "61_90")]


def bucket_of(days: int) -> str:
    """Doc 03 - 12: al día, 1-7, 8-30, 31-60, 61-90 and más de 90."""
    for limit, name in BUCKETS:
        if days <= limit:
            return name
    return "90_mas"


def policy_of(terms: LoanTerms) -> late_fees.Policy:
    return late_fees.Policy(
        grace_days=terms.late_fee_grace_days,
        method=late_fees.FeeMethod(terms.late_fee_method),
        rate=terms.late_fee_monthly_rate,
        cap_pct=terms.late_fee_cap_pct,
        fixed_amount=terms.late_fee_fixed_amount,
        period_days=DAYS_PER_PERIOD[Frequency(terms.frequency)],
    )


def current_terms(loan: Loan) -> LoanTerms:
    return loan.terms.order_by("-version").first()


def current_installments(loan: Loan) -> list[Installment]:
    """The schedule in force: every installment not replaced by a newer version."""
    return list(
        loan.installments.exclude(status=Installment.Status.SUPERSEDED)
        .select_related("terms")
        .order_by("due_date", "number")
    )


def _history(installments: list[Installment]) -> dict[UUID, list[tuple[dt.date, Decimal]]]:
    """Principal + interest paid per installment and value date, standing payments only."""
    rows = (
        PaymentAllocation.objects.filter(
            installment__in=installments,
            payment__status=Payment.Status.POSTED,
            component__in=[
                PaymentAllocation.Component.PRINCIPAL,
                PaymentAllocation.Component.INTEREST,
            ],
        )
        .values("installment_id", "payment__value_date")
        .annotate(total=Sum("amount"))
        .order_by("payment__value_date")
    )
    history: dict[UUID, list[tuple[dt.date, Decimal]]] = defaultdict(list)
    for row in rows:
        history[row["installment_id"]].append((row["payment__value_date"], row["total"]))
    return history


def accrued_late_fee(
    installment: Installment, as_of: dt.date, paid: list[tuple[dt.date, Decimal]]
) -> Decimal:
    owed = installment.principal_due + installment.interest_due - installment.interest_waived
    initial = owed - sum((amount for day, amount in paid if day <= installment.due_date), ZERO)
    changes = []
    base = initial
    for day, amount in paid:
        if day > installment.due_date:
            base -= amount
            changes.append(late_fees.BaseChange(on=day, base=base))
    return late_fees.accrued(
        due_date=installment.due_date,
        as_of=as_of,
        initial_base=initial,
        policy=policy_of(installment.terms),
        changes=changes,
    )


@dataclass
class Line:
    """What one installment owes on the date, per component."""

    installment: Installment
    charges: Decimal
    late_fee: Decimal
    interest: Decimal
    principal: Decimal
    late_fee_accrued: Decimal
    days_late: int

    @property
    def total(self) -> Decimal:
        return self.charges + self.late_fee + self.interest + self.principal


def position(loan: Loan, as_of: dt.date) -> list[Line]:
    """Every installment in force, oldest first, with its late fee on ``as_of``."""
    installments = current_installments(loan)
    history = _history(installments)
    lines = []
    for inst in installments:
        accrued = accrued_late_fee(inst, as_of, history.get(inst.id, []))
        late_fee = max(accrued - inst.late_fee_paid - inst.late_fee_waived, ZERO)
        lines.append(
            Line(
                installment=inst,
                charges=inst.charges_outstanding,
                late_fee=late_fee,
                interest=inst.interest_outstanding,
                principal=inst.principal_outstanding,
                late_fee_accrued=accrued,
                days_late=late_fees.days_late(inst.due_date, as_of)
                if inst.charges_outstanding + inst.interest_outstanding + inst.principal_outstanding
                else 0,
            )
        )
    return lines


@dataclass(frozen=True)
class Summary:
    """«Lo exigible hoy» of the payment screen (F5 step 2)."""

    overdue: Decimal  # past due installments, late fees included
    late_fee: Decimal
    current: Decimal  # the next installment not yet due (or due today)
    current_due_date: dt.date | None
    total_owed: Decimal  # every remaining installment, as scheduled
    principal: Decimal
    days_past_due: int


def summarize(lines: list[Line], as_of: dt.date) -> Summary:
    overdue = [line for line in lines if line.installment.due_date < as_of and line.total > 0]
    upcoming = [line for line in lines if line.installment.due_date >= as_of and line.total > 0]
    oldest = overdue[0].installment.due_date if overdue else None
    return Summary(
        overdue=sum((line.total for line in overdue), ZERO),
        late_fee=sum((line.late_fee for line in lines), ZERO),
        current=upcoming[0].total if upcoming else ZERO,
        current_due_date=upcoming[0].installment.due_date if upcoming else None,
        total_owed=sum((line.total for line in lines), ZERO),
        principal=sum((line.principal for line in lines), ZERO),
        days_past_due=(as_of - oldest).days if oldest else 0,
    )


def status_for(line: Line) -> str:
    inst = line.installment
    if line.total == 0:
        return Installment.Status.PAID
    paid = inst.principal_paid + inst.interest_paid + inst.charges_paid + inst.late_fee_paid
    return Installment.Status.PARTIAL if paid > 0 else Installment.Status.PENDING


def refresh(loan: Loan, as_of: dt.date) -> list[Line]:
    """Recompute the caches of the loan and its installments (same transaction
    as any operation, and every night). Closes the loan when nothing is left."""
    lines = position(loan, as_of)
    changed = []
    for line in lines:
        inst = line.installment
        status = status_for(line)
        if inst.late_fee_accrued != line.late_fee_accrued or inst.status != status:
            inst.late_fee_accrued = line.late_fee_accrued
            inst.status = status
            if status != Installment.Status.PAID:
                inst.paid_on = None
            elif inst.paid_on is None:
                inst.paid_on = as_of
            changed.append(inst)
    if changed:
        Installment.objects.bulk_update(changed, ["late_fee_accrued", "status", "paid_on"])
    summary = summarize(lines, as_of)
    loan.principal_outstanding = summary.principal
    loan.interest_outstanding = sum((line.interest for line in lines), ZERO)
    loan.late_fee_outstanding = summary.late_fee
    loan.days_past_due = summary.days_past_due
    unpaid = [line for line in lines if line.total > 0]
    loan.next_due_date = unpaid[0].installment.due_date if unpaid else None
    if not unpaid and loan.status == Loan.Status.ACTIVE:
        loan.status = Loan.Status.PAID_OFF
        loan.closed_on = as_of
        for item in loan.collaterals.select_related("collateral"):
            if item.collateral.status == Collateral.Status.PLEDGED:
                item.collateral.status = Collateral.Status.RELEASED
                item.collateral.save(update_fields=["status", "updated_at"])
    loan.save()
    return lines
