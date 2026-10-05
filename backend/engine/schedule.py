"""Payment schedule generation (doc 03 - sections 3 and 4).

Pure functions over Decimals and dates. The four closed methods live
here (the open/pagare-abierto method has no fixed schedule and is
handled by the payments flow). Guarantees, enforced by tests:

- the principal parts sum EXACTLY to the principal (residue goes to the
  last installment, reference defect #35);
- interest never changes because a due date shifted for a holiday;
- due dates are strictly increasing and never on/before disbursement.
"""

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_DOWN, Decimal, localcontext
from enum import StrEnum

from engine.money import CENT, money
from engine.rates import DAYS_PER_PERIOD, Frequency


def _split_principal(principal: Decimal, parts: int) -> list[Decimal]:
    """Equal parts with the residue in the LAST one (defect #35, example E2).

    The base rounds DOWN so the sum never overshoots: rounding half-up
    could make base*(n-1) exceed the principal and turn the last part
    negative (found by Hypothesis with 1.00 split 22 ways).
    """
    base = (principal / parts).quantize(CENT, rounding=ROUND_DOWN)
    return [base] * (parts - 1) + [principal - base * (parts - 1)]


class Method(StrEnum):
    FLAT = "flat"  # «San»
    INTEREST_ONLY = "interest_only"  # «A rédito»
    FIXED_PAYMENT = "fixed_payment"  # francesa
    FIXED_PRINCIPAL = "fixed_principal"  # cuota decreciente


@dataclass(frozen=True)
class Installment:
    number: int
    due_date: date
    original_due_date: date  # before any non-working-day shift
    principal: Decimal
    interest: Decimal

    @property
    def total(self) -> Decimal:
        return self.principal + self.interest


WORKING_EVERY_DAY: Callable[[date], bool] = lambda _d: False  # noqa: E731


def _last_day_of_month(year: int, month: int) -> int:
    next_month = date(year + (month == 12), month % 12 + 1, 1)
    return (next_month - timedelta(days=1)).day


def _add_months(anchor: date, months: int) -> date:
    """Same day each month; a missing day falls to the month's last day."""
    month_index = anchor.month - 1 + months
    year = anchor.year + month_index // 12
    month = month_index % 12 + 1
    day = min(anchor.day, _last_day_of_month(year, month))
    return date(year, month, day)


def _semimonthly_dates(start_after: date) -> Iterator[date]:
    """The 15th and the month's last day (doc 03 - section 4, quincenal b)."""
    current = start_after
    while True:
        last = _last_day_of_month(current.year, current.month)
        for day in (15, last):
            candidate = date(current.year, current.month, day)
            if candidate > start_after:
                yield candidate
        current = _add_months(date(current.year, current.month, 1), 1)


def _theoretical_dates(
    *,
    installments: int,
    frequency: Frequency,
    disbursed_on: date,
    first_due: date | None,
    semimonthly: bool,
) -> list[date]:
    if semimonthly:
        if frequency != Frequency.BIWEEKLY:
            raise ValueError("«15 y fin de mes» solo aplica a la frecuencia quincenal.")
        iterator = _semimonthly_dates(first_due - timedelta(days=1) if first_due else disbursed_on)
        return [next(iterator) for _ in range(installments)]

    if frequency == Frequency.MONTHLY:
        anchor = first_due or _add_months(disbursed_on, 1)
        return [_add_months(anchor, k) for k in range(installments)]

    step = timedelta(days=DAYS_PER_PERIOD[frequency])
    anchor = first_due or disbursed_on + step
    return [anchor + step * k for k in range(installments)]


