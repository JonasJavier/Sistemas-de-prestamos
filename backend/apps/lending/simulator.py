"""The simulator service (doc 01 principle 3: the server owns money math).

Validates against the product's ranges, applies the company's calendar
(working days + confirmed holidays) and returns the full breakdown with
the equivalent rates the law of transparency asks for (doc 03 - section 2).
Nothing is persisted: the reference created a draft per keystroke
(defect #36); we never do.
"""

import datetime as dt
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.utils import timezone

from apps.core.models import Holiday
from apps.lending.models import LoanProduct, ProductCharge
from engine.money import money
from engine.rates import Frequency, RateUnit, annual_equivalent, monthly_equivalent, period_rate
from engine.schedule import Installment, Method, Rounding, generate_schedule


@dataclass(frozen=True)
class ChargeLine:
    name: str
    mode: str
    amount: Decimal
    charge_id: object = None  # ProductCharge pk, frozen into LoanCharge
    basis: str = ""
    value: Decimal = Decimal("0")


@dataclass(frozen=True)
class Simulation:
    schedule: list[Installment]
    periodic_rate: Decimal
    monthly_rate: Decimal
    annual_rate: Decimal
    principal: Decimal  # base the installments are computed on
    requested_amount: Decimal
    net_disbursed: Decimal
    charges: list[ChargeLine]
    total_interest: Decimal
    total_charges: Decimal
    total_to_pay: Decimal


def non_working_predicate(product: LoanProduct) -> Callable[[dt.date], bool]:
    """The product's collection days plus the company's confirmed holidays."""
    holidays: set[dt.date] = set()
    if not product.collect_holidays:
        holidays = set(
            Holiday.objects.filter(company_id=product.company_id, is_confirmed=True).values_list(
                "date", flat=True
            )
        )

    def is_non_working(day: dt.date) -> bool:
        if day.weekday() == 5 and not product.collect_saturdays:
            return True
        if day.weekday() == 6 and not product.collect_sundays:
            return True
        return day in holidays

    return is_non_working


def _charge_amount(charge: ProductCharge, amount: Decimal) -> Decimal:
    if charge.basis == ProductCharge.Basis.PERCENT:
        return money(amount * charge.value)
    return money(charge.value)


def simulate(
    *,
    product: LoanProduct,
    amount: Decimal,
    installments: int,
    frequency: str,
    rate: Decimal | None = None,
    disbursed_on: dt.date | None = None,
    first_due: dt.date | None = None,
) -> Simulation:
    errors: dict[str, str] = {}

    if not product.min_amount <= amount <= product.max_amount:
        errors["amount"] = f"El monto debe estar entre {product.min_amount} y {product.max_amount}."
    if not product.min_term <= installments <= product.max_term:
        errors["installments"] = (
            f"Las cuotas deben estar entre {product.min_term} y {product.max_term}."
        )
    if frequency not in product.allowed_frequencies:
        errors["frequency"] = "El producto no permite esa frecuencia."
    if rate is None:
        rate = product.default_rate
    if rate is None:
        errors["rate"] = "Indica la tasa."
    elif not product.min_rate <= rate <= product.max_rate:
        errors["rate"] = f"La tasa debe estar entre {product.min_rate} y {product.max_rate}."
    if errors:
        raise ValidationError(errors)

    freq = Frequency(frequency)
    unit = RateUnit(product.rate_unit)
    periodic = period_rate(rate, unit, freq)

    charge_lines = [
        ChargeLine(
            name=c.name,
            mode=c.mode,
            amount=_charge_amount(c, amount),
            charge_id=c.pk,
            basis=c.basis,
            value=c.value,
        )
        for c in product.charges.filter(is_active=True).order_by("name")
    ]
    financed = sum(
        (line.amount for line in charge_lines if line.mode == ProductCharge.Mode.FINANCED),
        Decimal("0.00"),
    )
    discounted = sum(
        (line.amount for line in charge_lines if line.mode == ProductCharge.Mode.DISCOUNTED),
        Decimal("0.00"),
    )

    # E7: financed charges raise the base; discounted ones reduce the cash out.
    principal = money(amount + financed)
    # Business dates are Santo Domingo dates (doc 05 - section 2), never the
    # server's clock: a UTC host would quote tomorrow after 8 p.m.
    disbursed_on = disbursed_on or timezone.localdate()
    if first_due is not None and first_due <= disbursed_on:
        raise ValidationError(
            {"first_due": "La primera cuota vence, como pronto, el día siguiente al desembolso."}
        )
    try:
        schedule = generate_schedule(
            principal=principal,
            periodic_rate=periodic,
            installments=installments,
            method=Method(product.method),
            frequency=freq,
            disbursed_on=disbursed_on,
            first_due=first_due,
            is_non_working=non_working_predicate(product),
            rounding=Rounding(product.payment_rounding),
        )
    except ValueError as exc:  # engine guards (e.g. rounding vs. method)
        raise ValidationError({"non_field_errors": str(exc)}) from exc
    total_interest = sum((row.interest for row in schedule), Decimal("0.00"))
    total_charges = sum((line.amount for line in charge_lines), Decimal("0.00"))
    return Simulation(
        schedule=schedule,
        periodic_rate=periodic,
        monthly_rate=monthly_equivalent(rate, unit, freq),
        annual_rate=annual_equivalent(rate, unit, freq),
        principal=principal,
        requested_amount=money(amount),
        net_disbursed=money(amount - discounted),
        charges=charge_lines,
        total_interest=total_interest,
        total_charges=total_charges,
        total_to_pay=sum((row.total for row in schedule), Decimal("0.00")),
    )
