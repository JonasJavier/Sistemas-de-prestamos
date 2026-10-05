import pytest
from django.core.exceptions import ValidationError

from apps.customers.validators import validate_cedula, validate_rnc


def test_valid_cedula_with_dashes_is_normalized() -> None:
    assert validate_cedula("001-1234567-3") == "00112345673"


def test_cedula_with_wrong_check_digit_fails() -> None:
    with pytest.raises(ValidationError):
        validate_cedula("00112345674")


def test_cedula_with_wrong_length_fails() -> None:
    with pytest.raises(ValidationError):
        validate_cedula("123456")


def test_valid_rnc() -> None:
    assert validate_rnc("1-31-12345-6".replace("-", "")) == "131123456"


def test_rnc_with_wrong_length_fails() -> None:
    with pytest.raises(ValidationError):
        validate_rnc("12345")
