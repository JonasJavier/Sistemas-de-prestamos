"""Late fees of one installment (doc 03 - section 7, example E8).

Pure functions over Decimals and dates. The base is what the installment
still owes of principal and interest, day by day: a partial payment
lowers the base from the next day on, so the fee is only ever charged on
what is missing (reference defect #14). Rules:

- within the grace days there is no fee at all; past them, the days count
  from the due date;
- the day a payment is made still accrues on the base before it;
- the fee of an installment never exceeds ``cap_pct`` of what was overdue
  when it fell due (reference defect #2);
- the total is rounded once, at the end (commercial half-up).
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from enum import StrEnum

from engine.money import money

ZERO = Decimal("0.00")


class FeeMethod(StrEnum):
    PRORATED_DAILY = "prorated_daily"  # base x monthly rate x days / 30
    FULL_PERIOD = "full_period"  # the rate, whole, per started period of delay
    FIXED = "fixed"  # a fixed amount once the grace is over


@dataclass(frozen=True)
class Policy:
    grace_days: int
    method: FeeMethod
    rate: Decimal  # monthly for PRORATED_DAILY; per period for FULL_PERIOD
    cap_pct: Decimal
    fixed_amount: Decimal | None = None
    period_days: int = 30  # the loan's frequency, for FULL_PERIOD


@dataclass(frozen=True)
class BaseChange:
    """From the day AFTER ``on``, the overdue base is ``base``."""

    on: date
    base: Decimal


def days_late(due_date: date, as_of: date) -> int:
    return max((as_of - due_date).days, 0)


def _base_on(day: date, initial: Decimal, changes: Sequence[BaseChange]) -> Decimal:
    """The base in force on ``day``: the last change made BEFORE it."""
    base = initial
    for change in changes:
        if change.on < day:
            base = change.base
        else:
            break
    return base


def accrued(
    *,
    due_date: date,
    as_of: date,
    initial_base: Decimal,
    policy: Policy,
    changes: Sequence[BaseChange] = (),
) -> Decimal:
    """Total fee accrued by the installment up to ``as_of`` (paid or not).

    ``initial_base`` is what was overdue at the end of the due date;
    ``changes`` are the later payments to principal or interest, in date
    order, each with the base left after it.
    """
    late = days_late(due_date, as_of)
    if late <= policy.grace_days or initial_base <= 0:
        return ZERO
    # Payments up to the due date are already inside ``initial_base``.
    ordered = sorted((c for c in changes if c.on > due_date), key=lambda change: change.on)
    cap = money(initial_base * policy.cap_pct)

    if policy.method == FeeMethod.FIXED:
        fee = money(policy.fixed_amount or ZERO)
    elif policy.method == FeeMethod.FULL_PERIOD:
        # Each started period charges the whole rate on the base it found.
        step = max(policy.period_days, 1)
        periods = -(-late // step)  # ceiling
        fee = money(
            sum(
                (
                    _base_on(due_date + timedelta(days=k * step + 1), initial_base, ordered)
                    for k in range(periods)
                ),
                ZERO,
            )
            * policy.rate
        )
    else:
        # Day by day, grouped in runs of the same base.
        total = Decimal(0)
        run_start = due_date + timedelta(days=1)
        boundaries = [change.on for change in ordered if due_date < change.on < as_of]
        for boundary in [*boundaries, as_of]:
            days = (boundary - run_start).days + 1
            if days > 0:
                total += _base_on(run_start, initial_base, ordered) * days
            run_start = boundary + timedelta(days=1)
        fee = money(total * policy.rate / 30)
    return min(fee, cap)
