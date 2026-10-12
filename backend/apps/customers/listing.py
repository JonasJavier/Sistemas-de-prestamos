"""P20, the customer list of the redesign (decision 114): each customer with
the portfolio a manager reads at a glance — balance, next installment, the
worst arrears and who collects — and the filters by state and collector.

Everything comes from the loans' nightly-maintained figures (balance, days
past due, next due date), so the list never recomputes a schedule.
"""

from decimal import Decimal
from uuid import UUID

from django.db.models import (
    Count,
    DecimalField,
    ExpressionWrapper,
    F,
    Max,
    Min,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Sum,
    Value,
)
from django.db.models.functions import Coalesce, Concat

from apps.customers.models import Customer
from apps.lending.models import Installment, Loan

ZERO = Decimal("0.00")
MONEY = DecimalField(max_digits=14, decimal_places=2)
ACTIVE = Q(loans__status=Loan.Status.ACTIVE)

#: The states of the filter, as the screen names them.
STATES = ("al_dia", "atraso", "sin_prestamo")


def with_portfolio(queryset: QuerySet[Customer]) -> QuerySet[Customer]:
    """Annotate the figures of the list: active loans, capital balance, the
    worst days past due, the next due date with what falls due that day, and
    the collector of the loan due soonest."""
    owed = ExpressionWrapper(
        F("principal_due")
        + F("interest_due")
        + F("charges_due")
        - F("principal_paid")
        - F("interest_paid")
        - F("charges_paid")
        - F("interest_waived"),
        output_field=MONEY,
    )
    # The date is looked up again inside: pointing at the «next_due» aggregate
    # would drag the loan's columns into the GROUP BY (one row per loan).
    first_due = (
        Loan.objects.filter(customer=OuterRef(OuterRef("pk")), status=Loan.Status.ACTIVE)
        .exclude(next_due_date=None)
        .order_by("next_due_date")
        .values("next_due_date")[:1]
    )
    next_amount = (
        Installment.objects.filter(
            loan__customer=OuterRef("pk"),
            loan__status=Loan.Status.ACTIVE,
            due_date=Subquery(first_due),
        )
        .exclude(status__in=[Installment.Status.PAID, Installment.Status.SUPERSEDED])
        .values("loan__customer")
        .annotate(t=Sum(owed))
        .values("t")
    )
    soonest = Loan.objects.filter(customer=OuterRef("pk"), status=Loan.Status.ACTIVE).order_by(
        F("next_due_date").asc(nulls_last=True), "number"
    )
    return queryset.annotate(
        active_loans=Count("loans", filter=ACTIVE, distinct=True),
        balance=Coalesce(Sum("loans__principal_outstanding", filter=ACTIVE), Value(ZERO)),
        worst_dpd=Coalesce(Max("loans__days_past_due", filter=ACTIVE), Value(0)),
        next_due=Min("loans__next_due_date", filter=ACTIVE),
        next_amount=Subquery(next_amount, output_field=MONEY),
        main_loan=Subquery(soonest.values("number")[:1]),
        collector_name=Subquery(
            soonest.filter(collector__isnull=False)
            .annotate(n=Concat("collector__first_name", Value(" "), "collector__last_name"))
            .values("n")[:1]
        ),
    )


def by_state(queryset: QuerySet[Customer], state: str) -> QuerySet[Customer]:
    """Al día: active loans and none late; en atraso: any late; sin préstamo:
    nothing active. Needs ``with_portfolio``."""
    if state == "al_dia":
        return queryset.filter(active_loans__gt=0, worst_dpd=0)
    if state == "atraso":
        return queryset.filter(worst_dpd__gt=0)
    if state == "sin_prestamo":
        return queryset.filter(active_loans=0)
    return queryset


def by_collector(queryset: QuerySet[Customer], collector: str) -> QuerySet[Customer]:
    """Customers with an active loan in that collector's portfolio; «oficina»:
    with an active loan nobody collects on the street. A subquery, so the
    portfolio annotations never count a loan twice."""
    loans = Loan.objects.filter(status=Loan.Status.ACTIVE)
    if collector == "oficina":
        loans = loans.filter(collector__isnull=True)
    else:
        loans = loans.filter(collector_id=UUID(collector))
    return queryset.filter(id__in=loans.values("customer_id"))


def summary(queryset: QuerySet[Customer]) -> dict:
    """The counts of the filter chips and the portfolio under the title."""
    annotated = with_portfolio(queryset)
    loans = Loan.objects.filter(status=Loan.Status.ACTIVE, customer_id__in=queryset.values("id"))
    totals = loans.aggregate(count=Count("id"), principal=Sum("principal_outstanding"))
    return {
        "todos": queryset.count(),
        **{state: by_state(annotated, state).count() for state in STATES},
        "loans": totals["count"],
        "principal": totals["principal"] or ZERO,
    }
