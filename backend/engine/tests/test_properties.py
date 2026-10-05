"""Property-based tests: thousands of random loans must keep the books
exact (doc 01: Hypothesis over the financial engine).
"""

from datetime import date
from decimal import Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from engine.rates import Frequency
from engine.schedule import Method, generate_schedule

principals = st.integers(min_value=100, max_value=500_000_000).map(
    lambda cents: Decimal(cents) / 100
)
rates = st.integers(min_value=0, max_value=3000).map(lambda bps: Decimal(bps) / 10_000)
counts = st.integers(min_value=1, max_value=72)
methods = st.sampled_from(list(Method))
frequencies = st.sampled_from(list(Frequency))


@settings(max_examples=300, deadline=None)
@given(
    principal=principals,
    rate=rates,
    n=counts,
    method=methods,
    frequency=frequencies,
)
def test_schedule_invariants(principal, rate, n, method, frequency) -> None:
    rows = generate_schedule(
        principal=principal,
        periodic_rate=rate,
        installments=n,
        method=method,
        frequency=frequency,
        disbursed_on=date(2026, 1, 15),
    )
    assert len(rows) == n
    # The principal adds up EXACTLY: not one cent lost (defect #35).
    assert sum(row.principal for row in rows) == principal.quantize(Decimal("0.01"))
    # Nothing negative, everything in cents.
    for row in rows:
        assert row.principal >= 0
        assert row.interest >= 0
        assert row.principal == row.principal.quantize(Decimal("0.01"))
        assert row.interest == row.interest.quantize(Decimal("0.01"))
    # Dates strictly increasing and numbered 1..n.
    assert [row.number for row in rows] == list(range(1, n + 1))
    assert all(a.due_date < b.due_date for a, b in zip(rows, rows[1:], strict=False))


@settings(max_examples=200, deadline=None)
@given(principal=principals, rate=rates, n=counts)
def test_fixed_payment_installments_are_level(principal, rate, n) -> None:
    rows = generate_schedule(
        principal=principal,
        periodic_rate=rate,
        installments=n,
        method=Method.FIXED_PAYMENT,
        frequency=Frequency.MONTHLY,
        disbursed_on=date(2026, 1, 15),
    )
    totals = [row.total for row in rows]
    # Non-last installments: level payments, then (for tiny loans that
    # finish amortizing early) one clamped partial and a zero tail.
    non_last = totals[:-1]
    level = totals[0]
    assert all(a >= b for a, b in zip(non_last, non_last[1:], strict=False))
    assert all(total <= level for total in non_last)
    assert len(set(non_last)) <= 3
    assert totals[-1] >= 0
    assert sum(row.principal for row in rows) == principal.quantize(Decimal("0.01"))
