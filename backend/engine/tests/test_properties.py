"""Property-based tests: thousands of random loans must keep the books
exact (doc 01: Hypothesis over the financial engine).
"""

from datetime import date
from decimal import Decimal

from hypothesis import given, settings
from hypothesis import strategies as st

from engine.rates import Frequency
from engine.schedule import ROUNDING_STEP, Method, Rounding, generate_schedule

principals = st.integers(min_value=100, max_value=500_000_000).map(
    lambda cents: Decimal(cents) / 100
)
rates = st.integers(min_value=0, max_value=3000).map(lambda bps: Decimal(bps) / 10_000)
counts = st.integers(min_value=1, max_value=72)
methods = st.sampled_from(list(Method))
frequencies = st.sampled_from(list(Frequency))


def _schedule(**kwargs):
    """The schedule, or None when the engine refuses a «fixed» installment
    that pays interest only, leaving all the principal for the last one
    (decision 105). Nothing else may be refused."""
    try:
        return generate_schedule(**kwargs)
    except ValueError as exc:
        assert kwargs["method"] == Method.FIXED_PAYMENT, exc
        assert "casi no paga capital" in str(exc)
        return None


@settings(max_examples=300, deadline=None)
@given(
    principal=principals,
    rate=rates,
    n=counts,
    method=methods,
    frequency=frequencies,
)
def test_schedule_invariants(principal, rate, n, method, frequency) -> None:
    rows = _schedule(
        principal=principal,
        periodic_rate=rate,
        installments=n,
        method=method,
        frequency=frequency,
        disbursed_on=date(2026, 1, 15),
    )
    if rows is None:
        return
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
    rows = _schedule(
        principal=principal,
        periodic_rate=rate,
        installments=n,
        method=Method.FIXED_PAYMENT,
        frequency=Frequency.MONTHLY,
        disbursed_on=date(2026, 1, 15),
    )
    if rows is None:
        return
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


roundings = st.sampled_from([Rounding.PESO, Rounding.FIVE, Rounding.TEN])
amortizing = st.sampled_from([Method.FLAT, Method.FIXED_PAYMENT, Method.FIXED_PRINCIPAL])


@settings(max_examples=300, deadline=None)
@given(principal=principals, rate=rates, n=counts, method=amortizing, rounding=roundings)
def test_rounded_schedules_stay_exact(principal, rate, n, method, rounding) -> None:
    """Rounding the installment never loses a cent nor goes negative, and
    every non-last installment is a multiple of the rounding step."""
    rows = _schedule(
        principal=principal,
        periodic_rate=rate,
        installments=n,
        method=method,
        frequency=Frequency.MONTHLY,
        disbursed_on=date(2026, 1, 15),
        rounding=rounding,
    )
    if rows is None:
        return
    assert sum(row.principal for row in rows) == principal.quantize(Decimal("0.01"))
    assert all(row.principal >= 0 and row.interest >= 0 for row in rows)
    step = ROUNDING_STEP[rounding]
    target = principal.quantize(Decimal("0.01"))
    paid = Decimal("0.00")
    for row in rows[:-1]:
        paid += row.principal
        # Either the rounded target, or a clamp: the interest alone exceeds
        # it (tiny loans) or this installment exhausted the balance.
        assert row.total % step == 0 or row.principal == 0 or paid == target
    # The closing installment is never above the regular one (rounding up).
    if method != Method.FIXED_PRINCIPAL and n > 1:
        assert rows[-1].total <= rows[0].total + Decimal("0.01") * n


def test_a_fixed_installment_that_pays_no_principal_is_refused() -> None:
    """Hypothesis found it: 29.36 % a month over 46 months leaves 0.0026 of
    principal in the exact installment; in cents the last one would carry
    all the principal (decision 105)."""
    import pytest

    with pytest.raises(ValueError, match="casi no paga capital"):
        generate_schedule(
            principal=Decimal("1249.99"),
            periodic_rate=Decimal("0.2936"),
            installments=46,
            method=Method.FIXED_PAYMENT,
            frequency=Frequency.MONTHLY,
            disbursed_on=date(2026, 1, 15),
            rounding=Rounding.PESO,
        )
    # A high but ordinary loan still works: 20 % a month over a year.
    rows = generate_schedule(
        principal=Decimal("1000"),
        periodic_rate=Decimal("0.20"),
        installments=12,
        method=Method.FIXED_PAYMENT,
        frequency=Frequency.MONTHLY,
        disbursed_on=date(2026, 1, 15),
        rounding=Rounding.PESO,
    )
    assert sum(row.principal for row in rows) == Decimal("1000.00")
