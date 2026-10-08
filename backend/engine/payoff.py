"""Early payoff, «saldo para saldar» (doc 03 - section 9, examples E12-E13).

Saldo para saldar = principal outstanding + overdue unpaid interest +
late fees + pending charges + the interest of the period in course (whole,
or in proportion to the days run if the product says so) + the share of
future interest the product keeps charging (0 % by default: it is waived).

The period in course belongs to the first installment due on or after the
quote date; every later one is «future».
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from engine.money import money

ZERO = Decimal("0.00")


@dataclass(frozen=True)
class Row:
    """One unpaid (or partly paid) installment of the current schedule."""

    key: object
    due_date: date
    period_start: date  # previous due date, or the disbursement for the first
    principal: Decimal  # outstanding
    interest_due: Decimal
    interest_paid: Decimal
    charges: Decimal = ZERO  # outstanding
    late_fee: Decimal = ZERO  # outstanding at the quote date

    @property
    def interest(self) -> Decimal:
        return self.interest_due - self.interest_paid


@dataclass(frozen=True)
class Part:
    """What the payoff charges of one installment, per component."""

    key: object
    charges: Decimal
    late_fee: Decimal
    interest: Decimal
    principal: Decimal
    interest_waived: Decimal


@dataclass(frozen=True)
class Quote:
    principal: Decimal
    overdue_interest: Decimal
    current_interest: Decimal
    future_interest: Decimal  # charged share of the future interest
    late_fees: Decimal
    charges: Decimal
    interest_waived: Decimal
    parts: list[Part]

    @property
    def total(self) -> Decimal:
        return (
            self.principal
            + self.overdue_interest
            + self.current_interest
            + self.future_interest
            + self.late_fees
            + self.charges
        )


def _current_interest(row: Row, as_of: date, full_period: bool) -> Decimal:
    if full_period:
        return row.interest
    span = (row.due_date - row.period_start).days
    run = min(max((as_of - row.period_start).days, 0), span)
    earned = money(row.interest_due * run / span) if span > 0 else row.interest_due
    return min(max(earned - row.interest_paid, ZERO), row.interest)


def quote(
    rows: Sequence[Row],
    *,
    as_of: date,
    full_current_period: bool = True,
    future_interest_pct: Decimal = ZERO,
) -> Quote:
    ordered = sorted(rows, key=lambda row: row.due_date)
    parts: list[Part] = []
    overdue = current = future = waived = ZERO
    current_seen = False
    for row in ordered:
        if row.due_date < as_of:
            interest = row.interest
            overdue += interest
        elif not current_seen:
            current_seen = True
            interest = _current_interest(row, as_of, full_current_period)
            current += interest
        else:
            interest = money(row.interest * future_interest_pct)
            future += interest
        waived_here = row.interest - interest
        waived += waived_here
        parts.append(
            Part(
                key=row.key,
                charges=row.charges,
                late_fee=row.late_fee,
                interest=interest,
                principal=row.principal,
                interest_waived=waived_here,
            )
        )
    return Quote(
        principal=sum((row.principal for row in ordered), ZERO),
        overdue_interest=overdue,
        current_interest=current,
        future_interest=future,
        late_fees=sum((row.late_fee for row in ordered), ZERO),
        charges=sum((row.charges for row in ordered), ZERO),
        interest_waived=waived,
        parts=parts,
    )
