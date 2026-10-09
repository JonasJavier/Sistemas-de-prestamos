"""Customer classification A–D (doc 09 §3, P62, decision 088): explainable
points, never a black box (reference defect #38).

Out of 100 points:
- **Punctuality (50):** share of the installments already due that were
  paid in full on time (by their due date plus the loan's late-fee grace).
- **Average days late (30):** over those installments, the days each was
  paid late (or is late today, if unpaid); 0 days keeps the 30 points and
  30 days or more loses them all, in proportion.
- **Seniority and paid-off loans (20):** up to 10 for months as a customer
  (24 months or more) and up to 10 for loans paid off (3 or more).

Grades: A ≥ 85 · B ≥ 70 · C ≥ 50 · D below. A short history (fewer than
4 installments due) stays between B and C: one installment says little.
Caps that override the points, and are shown as such: a written-off loan or
one more than 90 days late today is D; more than 30 days late today is at
most C. A customer with no installment due yet has no grade («Sin
historial»).
"""

import datetime as dt
from collections import defaultdict
from dataclasses import dataclass, field
from decimal import Decimal

from django.utils import timezone

from apps.core.text import plural

GRADES = [("A", 85, "Excelente"), ("B", 70, "Bueno"), ("C", 50, "Regular"), ("D", 0, "Riesgoso")]
GRADE_LABELS = {grade: label for grade, _, label in GRADES}
WEIGHTS = {"punctuality": 50, "days_late": 30, "seniority": 10, "paid_off": 10}
DAYS_LATE_ZERO = 30  # an average this late scores nothing
SENIORITY_MONTHS = 24
PAID_OFF_LOANS = 3
SHORT_HISTORY = 4  # fewer installments due than this: between B and C


@dataclass
class Installment:
    due_date: dt.date
    paid_on: dt.date | None  # paid in full on that date
    grace_days: int


@dataclass
class Facts:
    """What the score reads about one customer, as of a date."""

    installments: list[Installment] = field(default_factory=list)
    first_disbursed_on: dt.date | None = None
    paid_off_loans: int = 0
    written_off: bool = False
    max_days_past_due: int = 0  # among the active loans, today


@dataclass
class Score:
    score: Decimal | None
    grade: str  # A B C D, or "" without history
    factors: list[dict]


def _points(weight: int, fraction: Decimal) -> Decimal:
    fraction = min(max(fraction, Decimal(0)), Decimal(1))
    return (weight * fraction).quantize(Decimal("0.1"))


def compute(facts: Facts, as_of: dt.date) -> Score:
    due = [i for i in facts.installments if i.due_date <= as_of]
    if not due:
        return Score(
            None,
            "",
            [{"key": "history", "label": "Sin cuotas vencidas todavía", "points": None}],
        )
    on_time = 0
    late_days = 0
    for inst in due:
        if inst.paid_on is not None:
            late = max((inst.paid_on - inst.due_date).days, 0)
            on_time += late <= inst.grace_days
        else:
            late = max((as_of - inst.due_date).days, 0)
        late_days += late
    count = len(due)
    average = Decimal(late_days) / count
    months = (
        (as_of.year - facts.first_disbursed_on.year) * 12
        + as_of.month
        - facts.first_disbursed_on.month
        if facts.first_disbursed_on
        else 0
    )
    factors = [
        {
            "key": "punctuality",
            "label": "Cuotas pagadas a tiempo",
            "detail": f"{on_time} de {count} ({Decimal(on_time * 100) / count:.0f} %)",
            "points": _points(WEIGHTS["punctuality"], Decimal(on_time) / count),
            "max": WEIGHTS["punctuality"],
        },
        {
            "key": "days_late",
            "label": "Días promedio de atraso",
            "detail": f"{average:.1f} días",
            "points": _points(WEIGHTS["days_late"], 1 - average / DAYS_LATE_ZERO),
            "max": WEIGHTS["days_late"],
        },
        {
            "key": "seniority",
            "label": "Antigüedad como cliente",
            "detail": plural(months, "mes", "meses"),
            "points": _points(WEIGHTS["seniority"], Decimal(months) / SENIORITY_MONTHS),
            "max": WEIGHTS["seniority"],
        },
        {
            "key": "paid_off",
            "label": "Préstamos saldados",
            "detail": str(facts.paid_off_loans),
            "points": _points(WEIGHTS["paid_off"], Decimal(facts.paid_off_loans) / PAID_OFF_LOANS),
            "max": WEIGHTS["paid_off"],
        },
    ]
    total = sum((f["points"] for f in factors), Decimal(0))
    grade = next(g for g, minimum, _ in GRADES if total >= minimum)
    if count < SHORT_HISTORY and grade in {"A", "D"}:
        grade = "B" if grade == "A" else "C"
        factors.append(
            {
                "key": "short",
                "label": f"Historial corto ({plural(count, 'cuota vencida', 'cuotas vencidas')}): "
                "queda entre B y C",
            }
        )
    if facts.written_off:
        grade = "D"
        factors.append({"key": "cap", "label": "Tiene un préstamo castigado: queda en D"})
    elif facts.max_days_past_due > 90:
        grade = "D"
        factors.append(
            {"key": "cap", "label": f"Atraso actual de {facts.max_days_past_due} días: queda en D"}
        )
    elif facts.max_days_past_due > 30 and grade in {"A", "B"}:
        grade = "C"
        factors.append(
            {
                "key": "cap",
                "label": f"Atraso actual de {facts.max_days_past_due} días: como mucho C",
            }
        )
    return Score(total, grade, factors)


