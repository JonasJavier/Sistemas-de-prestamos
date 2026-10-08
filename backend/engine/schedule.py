"""Payment schedule generation (doc 03 - sections 3 and 4).

Pure functions over Decimals and dates, for the five methods of doc 03.
The open method («pagaré abierto») starts with the same schedule as
interest-only up to its maturity; principal abonos re-version it later
(payments flow). Guarantees, enforced by tests:

- the principal parts sum EXACTLY to the principal (residue goes to the
  last installment, reference defect #35);
- interest never changes because a due date shifted for a holiday;
- due dates are strictly increasing and never on/before disbursement;
- with payment rounding (peso, 5, 10) the regular installment rounds UP,
  the extra amortizes principal and the last installment closes the
  balance exactly, so it is never larger than the others.
"""

from collections.abc import Callable, Iterator, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_CEILING, ROUND_DOWN, Decimal, localcontext
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
    OPEN = "open"  # «pagaré abierto»: interest on the balance, principal at will


# Methods whose installment is pure interest: rounding it would silently
# amortize principal and change the method, so they stay at the cent.
INTEREST_ONLY_METHODS = frozenset({Method.INTEREST_ONLY, Method.OPEN})


class Rounding(StrEnum):
    """How the regular installment is rounded (doc 03 - section 1)."""

    CENT = "cent"
    PESO = "peso"
    FIVE = "five"
    TEN = "ten"


ROUNDING_STEP: dict[Rounding, Decimal] = {
    Rounding.CENT: CENT,
    Rounding.PESO: Decimal("1"),
    Rounding.FIVE: Decimal("5"),
    Rounding.TEN: Decimal("10"),
}


def _round_up(value: Decimal, step: Decimal) -> Decimal:
    return money((value / step).to_integral_value(rounding=ROUND_CEILING) * step)


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


def _amortize(
    *,
    principal: Decimal,
    installments: int,
    target_total: Callable[[Decimal, Decimal], Decimal],
    interest_for: Callable[[Decimal], Decimal],
) -> list[tuple[Decimal, Decimal]]:
    """Walk the balance down: each installment pays its interest and the
    rest of its target total goes to principal; the last one closes the
    balance exactly. Clamped both ways: a total may not cover the
    interest (tiny loans) nor amortize past the remaining balance.
    """
    rows: list[tuple[Decimal, Decimal]] = []
    balance = principal
    for k in range(1, installments + 1):
        interest = interest_for(balance)
        if k == installments:
            part = balance
        else:
            part = min(max(target_total(balance, interest) - interest, Decimal("0.00")), balance)
        rows.append((part, interest))
        balance -= part
    return rows


def _amounts(
    *,
    principal: Decimal,
    periodic_rate: Decimal,
    installments: int,
    method: Method,
    rounding_step: Decimal = CENT,
) -> list[tuple[Decimal, Decimal]]:
    """(principal, interest) per installment, already rounded to cents."""
    n = installments
    rounded = rounding_step != CENT
    if rounded and method in INTEREST_ONLY_METHODS:
        raise ValueError("El redondeo de la cuota no aplica a los métodos de solo interés.")

    if method == Method.FLAT:
        interest_each = money(principal * periodic_rate)
        parts = _split_principal(principal, n)
        if not rounded:
            return [(part, interest_each) for part in parts]
        regular = _round_up(parts[0] + interest_each, rounding_step)
        return _amortize(
            principal=principal,
            installments=n,
            target_total=lambda _balance, _interest: regular,
            interest_for=lambda _balance: interest_each,  # flat: always on the original
        )

    if method in INTEREST_ONLY_METHODS:
        interest_each = money(principal * periodic_rate)
        return [(Decimal("0.00"), interest_each) for _ in range(n - 1)] + [
            (money(principal), interest_each)
        ]

    if method == Method.FIXED_PRINCIPAL:
        base = _split_principal(principal, n)[0]
        if not rounded:
            rows: list[tuple[Decimal, Decimal]] = []
            balance = principal
            for part in _split_principal(principal, n):
                rows.append((part, money(balance * periodic_rate)))
                balance -= part
            return rows
        return _amortize(
            principal=principal,
            installments=n,
            target_total=lambda _balance, interest: _round_up(base + interest, rounding_step),
            interest_for=lambda balance: money(balance * periodic_rate),
        )

    # FIXED_PAYMENT (French amortization)
    if periodic_rate == 0:
        return _amounts(
            principal=principal,
            periodic_rate=periodic_rate,
            installments=n,
            method=Method.FLAT,
            rounding_step=rounding_step,
        )
    with localcontext() as context:
        context.prec = 50
        factor = (1 + periodic_rate) ** n
        exact = principal * periodic_rate * factor / (factor - 1)
        payment = _round_up(exact, rounding_step) if rounded else money(exact)
    return _amortize(
        principal=principal,
        installments=n,
        target_total=lambda _balance, _interest: payment,
        interest_for=lambda balance: money(balance * periodic_rate),
    )


