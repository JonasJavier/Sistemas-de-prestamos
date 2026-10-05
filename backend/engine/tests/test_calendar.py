"""Calendar rules of doc 03 - section 4."""

from datetime import date
from decimal import Decimal

import pytest

from engine.rates import Frequency
from engine.schedule import Method, generate_schedule

D = Decimal


def make_dates(frequency, disbursed_on, n=4, first_due=None, non_working=None, semimonthly=False):
    rows = generate_schedule(
        principal=D("1000"),
        periodic_rate=D("0.10"),
        installments=n,
        method=Method.FLAT,
        frequency=frequency,
        disbursed_on=disbursed_on,
        first_due=first_due,
        is_non_working=non_working or (lambda d: False),
        semimonthly=semimonthly,
    )
    return [(row.due_date, row.original_due_date) for row in rows]


def test_monthly_31st_falls_to_month_end_and_recovers() -> None:
    dates = [d for d, _ in make_dates(Frequency.MONTHLY, date(2026, 1, 31), n=4)]
    # Anchor: one month after 31/01 -> 28/02; the 31 recovers when it exists.
    assert dates == [
        date(2026, 2, 28),
        date(2026, 3, 28),
        date(2026, 4, 28),
        date(2026, 5, 28),
    ]
    anchored = [
        d
        for d, _ in make_dates(
            Frequency.MONTHLY, date(2026, 1, 15), n=4, first_due=date(2026, 1, 31)
        )
    ]
    assert anchored == [
        date(2026, 1, 31),
        date(2026, 2, 28),
        date(2026, 3, 31),
        date(2026, 4, 30),
    ]


def test_weekly_shift_does_not_accumulate() -> None:
    # Sundays are non-working; a due date on Sunday moves to Monday but
    # the following dates keep their original weekly sequence.
    sunday = date(2026, 1, 4)
    assert sunday.weekday() == 6
    pairs = make_dates(
        Frequency.WEEKLY,
        date(2025, 12, 28),
        n=3,
        first_due=sunday,
        non_working=lambda d: d.weekday() == 6,
    )
    assert pairs == [
        (date(2026, 1, 5), date(2026, 1, 4)),  # shifted to Monday
        (date(2026, 1, 12), date(2026, 1, 11)),  # shifted, not accumulated
        (date(2026, 1, 19), date(2026, 1, 18)),
    ]


def test_daily_skips_non_working_days() -> None:
    # Friday 2/1/2026 disbursement; Sundays skipped entirely for daily loans.
    pairs = make_dates(
        Frequency.DAILY,
        date(2026, 1, 2),
        n=4,
        non_working=lambda d: d.weekday() == 6,
    )
    dates = [d for d, _ in pairs]
    assert dates == [
        date(2026, 1, 3),  # Saturday
        date(2026, 1, 5),  # Monday (Sunday skipped: no installment)
        date(2026, 1, 6),
        date(2026, 1, 7),
    ]


def test_semimonthly_15_and_month_end() -> None:
    dates = [
        d
        for d, _ in make_dates(
            Frequency.BIWEEKLY, date(2026, 1, 10), n=4, semimonthly=True
        )
    ]
    assert dates == [
        date(2026, 1, 15),
        date(2026, 1, 31),
        date(2026, 2, 15),
        date(2026, 2, 28),
    ]


def test_first_due_never_on_or_before_disbursement() -> None:
    with pytest.raises(ValueError):
        make_dates(Frequency.WEEKLY, date(2026, 1, 10), first_due=date(2026, 1, 10))


def test_interest_does_not_change_when_dates_shift() -> None:
    plain = generate_schedule(
        principal=D("1000"),
        periodic_rate=D("0.10"),
        installments=4,
        method=Method.FIXED_PAYMENT,
        frequency=Frequency.WEEKLY,
        disbursed_on=date(2026, 1, 1),
    )
    shifted = generate_schedule(
        principal=D("1000"),
        periodic_rate=D("0.10"),
        installments=4,
        method=Method.FIXED_PAYMENT,
        frequency=Frequency.WEEKLY,
        disbursed_on=date(2026, 1, 1),
        is_non_working=lambda d: d.weekday() in (5, 6),
    )
    assert [row.interest for row in plain] == [row.interest for row in shifted]
    assert [row.total for row in plain] == [row.total for row in shifted]
