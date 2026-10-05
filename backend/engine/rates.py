"""Rate conversion (doc 03 - section 2).

Every rate becomes a per-period rate using the 30-day commercial month:
annual -> monthly (/12), monthly -> per period (x days/30). Rates are
fractions: 10% = Decimal("0.10").
"""

from decimal import Decimal
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
