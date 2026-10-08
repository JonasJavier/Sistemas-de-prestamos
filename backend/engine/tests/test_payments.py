"""Examples E8-E13 of doc 03 (late fees, allocation and payoff): law."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from engine import late_fees, payoff
from engine.allocation import Due, Order, allocate
from engine.rates import Frequency
from engine.schedule import Method, Prepayment, Rounding, generate_schedule, reschedule

D = Decimal
DUE = date(2026, 3, 2)
DEFAULT = late_fees.Policy(
    grace_days=3,
    method=late_fees.FeeMethod.PRORATED_DAILY,
    rate=D("0.05"),
    cap_pct=D("0.10"),
)


def fee(days: int, policy=DEFAULT, base="350.00", changes=()) -> Decimal:
    return late_fees.accrued(
        due_date=DUE,
        as_of=DUE + timedelta(days=days),
        initial_base=D(base),
        policy=policy,
        changes=changes,
    )


# --- E8: late fee of a 350.00 installment -------------------------------------


@pytest.mark.parametrize(
    ("days", "expected"),
    [(0, "0.00"), (2, "0.00"), (3, "0.00"), (8, "4.67"), (45, "26.25"), (60, "35.00")],
)
def test_e8_late_fee_with_the_defaults(days: int, expected: str) -> None:
    assert fee(days) == D(expected)


def test_e8_the_cap_holds_at_90_days() -> None:
    uncapped = late_fees.Policy(
        grace_days=3, method=late_fees.FeeMethod.PRORATED_DAILY, rate=D("0.05"), cap_pct=D("9")
    )
    assert fee(90, uncapped) == D("52.50")  # what it would be without the cap
    assert fee(90) == D("35.00")


def test_e8_the_reference_configuration_gives_140() -> None:
    """5 % per day of delay, as the reference had it: 40 % in 8 days."""
    reference = late_fees.Policy(
        grace_days=0,
        method=late_fees.FeeMethod.FULL_PERIOD,
        rate=D("0.05"),
        cap_pct=D("10"),
        period_days=1,
    )
    assert fee(8, reference) == D("140.00")


def test_a_partial_payment_lowers_the_base_from_the_next_day() -> None:
    """Defect #14: the fee runs only on what is still missing."""
    paid_on_day_4 = [late_fees.BaseChange(on=DUE + timedelta(days=4), base=D("150.00"))]
    # 4 days on 350 and 6 more on 150: (1400 + 900) x 5 % / 30 = 3.83
    assert fee(10, changes=paid_on_day_4) == D("3.83")


def test_a_payment_within_the_grace_still_counts_its_days_once_late() -> None:
    paid_on_day_2 = [late_fees.BaseChange(on=DUE + timedelta(days=2), base=D("100.00"))]
    assert fee(2, changes=paid_on_day_2) == D("0.00")
    # 2 days on 350 + 8 on 100 = 1500 x 5 % / 30 = 2.50
    assert fee(10, changes=paid_on_day_2) == D("2.50")


def test_fixed_fee_once_past_the_grace_and_capped() -> None:
    fixed = late_fees.Policy(
        grace_days=3,
        method=late_fees.FeeMethod.FIXED,
        rate=D("0"),
        cap_pct=D("0.10"),
        fixed_amount=D("25.00"),
    )
    assert fee(3, fixed) == D("0.00")
    assert fee(4, fixed) == D("25.00")
    assert fee(4, fixed, base="100.00") == D("10.00")  # never above 10 % of 100


# --- E9: partial payment of 100.00 to a 350.00 installment --------------------


def test_e9_standard_order_pays_interest_first() -> None:
    applied, leftover = allocate(D("100"), [Due("q1", interest=D("100"), principal=D("250"))])
    assert (applied[0].interest, applied[0].principal, leftover) == (D("100"), D("0"), D("0"))


def test_e9_proportional_order() -> None:
    applied, leftover = allocate(
        D("100"),
        [Due("q1", interest=D("100"), principal=D("250"))],
        order=Order.PROPORTIONAL,
    )
    assert (applied[0].interest, applied[0].principal) == (D("28.57"), D("71.43"))
    assert leftover == D("0.00")


# --- E10: 800.00 to two overdue installments plus an advance ------------------


