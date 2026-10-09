"""Rate conversion (doc 03 - section 2).

Every rate becomes a per-period rate using the 30-day commercial month:
annual -> monthly (/12), monthly -> per period (x days/30). Rates are
fractions: 10% = Decimal("0.10").
"""

import datetime as dt
from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal, localcontext
from enum import StrEnum


class Frequency(StrEnum):
    DAILY = "daily"
    INTERDAILY = "interdaily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"  # quincenal
    MONTHLY = "monthly"


DAYS_PER_PERIOD: dict[Frequency, int] = {
    Frequency.DAILY: 1,
    Frequency.INTERDAILY: 2,
    Frequency.WEEKLY: 7,
    Frequency.BIWEEKLY: 15,
    Frequency.MONTHLY: 30,
}


class RateUnit(StrEnum):
    PER_PERIOD = "per_period"
    MONTHLY = "monthly"
    ANNUAL = "annual"


def period_rate(rate: Decimal, unit: RateUnit, frequency: Frequency) -> Decimal:
    """Exact Decimal; rounding happens only on money, never on rates."""
    if rate < 0:
        raise ValueError("The rate cannot be negative.")
    if unit == RateUnit.PER_PERIOD:
        return rate
    monthly = rate / 12 if unit == RateUnit.ANNUAL else rate
    return monthly * DAYS_PER_PERIOD[frequency] / 30


def monthly_equivalent(rate: Decimal, unit: RateUnit, frequency: Frequency) -> Decimal:
    """Shown in the simulator and the pagare for transparency (doc 03 - section 2)."""
    if unit == RateUnit.MONTHLY:
        return rate
    if unit == RateUnit.ANNUAL:
        return rate / 12
    return rate * 30 / DAYS_PER_PERIOD[frequency]


def annual_equivalent(rate: Decimal, unit: RateUnit, frequency: Frequency) -> Decimal:
    return monthly_equivalent(rate, unit, frequency) * 12


EFFECTIVE_RATE_PLACES = Decimal("0.0001")
# Beyond 100,000,000 % a year the figure only says «absurd»; capping it
# keeps the result a small, printable Decimal.
EFFECTIVE_RATE_CEILING = Decimal("1000000")


def effective_annual_rate(
    received_on: dt.date, received: Decimal, payments: Sequence[tuple[dt.date, Decimal]]
) -> Decimal:
    """Annual effective cost of a loan for the borrower (decision 075).

    The daily rate ``d`` that makes what the borrower receives on
    ``received_on`` equal to the present value of what they pay, compounded
    over 365 days: ``(1 + d) ** 365 - 1``. It includes charges (they shrink
    what is received or raise what is paid) and, unlike the nominal
    equivalents above, shows the real cost of a flat-rate loan. Late fees are
    left out: the figure assumes every installment is paid on time.

    Exact Decimal bisection on the daily rate (days are integers, so every
    power is exact); returned as a fraction rounded to 0.01 % and capped at
    ``EFFECTIVE_RATE_CEILING``.
    """
    if received <= 0:
        raise ValueError("What the borrower receives must be positive.")
    flows = [((on - received_on).days, amount) for on, amount in payments if amount]
    if any(days < 0 for days, _ in flows):
        raise ValueError("A payment cannot come before the disbursement.")
    if sum(amount for _, amount in flows) <= received:
        return Decimal("0.0000")
    with localcontext() as ctx:
        ctx.prec = 40

        def present_value(daily: Decimal) -> Decimal:
            growth = 1 + daily
            return sum((amount / growth**days for days, amount in flows), Decimal(0))

        low, high = Decimal(0), Decimal(1)
        while present_value(high) > received:  # more than 100 % a day: keep doubling
            low, high = high, high * 2
        for _ in range(90):  # 2**-90 of the bracket: far below a cent of difference
            middle = (low + high) / 2
            if present_value(middle) > received:
                low = middle
            else:
                high = middle
        annual = min((1 + (low + high) / 2) ** 365 - 1, EFFECTIVE_RATE_CEILING)
    return annual.quantize(EFFECTIVE_RATE_PLACES, rounding=ROUND_HALF_UP)
