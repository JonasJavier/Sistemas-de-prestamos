"""Document formatting: ``RD$ 1,250.00`` and ``04/10/2026`` (doc 09 - section 1)."""

from decimal import Decimal

from django import template

register = template.Library()


@register.filter
def rd(value) -> str:
    if value is None or value == "":
        return "—"
    return f"RD$ {Decimal(value):,.2f}"


@register.filter
def num(value) -> str:
    if value is None or value == "":
        return "—"
    return f"{Decimal(value):,.2f}"


@register.filter
def pct(value, places: int = 2) -> str:
    if value is None:
        return "—"
    text = f"{Decimal(value):.{int(places)}f}".rstrip("0").rstrip(".")
    return f"{text} %"


@register.filter
def dmy(value) -> str:
    return value.strftime("%d/%m/%Y") if value else "—"


@register.filter
def doc(value) -> str:
    """A cédula reads 001-1234567-8; RNC and passports go as stored."""
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) == 11:
        return f"{digits[:3]}-{digits[3:10]}-{digits[10]}"
    return str(value or "")
