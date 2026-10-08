"""How a payment is applied (doc 03 - section 8, examples E9 and E10).

The oldest installment is paid first. Within one installment the standard
order is charges -> late fee -> interest -> principal; the «proportional»
order (the reference's) still pays charges and late fee first, then
splits the rest between interest and principal in proportion to what
each one owes. What is left after the last installment is returned to
the caller, who decides (change for cash, or a refusal).
"""

from collections.abc import Hashable, Sequence
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum

from engine.money import money

ZERO = Decimal("0.00")
COMPONENTS = ("charges", "late_fee", "interest", "principal")


class Order(StrEnum):
    STANDARD = "standard"
    PROPORTIONAL = "proportional"


@dataclass(frozen=True)
class Due:
    """What one installment owes right now, per component."""

    key: Hashable
    charges: Decimal = ZERO
    late_fee: Decimal = ZERO
    interest: Decimal = ZERO
    principal: Decimal = ZERO

    @property
    def total(self) -> Decimal:
        return self.charges + self.late_fee + self.interest + self.principal


@dataclass(frozen=True)
class Applied:
    key: Hashable
    charges: Decimal = ZERO
    late_fee: Decimal = ZERO
    interest: Decimal = ZERO
    principal: Decimal = ZERO

    @property
    def total(self) -> Decimal:
        return self.charges + self.late_fee + self.interest + self.principal


def _take(available: Decimal, owed: Decimal) -> Decimal:
    return min(available, owed) if owed > 0 else ZERO


def _apply_one(amount: Decimal, due: Due, order: Order) -> Applied:
    charges = _take(amount, due.charges)
    amount -= charges
    late_fee = _take(amount, due.late_fee)
    amount -= late_fee
    if order == Order.PROPORTIONAL and amount < due.interest + due.principal:
        interest = money(amount * due.interest / (due.interest + due.principal))
        principal = amount - interest
        # Rounding can never push a component past what it owes.
        if principal > due.principal:
            interest += principal - due.principal
            principal = due.principal
        return Applied(due.key, charges, late_fee, interest, principal)
    interest = _take(amount, due.interest)
    amount -= interest
    principal = _take(amount, due.principal)
    return Applied(due.key, charges, late_fee, interest, principal)


def allocate(
    amount: Decimal, dues: Sequence[Due], *, order: Order = Order.STANDARD
) -> tuple[list[Applied], Decimal]:
    """Apply ``amount`` to ``dues`` (oldest first). Returns what each one
    receives (only the ones that receive something) and the leftover."""
    amount = money(amount)
    if amount < 0:
        raise ValueError("El monto no puede ser negativo.")
    applied: list[Applied] = []
    for due in dues:
        if amount <= 0:
            break
        part = _apply_one(amount, due, Order(order))
        if part.total > 0:
            applied.append(part)
            amount -= part.total
    return applied, amount
