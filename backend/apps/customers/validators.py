"""Dominican document validators (doc 04 - F1).

Cedula: 11 digits; the first 10 feed a Luhn checksum (weights 1,2
alternating, digits over 9 subtract 9) and the 11th is the check digit.
RNC: 9 digits (format check only; the DGII registry is not consulted).
"""

import re

from django.core.exceptions import ValidationError

CEDULA_RE = re.compile(r"^\d{11}$")
RNC_RE = re.compile(r"^\d{9}$")


def clean_document(value: str) -> str:
    """Strip the usual dashes/spaces: 001-1234567-8 -> 00112345678."""
    return re.sub(r"[\s-]", "", value or "")


def validate_cedula(value: str) -> str:
    digits = clean_document(value)
    if not CEDULA_RE.match(digits):
        raise ValidationError("La cédula debe tener 11 dígitos.")
    total = 0
    for index, char in enumerate(digits[:10]):
        weight = 1 if index % 2 == 0 else 2
        product = int(char) * weight
        if product > 9:
            product -= 9
        total += product
    check = (10 - (total % 10)) % 10
    if check != int(digits[10]):
        raise ValidationError("La cédula no es válida (dígito verificador incorrecto).")
    return digits


def validate_rnc(value: str) -> str:
    digits = clean_document(value)
    if not RNC_RE.match(digits):
        raise ValidationError("El RNC debe tener 9 dígitos.")
    return digits