def due_dates(
    *,
    installments: int,
    frequency: Frequency,
    start_after: date,
    first_due: date,
    is_non_working: Callable[[date], bool] = WORKING_EVERY_DAY,
    semimonthly: bool = False,
) -> list[tuple[date, date]]:
    """(due_date, original_due_date) of ``installments`` periods from
    ``first_due``; used when a loan's dates move (doc 03 - section 4)."""
    theoretical = _theoretical_dates(
        installments=installments,
        frequency=frequency,
        disbursed_on=start_after,
        first_due=first_due,
        semimonthly=semimonthly,
    )
    return _resolve_dates(
        theoretical, frequency=frequency, disbursed_on=start_after, is_non_working=is_non_working
    )


class Prepayment(StrEnum):
    """What a principal prepayment shortens (doc 03 - section 8.3)."""

    REDUCE_TERM = "reduce_term"  # same installment, fewer of them (default)
    REDUCE_PAYMENT = "reduce_payment"  # same count, smaller installment


def reschedule(
    *,
    balance: Decimal,
    periodic_rate: Decimal,
    method: Method,
    dates: Sequence[tuple[date, date]],
    mode: Prepayment = Prepayment.REDUCE_TERM,
    keep: Decimal | None = None,
    rounding: Rounding = Rounding.CENT,
) -> list[Installment]:
    """The remaining schedule after a principal prepayment.

    ``balance`` is the principal left for the installments being replaced
    and ``dates`` their due dates. Reducing the term keeps ``keep`` — the
    regular installment (fixed payment) or the regular principal part
    (fixed principal) — and drops the installments no longer needed; the
    last one closes the balance exactly. Interest-only and open loans keep
    their dates: the interest simply runs on the new balance. The flat
    method has no prepayment: its interest is fixed on the original
    principal, so extra money advances installments instead.
    """
    if method == Method.FLAT:
        raise ValueError(
            "En el método plano el pago extra adelanta cuotas; para ahorrar interés, liquida."
        )
    if balance <= 0:
        raise ValueError("El saldo que queda debe ser mayor que cero.")
    if not dates:
        raise ValueError("No quedan cuotas que reprogramar.")
    balance = money(balance)
    n = len(dates)
    if method in INTEREST_ONLY_METHODS or mode == Prepayment.REDUCE_PAYMENT or keep is None:
        amounts = _amounts(
            principal=balance,
            periodic_rate=periodic_rate,
            installments=n,
            method=method,
            rounding_step=CENT if method in INTEREST_ONLY_METHODS else ROUNDING_STEP[rounding],
        )
    else:
        amounts = []
        remaining = balance
        for k in range(n):
            interest = money(remaining * periodic_rate)
            target = keep - interest if method == Method.FIXED_PAYMENT else keep
            part = remaining if k == n - 1 else min(max(target, Decimal("0.00")), remaining)
            amounts.append((part, interest))
            remaining -= part
            if remaining == 0:
                break
    return [
        Installment(
            number=index + 1,
            due_date=due,
            original_due_date=original,
            principal=part,
            interest=interest,
        )
        for index, ((due, original), (part, interest)) in enumerate(
            zip(dates[: len(amounts)], amounts, strict=True)
        )
    ]


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
    rounding: Rounding = Rounding.CENT,
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
        rounding_step=ROUNDING_STEP[Rounding(rounding)],
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
