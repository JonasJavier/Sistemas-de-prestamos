"""Amounts typed as people write them in the Dominican Republic."""

from decimal import Decimal

import pytest
from rest_framework import serializers


class Amount(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)


@pytest.mark.parametrize(
    ("typed", "value"),
    [
        ("25000", Decimal("25000")),
        ("25,000", Decimal("25000")),
        ("1,250,000.50", Decimal("1250000.50")),
        (" 3,500.00 ", Decimal("3500.00")),
        ("-1,000", Decimal("-1000")),
    ],
)
def test_thousands_separators_are_accepted(typed, value) -> None:
    data = Amount(data={"amount": typed})
    assert data.is_valid(), data.errors
    assert data.validated_data["amount"] == value


@pytest.mark.parametrize("typed", ["4,5", "25,00", "1,2345", "12,34,567"])
def test_a_comma_that_is_not_a_thousands_group_is_still_rejected(typed) -> None:
    assert not Amount(data={"amount": typed}).is_valid()


def test_the_simulator_takes_a_typed_amount(tenant) -> None:
    """End to end through a real endpoint: «25,000» quotes like 25000."""
    product = tenant.product("Cuota Fija (mensual)")
    client = tenant.client("oficial")
    body = {"product": str(product.id), "installments": 3, "frequency": "monthly"}
    plain = client.post("/api/v1/simulador/", {**body, "amount": "25000"}, format="json")
    typed = client.post("/api/v1/simulador/", {**body, "amount": "25,000"}, format="json")
    assert plain.status_code == typed.status_code == 200, typed.content
    assert plain.json()["total_to_pay"] == typed.json()["total_to_pay"]