def _resolve_dates(
    theoretical: list[date],
    *,
    frequency: Frequency,
    disbursed_on: date,
    is_non_working: Callable[[date], bool],
) -> list[tuple[date, date]]:
    """(due_date, original_due_date) per installment.

    Daily loans SKIP non-working days (no installment falls on them);
    other frequencies shift that one installment forward without
    accumulating (doc 03 - section 4).
    """
    if theoretical and theoretical[0] <= disbursed_on:
        raise ValueError("La primera cuota nunca vence antes del día siguiente al desembolso.")

    results: list[tuple[date, date]] = []
    if frequency == Frequency.DAILY:
        current = theoretical[0] if theoretical else disbursed_on
        for _ in theoretical:
            while is_non_working(current):
                current += timedelta(days=1)
            results.append((current, current))
            current += timedelta(days=1)
        return results

    previous_due: date | None = None
    for original in theoretical:
        due = original
        while is_non_working(due):
            due += timedelta(days=1)
        if previous_due is not None and due <= previous_due:
            due = previous_due + timedelta(days=1)  # installments stay in order
            while is_non_working(due):
                due += timedelta(days=1)
        results.append((due, original))
        previous_due = due
    return results


def _amounts(
    *, principal: Decimal, periodic_rate: Decimal, installments: int, method: Method
) -> list[tuple[Decimal, Decimal]]:
    """(principal, interest) per installment, already rounded to cents."""
    n = installments
    if method == Method.FLAT:
        interest_each = money(principal * periodic_rate)
        return [(part, interest_each) for part in _split_principal(principal, n)]

    if method == Method.INTEREST_ONLY:
        interest_each = money(principal * periodic_rate)
        return [(Decimal("0.00"), interest_each) for _ in range(n - 1)] + [
            (money(principal), interest_each)
        ]

    if method == Method.FIXED_PRINCIPAL:
        rows: list[tuple[Decimal, Decimal]] = []
        balance = principal
        for part in _split_principal(principal, n):
            rows.append((part, money(balance * periodic_rate)))
            balance -= part
        return rows

    # FIXED_PAYMENT (French amortization)
    if periodic_rate == 0:
        return _amounts(
            principal=principal, periodic_rate=periodic_rate, installments=n, method=Method.FLAT
        )
    with localcontext() as context:
        context.prec = 50
        factor = (1 + periodic_rate) ** n
        payment = money(principal * periodic_rate * factor / (factor - 1))
    rows = []
    balance = principal
    for k in range(1, n + 1):
        interest = money(balance * periodic_rate)
        if k == n:
            part = balance  # the last installment closes the balance exactly
        else:
            # Clamp both ways: a rounded payment may not cover the interest
            # (tiny loans) nor amortize past the remaining balance.
            part = min(max(payment - interest, Decimal("0.00")), balance)
        rows.append((part, interest))
        balance -= part
    return rows


def generate_schedule(
    *,
    principal: Decimal,
    periodic_rate: Decimal,
    installments: int,
    method: Method,
    frequency: Frequency,
    disbursed_on: date,
    first_due: date | None = None,
    is_non_working: Callable[[date], bool] = WORKING_EVERY_DAY,
    semimonthly: bool = False,
) -> list[Installment]:
    if installments < 1:
        raise ValueError("Debe haber al menos una cuota.")
    if principal <= 0:
        raise ValueError("El capital debe ser mayor que cero.")
    if periodic_rate < 0:
        raise ValueError("La tasa no puede ser negativa.")
    principal = money(principal)

    theoretical = _theoretical_dates(
        installments=installments,
        frequency=frequency,
        disbursed_on=disbursed_on,
        first_due=first_due,
        semimonthly=semimonthly,
    )
    dates = _resolve_dates(
        theoretical,
        frequency=frequency,
        disbursed_on=disbursed_on,
        is_non_working=is_non_working,
    )
    amounts = _amounts(
        principal=principal,
        periodic_rate=periodic_rate,
        installments=installments,
        method=method,
    )
    return [
        Installment(
            number=index + 1,
            due_date=due,
            original_due_date=original,
            principal=part,
            interest=interest,
        )
        for index, ((due, original), (part, interest)) in enumerate(
            zip(dates, amounts, strict=True)
        )
    ]
