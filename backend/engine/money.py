"""Money primitives (doc 03, principles).

Commercial rounding to 2 decimals: 0.005 goes UP to 0.01. Everything the
engine returns is a quantized Decimal; floats never enter.
"""

from decimal import ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")

Amount = Decimal | int | str


def D(value: Amount) -> Decimal:  # noqa: N802 - deliberate short constructor
    if isinstance(value, float):
        raise TypeError("Never build money from float; use str or Decimal.")
    return Decimal(value)


def money(value: Amount) -> Decimal:
    """Round to cents, commercial style (half up)."""
    return D(value).quantize(CENT, rounding=ROUND_HALF_UP)