def test_e10_two_overdue_installments_and_an_advance() -> None:
    rows = generate_schedule(
        principal=D("1000"),
        periodic_rate=D("0.10"),
        installments=4,
        method=Method.FLAT,
        frequency=Frequency.WEEKLY,
        disbursed_on=date(2026, 1, 1),
    )
    paid_on = rows[0].due_date + timedelta(days=11)
    assert (paid_on - rows[1].due_date).days == 4
    dues = [
        Due(
            row.number,
            late_fee=late_fees.accrued(
                due_date=row.due_date, as_of=paid_on, initial_base=row.total, policy=DEFAULT
            ),
            interest=row.interest,
            principal=row.principal,
        )
        for row in rows
    ]
    applied, leftover = allocate(D("800.00"), dues)
    assert [(a.key, a.late_fee, a.interest, a.principal, a.total) for a in applied] == [
        (1, D("6.42"), D("100.00"), D("250.00"), D("356.42")),
        (2, D("2.33"), D("100.00"), D("250.00"), D("352.33")),
        (3, D("0.00"), D("91.25"), D("0.00"), D("91.25")),
    ]
    assert leftover == D("0.00")
    # The receipt adds up exactly (defect #29).
    assert sum(a.late_fee for a in applied) == D("8.75")
    assert sum(a.interest for a in applied) == D("291.25")
    assert sum(a.principal for a in applied) == D("500.00")


def test_what_exceeds_the_debt_is_returned_as_leftover() -> None:
    applied, leftover = allocate(D("300"), [Due("q1", interest=D("50"), principal=D("200"))])
    assert applied[0].total == D("250")
    assert leftover == D("50.00")


# --- E12-E13: early payoff ------------------------------------------------------


def _payoff_rows(rows, disbursed_on, paid: int):
    out = []
    start = disbursed_on
    for row in rows:
        if row.number > paid:
            out.append(
                payoff.Row(
                    key=row.number,
                    due_date=row.due_date,
                    period_start=start,
                    principal=row.principal,
                    interest_due=row.interest,
                    interest_paid=D("0"),
                )
            )
        start = row.due_date
    return out


def test_e12_flat_payoff_in_the_second_period() -> None:
    start = date(2026, 1, 1)
    rows = generate_schedule(
        principal=D("1000"),
        periodic_rate=D("0.10"),
        installments=4,
        method=Method.FLAT,
        frequency=Frequency.MONTHLY,
        disbursed_on=start,
    )
    q = payoff.quote(_payoff_rows(rows, start, paid=1), as_of=rows[0].due_date + timedelta(days=5))
    assert (q.principal, q.current_interest, q.total) == (D("750.00"), D("100.00"), D("850.00"))
    assert q.interest_waived == D("200.00")


def test_e13_fixed_payment_payoff() -> None:
    start = date(2026, 1, 1)
    rows = generate_schedule(
        principal=D("1000"),
        periodic_rate=D("0.10"),
        installments=4,
        method=Method.FIXED_PAYMENT,
        frequency=Frequency.MONTHLY,
        disbursed_on=start,
    )
    q = payoff.quote(_payoff_rows(rows, start, paid=1), as_of=rows[0].due_date + timedelta(days=1))
    assert (q.principal, q.current_interest, q.total) == (D("784.53"), D("78.45"), D("862.98"))


def test_payoff_can_charge_the_current_interest_by_days_run() -> None:
    row = payoff.Row(
        key=1,
        due_date=date(2026, 2, 1),
        period_start=date(2026, 1, 2),
        principal=D("1000"),
        interest_due=D("90.00"),
        interest_paid=D("0"),
    )
    q = payoff.quote([row], as_of=date(2026, 1, 12), full_current_period=False)
    assert q.current_interest == D("30.00")  # 10 of 30 days
    assert q.interest_waived == D("60.00")


def test_payoff_overdue_interest_and_future_share() -> None:
    rows = [
        payoff.Row(
            1, date(2026, 1, 1), date(2025, 12, 1), D("100"), D("10"), D("4"), D("0"), D("1.50")
        ),
        payoff.Row(2, date(2026, 2, 1), date(2026, 1, 1), D("100"), D("10"), D("0")),
        payoff.Row(3, date(2026, 3, 1), date(2026, 2, 1), D("100"), D("10"), D("0")),
    ]
    q = payoff.quote(rows, as_of=date(2026, 1, 10), future_interest_pct=D("0.5"))
    assert q.overdue_interest == D("6")
    assert q.current_interest == D("10")
    assert q.future_interest == D("5.00")
    assert q.late_fees == D("1.50")
    assert q.total == D("300") + D("6") + D("10") + D("5.00") + D("1.50")


# --- Principal prepayment (doc 03 - section 8.3) ---------------------------------


def _dates(n: int) -> list[tuple[date, date]]:
    return [(date(2026, k + 1, 1), date(2026, k + 1, 1)) for k in range(n)]


