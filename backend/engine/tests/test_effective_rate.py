"""Annual effective cost, charges included (decision 075)."""

import datetime as dt
from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st

from engine.rates import effective_annual_rate

D = Decimal
START = dt.date(2026, 1, 1)


def every(days: int, count: int, amount: str) -> list[tuple[dt.date, Decimal]]:
    return [(START + dt.timedelta(days=days * i), D(amount)) for i in range(1, count + 1)]


def test_one_payment_a_year_later_is_its_simple_rate() -> None:
    assert effective_annual_rate(START, D("1000"), every(365, 1, "1100")) == D("0.1000")
    assert effective_annual_rate(START, D("1000"), every(730, 1, "1210")) == D("0.1000")


def test_paying_back_only_the_principal_costs_nothing() -> None:
    assert effective_annual_rate(START, D("1000"), every(30, 4, "250")) == D("0")


def test_a_weekly_flat_loan_shows_its_real_cost() -> None:
    # E1 paid weekly: the nominal «anual equivalente» says 520 %; the real
    # cost compounds: (1 + 14.96 % a week) ** (365 / 7) - 1.
    assert effective_annual_rate(START, D("1000"), every(7, 4, "350")) == D("1436.4142")


def test_charges_raise_the_cost() -> None:
    # E4 paid every 30 days, then with E7's 2 % discounted from the cash out.
    plain = effective_annual_rate(START, D("1000"), every(30, 4, "315.47"))
    discounted = effective_annual_rate(START, D("980"), every(30, 4, "315.47"))
    assert plain == D("2.1886")
    assert discounted == D("2.5362")


def test_bad_flows_are_rejected() -> None:
    with pytest.raises(ValueError, match="positive"):
        effective_annual_rate(START, D("0"), every(30, 1, "10"))
    with pytest.raises(ValueError, match="before"):
        effective_annual_rate(START, D("100"), [(START - dt.timedelta(days=1), D("110"))])


@given(
    received=st.integers(min_value=100, max_value=1_000_000),
    markup=st.integers(min_value=1, max_value=200),
    count=st.integers(min_value=1, max_value=24),
    days=st.sampled_from([1, 2, 7, 15, 30]),
)
def test_more_paid_or_less_received_always_costs_more(
    received: int, markup: int, count: int, days: int
) -> None:
    payment = D(received) * (100 + markup) / 100 / count
    flows = [(on, payment.quantize(D("0.01"))) for on, _ in every(days, count, "0")]
    cost = effective_annual_rate(START, D(received), flows)
    assert cost >= 0
    richer = [(on, amount + 1) for on, amount in flows]
    assert effective_annual_rate(START, D(received), richer) >= cost
    assert effective_annual_rate(START, D(received) - 1, flows) >= cost
