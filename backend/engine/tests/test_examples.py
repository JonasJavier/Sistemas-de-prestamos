"""The numeric examples of doc 03 are the spec: these figures are law."""

from datetime import date
from decimal import Decimal

from engine.rates import Frequency, RateUnit, period_rate
from engine.schedule import Method, generate_schedule

D = Decimal
START = date(2026, 1, 1)


def make(principal: str, rate: str, n: int, method: Method, frequency=Frequency.MONTHLY):
    return generate_schedule(
        principal=D(principal),
        periodic_rate=D(rate),
        installments=n,
        method=method,
        frequency=frequency,
        disbursed_on=START,
    )


def test_e1_flat_1000_at_10_in_4() -> None:
    rows = make("1000", "0.10", 4, Method.FLAT)
    assert all(row.total == D("350.00") for row in rows)
    assert all(row.interest == D("100.00") for row in rows)
    assert sum(row.total for row in rows) == D("1400.00")


def test_e2_flat_residue_goes_to_the_last_installment() -> None:
    rows = make("1000", "0.10", 3, Method.FLAT)
    assert [row.total for row in rows] == [D("433.33"), D("433.33"), D("433.34")]
    assert sum(row.principal for row in rows) == D("1000.00")


def test_e3_interest_only() -> None:
    rows = make("1000", "0.10", 4, Method.INTEREST_ONLY)
    assert [row.total for row in rows] == [
        D("100.00"),
        D("100.00"),
        D("100.00"),
        D("1100.00"),
    ]
    assert sum(row.total for row in rows) == D("1400.00")


def test_e4_fixed_payment_full_table() -> None:
    rows = make("1000", "0.10", 4, Method.FIXED_PAYMENT)
    table = [(row.principal, row.interest, row.total) for row in rows]
    assert table == [
        (D("215.47"), D("100.00"), D("315.47")),
        (D("237.02"), D("78.45"), D("315.47")),
        (D("260.72"), D("54.75"), D("315.47")),
        (D("286.79"), D("28.68"), D("315.47")),
    ]
    assert sum(row.principal for row in rows) == D("1000.00")
    assert sum(row.interest for row in rows) == D("261.88")


def test_e5_rate_conversion_monthly_to_biweekly() -> None:
    rate = period_rate(D("0.05"), RateUnit.MONTHLY, Frequency.BIWEEKLY)
    assert rate == D("0.025")
    rows = generate_schedule(
        principal=D("10000"),
        periodic_rate=rate,
        installments=6,
        method=Method.FIXED_PAYMENT,
        frequency=Frequency.BIWEEKLY,
        disbursed_on=START,
    )
    assert rows[0].total == D("1815.50")
    assert [row.principal for row in rows] == [
        D("1565.50"),
        D("1604.64"),
        D("1644.75"),
        D("1685.87"),
        D("1728.02"),
        D("1771.22"),
    ]
    assert sum(row.interest for row in rows) == D("893.00")
    assert sum(row.total for row in rows) == D("10893.00")


def test_e6_fixed_principal_decreasing() -> None:
    rows = make("1000", "0.10", 4, Method.FIXED_PRINCIPAL)
    assert [row.total for row in rows] == [
        D("350.00"),
        D("325.00"),
        D("300.00"),
        D("275.00"),
    ]
    assert sum(row.interest for row in rows) == D("250.00")


def test_rate_conversions_table() -> None:
    monthly = D("0.05")
    assert period_rate(monthly, RateUnit.MONTHLY, Frequency.DAILY) == monthly / 30
    assert period_rate(monthly, RateUnit.MONTHLY, Frequency.INTERDAILY) == monthly * 2 / 30
    assert period_rate(monthly, RateUnit.MONTHLY, Frequency.WEEKLY) == monthly * 7 / 30
    assert period_rate(monthly, RateUnit.MONTHLY, Frequency.MONTHLY) == monthly
    assert period_rate(D("0.60"), RateUnit.ANNUAL, Frequency.MONTHLY) == D("0.05")
    assert period_rate(D("0.025"), RateUnit.PER_PERIOD, Frequency.BIWEEKLY) == D("0.025")