def facts_by_customer(as_of: dt.date) -> dict:
    """Every customer with loans, in two queries (inside the tenant)."""
    from apps.lending.models import Installment as Row
    from apps.lending.models import Loan

    facts: dict = defaultdict(Facts)
    loans = Loan.objects.exclude(status=Loan.Status.VOIDED).values_list(
        "customer_id", "disbursed_on", "status", "days_past_due"
    )
    for customer_id, disbursed_on, status, days in loans:
        entry = facts[customer_id]
        if entry.first_disbursed_on is None or disbursed_on < entry.first_disbursed_on:
            entry.first_disbursed_on = disbursed_on
        entry.paid_off_loans += status == Loan.Status.PAID_OFF
        entry.written_off |= status == Loan.Status.WRITTEN_OFF
        if status == Loan.Status.ACTIVE:
            entry.max_days_past_due = max(entry.max_days_past_due, days)
    rows = (
        Row.objects.filter(due_date__lte=as_of)
        .exclude(status=Row.Status.SUPERSEDED)
        .exclude(loan__status=Loan.Status.VOIDED)
        .values_list(
            "loan__customer_id", "due_date", "paid_on", "status", "terms__late_fee_grace_days"
        )
    )
    for customer_id, due_date, paid_on, status, grace in rows:
        paid = paid_on if status == Row.Status.PAID else None
        facts[customer_id].installments.append(Installment(due_date, paid, grace or 0))
    return facts


def refresh(as_of: dt.date | None = None) -> int:
    """Nightly: one score per customer with loans, keeping the previous grade."""
    from apps.customers.models import Customer
    from apps.reports.models import CustomerScore

    as_of = as_of or timezone.localdate()
    now = timezone.now()
    current = {s.customer_id: s for s in CustomerScore.objects.all()}
    companies = dict(Customer.objects.values_list("id", "company_id"))
    created, updated = [], []
    for customer_id, facts in facts_by_customer(as_of).items():
        result = compute(facts, as_of)
        row = current.get(customer_id)
        if row is None:
            created.append(
                CustomerScore(
                    company_id=companies[customer_id],
                    customer_id=customer_id,
                    score=result.score,
                    grade=result.grade,
                    factors=_json(result.factors),
                    computed_at=now,
                )
            )
            continue
        if row.grade != result.grade:
            row.previous_grade = row.grade
            row.grade_changed_at = now
        row.score, row.grade, row.factors, row.computed_at = (
            result.score,
            result.grade,
            _json(result.factors),
            now,
        )
        updated.append(row)
    CustomerScore.objects.bulk_create(created)
    CustomerScore.objects.bulk_update(
        updated,
        ["score", "grade", "factors", "computed_at", "previous_grade", "grade_changed_at"],
    )
    return len(created) + len(updated)


def _json(factors: list[dict]) -> list[dict]:
    return [
        {k: (str(v) if isinstance(v, Decimal) else v) for k, v in factor.items()}
        for factor in factors
    ]