def test_prepayment_reducing_the_term_keeps_the_installment() -> None:
    rows = reschedule(
        balance=D("500.00"),
        periodic_rate=D("0.10"),
        method=Method.FIXED_PAYMENT,
        dates=_dates(3),
        keep=D("315.47"),
    )
    # 500 x 10 % = 50 interest + 265.47 principal; then 234.53 + 23.45 closes it.
    assert [row.total for row in rows] == [D("315.47"), D("257.98")]
    assert sum(row.principal for row in rows) == D("500.00")


def test_prepayment_reducing_the_payment_keeps_the_count() -> None:
    rows = reschedule(
        balance=D("500.00"),
        periodic_rate=D("0.10"),
        method=Method.FIXED_PAYMENT,
        dates=_dates(3),
        mode=Prepayment.REDUCE_PAYMENT,
        keep=D("315.47"),
    )
    assert len(rows) == 3
    assert rows[0].total == rows[1].total
    assert sum(row.principal for row in rows) == D("500.00")


def test_prepayment_on_interest_only_keeps_the_dates() -> None:
    rows = reschedule(
        balance=D("600.00"),
        periodic_rate=D("0.10"),
        method=Method.INTEREST_ONLY,
        dates=_dates(3),
    )
    assert [row.total for row in rows] == [D("60.00"), D("60.00"), D("660.00")]


def test_flat_loans_have_no_prepayment() -> None:
    with pytest.raises(ValueError, match="plano"):
        reschedule(balance=D("500"), periodic_rate=D("0.1"), method=Method.FLAT, dates=_dates(2))


# --- Properties -------------------------------------------------------------------

cents = st.integers(min_value=0, max_value=5_000_000).map(lambda c: Decimal(c) / 100)


@settings(max_examples=300, deadline=None)
@given(
    amount=cents,
    owed=st.lists(st.tuples(cents, cents, cents, cents), min_size=1, max_size=8),
    order=st.sampled_from(list(Order)),
)
def test_allocation_never_overpays_and_always_adds_up(amount, owed, order) -> None:
    dues = [
        Due(k, charges=c, late_fee=f, interest=i, principal=p)
        for k, (c, f, i, p) in enumerate(owed)
    ]
    applied, leftover = allocate(amount, dues, order=order)
    assert sum((a.total for a in applied), D("0")) + leftover == amount
    assert leftover >= 0
    by_key = {due.key: due for due in dues}
    for part in applied:
        due = by_key[part.key]
        for component in ("charges", "late_fee", "interest", "principal"):
            assert D("0") <= getattr(part, component) <= getattr(due, component)
    if leftover > 0:
        assert sum((a.total for a in applied), D("0")) == sum((d.total for d in dues), D("0"))


@settings(max_examples=200, deadline=None)
@given(
    base=st.integers(min_value=1, max_value=10_000_000).map(lambda c: Decimal(c) / 100),
    days=st.integers(min_value=0, max_value=400),
    method=st.sampled_from(list(late_fees.FeeMethod)),
)
def test_late_fee_never_exceeds_the_cap(base, days, method) -> None:
    policy = late_fees.Policy(
        grace_days=3,
        method=method,
        rate=D("0.05"),
        cap_pct=D("0.10"),
        fixed_amount=D("100"),
        period_days=7,
    )
    accrued = fee(days, policy, base=str(base))
    assert D("0") <= accrued <= (base * D("0.10")).quantize(D("0.01")) + D("0.01")


@settings(max_examples=200, deadline=None)
@given(
    balance=st.integers(min_value=100, max_value=50_000_000).map(lambda c: Decimal(c) / 100),
    rate=st.integers(min_value=0, max_value=2000).map(lambda b: Decimal(b) / 10_000),
    n=st.integers(min_value=1, max_value=36),
    method=st.sampled_from([Method.FIXED_PAYMENT, Method.FIXED_PRINCIPAL]),
    mode=st.sampled_from(list(Prepayment)),
    rounding=st.sampled_from(list(Rounding)),
)
def test_reschedule_closes_the_balance_exactly(balance, rate, n, method, mode, rounding) -> None:
    original = generate_schedule(
        principal=balance * 2,
        periodic_rate=rate,
        installments=n,
        method=method,
        frequency=Frequency.MONTHLY,
        disbursed_on=date(2025, 12, 1),
        rounding=rounding,
    )
    keep = original[0].total if method == Method.FIXED_PAYMENT else original[0].principal
    rows = reschedule(
        balance=balance,
        periodic_rate=rate,
        method=method,
        dates=_dates(min(n, 12)),
        mode=mode,
        keep=keep,
        rounding=rounding,
    )
    assert sum(row.principal for row in rows) == balance
    assert all(row.principal >= 0 for row in rows)
    assert len(rows) <= min(n, 12)
