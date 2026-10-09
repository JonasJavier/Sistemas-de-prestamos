"""F6 and F8 (phase 4 part): the day's route, visits, the collectors'
location and the portfolio assignment.
"""

import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import Membership, User
from apps.audit.models import record_event
from apps.cash import services as cash
from apps.collections.models import CollectionAction, LocationPing, PaymentPromise, RouteStop
from apps.lending.models import CollectorAssignment, Loan
from apps.payments import portfolio

ZERO = Decimal("0.00")
ASSIGN_ROLES = (authz.GERENTE, authz.SUPERVISOR)
PING_RETENTION_DAYS = 90


class CollectionsError(Exception):
    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


# --- Portfolio assignment ------------------------------------------------------------------


def collectors_of(branch_id) -> list[User]:
    return [
        m.user
        for m in Membership.objects.filter(
            role__name=authz.COBRADOR, branch_id=branch_id, user__is_active=True
        ).select_related("user")
    ]


@transaction.atomic
def assign_collector(
    *, loans: list[Loan], collector: User | None, user: User, note: str = ""
) -> int:
    """«Cambiar el cobrador» (G, Su), kept in the history for commissions."""
    if not authz.has_any_role(user, *ASSIGN_ROLES):
        raise CollectionsError("Solo el supervisor o el gerente asignan cobradores.", "forbidden")
    today = timezone.localdate()
    changed = 0
    for loan in Loan.objects.select_for_update().filter(pk__in=[loan.pk for loan in loans]):
        if not authz.in_scope(user, loan.branch_id):
            raise CollectionsError(f"{loan.number} es de otra sucursal.", "out_of_scope")
        if loan.status != Loan.Status.ACTIVE:
            raise CollectionsError(f"{loan.number} no está activo.", "state")
        if (
            collector is not None
            and not Membership.objects.filter(
                user=collector, role__name=authz.COBRADOR, branch_id=loan.branch_id
            ).exists()
        ):
            raise CollectionsError("Ese usuario no es cobrador de la sucursal del préstamo.")
        if loan.collector_id == (collector.pk if collector else None):
            continue
        CollectorAssignment.objects.filter(loan=loan, until__isnull=True).update(until=today)
        CollectorAssignment.objects.create(
            company_id=loan.company_id,
            loan=loan,
            collector=collector,
            since=today,
            note=note[:300],
            assigned_by=user,
        )
        loan.collector = collector
        loan.save(update_fields=["collector", "updated_at"])
        record_event(
            company_id=loan.company_id,
            type="loan.collector_changed",
            target=loan,
            actor=user,
            summary=f"Cobrador: {collector.get_full_name() or collector.email}"
            if collector
            else "Sin cobrador",
        )
        changed += 1
    return changed


# --- The day's route (F6 step 1) -------------------------------------------------------------


def _sort_key(loan: Loan, previous: dict) -> tuple:
    customer = loan.customer
    sector = customer.sector.name if customer.sector_id else "~"
    return (previous.get(loan.id, 10**6), sector, customer.display_name)


@transaction.atomic
def build_route(collector: User, day: dt.date) -> list[RouteStop]:
    """Every loan of the collector with installments overdue or due on
    ``day``, or a promise for ``day`` (phase 5); generated once per day,
    keeping yesterday's order if he set one."""
    existing = list(RouteStop.objects.filter(collector=collector, date=day).order_by("position"))
    if existing:
        return existing
    promised = dict(
        PaymentPromise.objects.filter(
            loan__collector=collector,
            status=PaymentPromise.Status.PENDING,
            promised_on=day,
        ).values_list("loan_id", "amount")
    )
    loans = list(
        Loan.objects.filter(collector=collector, status=Loan.Status.ACTIVE)
        .filter(Q(next_due_date__lte=day) | Q(id__in=promised))
        .select_related("customer__sector")
    )
    last = (
        RouteStop.objects.filter(collector=collector, date__lt=day)
        .order_by("-date")
        .values_list("date", flat=True)
        .first()
    )
    previous = (
        dict(
            RouteStop.objects.filter(collector=collector, date=last).values_list(
                "loan_id", "position"
            )
        )
        if last
        else {}
    )
    stops = []
    for loan in sorted(loans, key=lambda loan: _sort_key(loan, previous)):
        lines = portfolio.position(loan, day)
        overdue = [ln for ln in lines if ln.installment.due_date < day and ln.total > 0]
        today = [ln for ln in lines if ln.installment.due_date == day and ln.total > 0]
        if not overdue and not today and loan.id not in promised:
            continue
        reason = (
            RouteStop.Reason.PROMISE
            if loan.id in promised
            else RouteStop.Reason.OVERDUE
            if overdue
            else RouteStop.Reason.DUE_TODAY
        )
        stops.append(
            RouteStop(
                company_id=loan.company_id,
                collector=collector,
                date=day,
                loan=loan,
                position=len(stops) + 1,
                reason=reason,
                amount_due=sum((ln.total for ln in overdue + today), ZERO)
                or promised.get(loan.id, ZERO),
            )
        )
    RouteStop.objects.bulk_create(stops, ignore_conflicts=True)
    return list(RouteStop.objects.filter(collector=collector, date=day).order_by("position"))


@transaction.atomic
def reorder(collector: User, day: dt.date, loan_ids: list) -> None:
    """The collector sets his own order (F6 step 1)."""
    stops = {
        stop.loan_id: stop
        for stop in RouteStop.objects.select_for_update().filter(collector=collector, date=day)
    }
    ordered = [stops[loan_id] for loan_id in loan_ids if loan_id in stops]
    ordered += [stop for loan_id, stop in stops.items() if loan_id not in loan_ids]
    for position, stop in enumerate(ordered, start=1):
        stop.position = position
    RouteStop.objects.bulk_update(ordered, ["position"])


# --- Visits and location -----------------------------------------------------------------------


def record_visit(
    *,
    loan: Loan,
    user: User,
    result: str,
    note: str = "",
    kind: str = CollectionAction.Kind.VISIT,
    latitude: Decimal | None = None,
    longitude: Decimal | None = None,
    **extra,
) -> CollectionAction:
    """A visit without payment (F6 step 3); phase 5 adds the promise and the
    follow-up, all in ``agenda.record_action``."""
    from apps.collections.agenda import record_action

    return record_action(
        loan=loan,
        user=user,
        kind=kind,
        result=result,
        note=note,
        latitude=latitude,
        longitude=longitude,
        **extra,
    )


def record_ping(
    *, user: User, latitude: Decimal, longitude: Decimal, accuracy: int | None = None
) -> LocationPing | None:
    """Decision 031: only with the route open (and so within the working hours)."""
    route = cash.open_route_of(user)
    if route is None or route.business_date != timezone.localdate():
        return None
    if user.location_consent_at is None:
        return None
    return LocationPing.objects.create(
        company_id=route.company_id,
        user=user,
        route_session=route,
        at=timezone.now(),
        latitude=latitude,
        longitude=longitude,
        accuracy=accuracy,
    )


def purge_pings(today: dt.date) -> int:
    """The only data Cobradía deletes: not a financial record (doc 05 - 6)."""
    limit = timezone.make_aware(
        dt.datetime.combine(today - dt.timedelta(days=PING_RETENTION_DAYS), dt.time.min)
    )
    deleted, _ = LocationPing.objects.filter(Q(at__lt=limit)).delete()
    return deleted
