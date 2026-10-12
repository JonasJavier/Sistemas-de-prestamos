"""P40/P41 «Mi ruta» for the collector, P45 «Rutas» for the supervisor,
visits and location pings (decision 031)."""

import datetime as dt
from decimal import Decimal

from django.db.models import Count, Max, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.accounts.models import Membership, User
from apps.audit.models import SensitiveAccessLog
from apps.cash import services as cash
from apps.cash.models import RouteSession
from apps.collections import services
from apps.collections.models import CollectionAction, LocationPing, RouteStop
from apps.core.api.errors import fail, person
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Branch
from apps.customers.access import scope_loans
from apps.lending.models import Loan
from apps.payments.models import Payment

G, SU, OF, CO = authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL, authz.COBRADOR
ZERO = Decimal("0.00")
IsCollector = role_required(CO, read_any=False)
CanSupervise = role_required(G, SU, read_any=False)
CanVisit = role_required(G, SU, OF, CO, read_any=False)


def _stop_payload(stop: RouteStop) -> dict:
    loan = stop.loan
    customer = loan.customer
    address = ", ".join(
        part
        for part in (
            customer.address_line,
            customer.sector.name if customer.sector_id else "",
            customer.municipality.name if customer.municipality_id else "",
        )
        if part
    )
    return {
        "loan_number": loan.number,
        "customer_id": str(customer.id),
        "customer_name": customer.display_name,
        "phone": customer.phone,
        "address": address,
        "latitude": None if customer.latitude is None else str(customer.latitude),
        "longitude": None if customer.longitude is None else str(customer.longitude),
        "reason": stop.reason,
        "amount_due": str(stop.amount_due),
        "days_past_due": loan.days_past_due,
        "position": stop.position,
        "visited_at": stop.visited_at,
        "payment": None
        if stop.payment_id is None
        else {
            "number": stop.payment.number,
            "amount": str(stop.payment.amount),
            "method": stop.payment.get_method_display(),
            "at": stop.payment.paid_at,
        },
        "action": None
        if stop.action_id is None
        else {
            "result": stop.action.get_result_display(),
            "code": stop.action.result,
            "note": stop.action.note,
            "at": stop.action.created_at,
        },
    }


def _route_payload(user: User, day: dt.date) -> dict:
    route = cash.open_route_of(user) or (
        RouteSession.objects.filter(collector=user, business_date=day)
        .order_by("-opened_at")
        .first()
    )
    stops = services.build_route(user, day)
    stops = list(
        RouteStop.objects.filter(pk__in=[s.pk for s in stops])
        .select_related(
            "loan__customer__sector", "loan__customer__municipality", "payment", "action"
        )
        .order_by("position")
    )
    payments = (
        Payment.objects.filter(route_session=route, status=Payment.Status.POSTED)
        if route
        else Payment.objects.none()
    )
    collected = payments.aggregate(total=Sum("amount"))["total"] or ZERO
    return {
        "date": day,
        "consent": user.location_consent_at is not None,
        "consent_text": cash.LOCATION_CONSENT_TEXT,
        "route": None
        if route is None
        else {
            "id": str(route.id),
            "status": route.status,
            "business_date": route.business_date,
            "cash": str(cash.route_cash(route) if route.status == "open" else ZERO),
            "collected": str(collected),
            "payments": payments.count(),
            "stale": route.status == "open" and route.business_date < day,
        },
        "progress": {
            "stops": len(stops),
            "visited": sum(1 for stop in stops if stop.visited_at),
            "paid": sum(1 for stop in stops if stop.payment_id),
        },
        "stops": [_stop_payload(stop) for stop in stops],
        "branches": [
            {"id": str(b.id), "name": b.name}
            for b in Branch.objects.filter(memberships__user=user, is_active=True).distinct()
        ],
    }


class MyRouteView(APIView):
    """P40: today's stops, progress and the cash in hand."""

    permission_classes = [IsCollector]

    def get(self, request: Request) -> Response:
        return Response(_route_payload(request.user, timezone.localdate()))


class ConsentView(APIView):
    permission_classes = [IsCollector]

    def post(self, request: Request) -> Response:
        user = request.user
        if user.location_consent_at is None:
            user.location_consent_at = timezone.now()
            user.location_consent_text = cash.LOCATION_CONSENT_TEXT
            user.save(update_fields=["location_consent_at", "location_consent_text"])
        return Response(_route_payload(user, timezone.localdate()))


class OpenRouteView(APIView):
    permission_classes = [IsCollector, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        branches = Branch.objects.filter(memberships__user=request.user, is_active=True).distinct()
        branch = (
            branches.filter(pk=request.data.get("branch")).first()
            if request.data.get("branch")
            else branches.first()
        )
        if branch is None:
            return fail(cash.CashError("No tienes una sucursal asignada.", "branch"))
        try:
            cash.open_route(user=request.user, branch=branch)
        except cash.CashError as exc:
            return fail(exc)
        return Response(_route_payload(request.user, timezone.localdate()), status=201)


class ReorderView(APIView):
    permission_classes = [IsCollector]

    def post(self, request: Request) -> Response:
        numbers = request.data.get("loans", [])
        ids = dict(Loan.objects.filter(number__in=numbers).values_list("number", "id"))
        services.reorder(request.user, timezone.localdate(), [ids[n] for n in numbers if n in ids])
        return Response(_route_payload(request.user, timezone.localdate()))


class PingSerializer(serializers.Serializer):
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    accuracy = serializers.IntegerField(min_value=0, required=False, allow_null=True)


class PingView(APIView):
    """Every few minutes while «Mi ruta» is on screen (doc 05 - 6)."""

    permission_classes = [IsCollector]

    def post(self, request: Request) -> Response:
        serializer = PingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        ping = services.record_ping(user=request.user, **serializer.validated_data)
        return Response({"recorded": ping is not None})


class VisitSerializer(serializers.Serializer):
    result = serializers.ChoiceField(choices=CollectionAction.Result.choices)
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    kind = serializers.ChoiceField(
        choices=CollectionAction.Kind.choices, default=CollectionAction.Kind.VISIT
    )
    latitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    longitude = serializers.DecimalField(
        max_digits=9, decimal_places=6, required=False, allow_null=True
    )
    # Phase 5 (P42): the promise of «Prometió pagar» and the next follow-up.
    promise_on = serializers.DateField(required=False, allow_null=True)
    promise_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    follow_up_on = serializers.DateField(required=False, allow_null=True)


class VisitView(APIView):
    """A visit, call or message without payment (F6 step 3, P42)."""

    permission_classes = [CanVisit, CompanyNotSuspendedOrReadOnly]

    def get(self, request: Request, number: str) -> Response:
        loan = get_object_or_404(scope_loans(Loan.objects.all(), request.user), number=number)
        actions = loan.actions.select_related("user").order_by("-created_at")[:50]
        return Response(
            [
                {
                    "id": str(a.id),
                    "kind": a.get_kind_display(),
                    "result": a.get_result_display(),
                    "note": a.note,
                    "user_name": person(a.user),
                    "created_at": a.created_at,
                }
                for a in actions
            ]
        )

    def post(self, request: Request, number: str) -> Response:
        loan = get_object_or_404(scope_loans(Loan.objects.all(), request.user), number=number)
        serializer = VisitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            action = services.record_visit(
                loan=loan, user=request.user, **serializer.validated_data
            )
        except services.CollectionsError as exc:
            return fail(exc)
        return Response({"id": str(action.id)}, status=status.HTTP_201_CREATED)


# --- P45: routes of the branch -----------------------------------------------------------------


def _collectors(user: User) -> list[User]:
    scope = authz.branch_scope(user)
    memberships = Membership.objects.filter(role__name=CO, user__is_active=True)
    if scope is not None:
        memberships = memberships.filter(branch_id__in=scope)
    return list({m.user_id: m.user for m in memberships.select_related("user")}.values())


class RoutesView(APIView):
    """Progress of every collector today, portfolio sizes and settlements."""

    permission_classes = [CanSupervise]

    def get(self, request: Request) -> Response:
        day = timezone.localdate()
        if request.query_params.get("fecha"):
            day = dt.date.fromisoformat(request.query_params["fecha"])
        rows = []
        for collector in _collectors(request.user):
            route = (
                RouteSession.objects.filter(collector=collector, business_date=day)
                .order_by("-opened_at")
                .first()
            )
            stops = RouteStop.objects.filter(collector=collector, date=day).aggregate(
                total=Count("id"),
                visited=Count("id", filter=Q(visited_at__isnull=False)),
                paid=Count("id", filter=Q(payment__isnull=False)),
                expected=Sum("amount_due"),
            )
            stops["expected"] = str(stops["expected"] or ZERO)
            payments = (
                Payment.objects.filter(route_session=route, status=Payment.Status.POSTED)
                if route
                else Payment.objects.none()
            )
            last_ping = (
                LocationPing.objects.filter(user=collector, route_session=route).aggregate(
                    at=Max("at")
                )["at"]
                if route
                else None
            )
            portfolio = Loan.objects.filter(collector=collector, status=Loan.Status.ACTIVE)
            rows.append(
                {
                    "id": str(collector.id),
                    "name": person(collector),
                    "route": None
                    if route is None
                    else {
                        "id": str(route.id),
                        "status": route.status,
                        "cash": str(cash.route_cash(route)) if route.status == "open" else "0.00",
                        "delivered": None if route.delivered is None else str(route.delivered),
                        "difference": None if route.difference is None else str(route.difference),
                    },
                    "stops": stops,
                    "collected": str(payments.aggregate(t=Sum("amount"))["t"] or ZERO),
                    "off_route": payments.filter(off_route=True).count(),
                    "last_ping": last_ping,
                    "loans": portfolio.count(),
                    "loans_in_arrears": portfolio.filter(days_past_due__gt=0).count(),
                }
            )
        unassigned = scope_loans(
            Loan.objects.filter(status=Loan.Status.ACTIVE, collector__isnull=True), request.user
        )
        return Response({"date": day, "collectors": rows, "unassigned_loans": unassigned.count()})


class RouteMapView(APIView):
    """The location map of one collector on a day: supervisors and managers
    only, and every look is logged (decision 031, doc 06 - 9)."""

    permission_classes = [CanSupervise]

    def get(self, request: Request, collector_id) -> Response:
        collector = get_object_or_404(User, pk=collector_id, company_id=request.user.company_id)
        if not any(c.pk == collector.pk for c in _collectors(request.user)):
            return Response(status=404)
        day = timezone.localdate()
        if request.query_params.get("fecha"):
            day = dt.date.fromisoformat(request.query_params["fecha"])
        routes = RouteSession.objects.filter(collector=collector, business_date=day)
        pings = LocationPing.objects.filter(route_session__in=routes).order_by("at")
        payments = Payment.objects.filter(route_session__in=routes, latitude__isnull=False)
        actions = CollectionAction.objects.filter(
            user=collector, created_at__date=day, latitude__isnull=False
        )
        SensitiveAccessLog.objects.create(
            company_id=collector.company_id,
            user=request.user,
            action=SensitiveAccessLog.Action.LOCATION_MAP,
            target_type="user",
            target_id=collector.id,
            detail=f"Mapa de {person(collector)} del {day:%d/%m/%Y}",
        )
        return Response(
            {
                "collector_name": person(collector),
                "date": day,
                "pings": [
                    {"at": p.at, "lat": str(p.latitude), "lng": str(p.longitude)} for p in pings
                ],
                "payments": [
                    {
                        "number": p.number,
                        "amount": str(p.amount),
                        "at": p.paid_at,
                        "lat": str(p.latitude),
                        "lng": str(p.longitude),
                    }
                    for p in payments
                ],
                "visits": [
                    {
                        "result": a.get_result_display(),
                        "at": a.created_at,
                        "lat": str(a.latitude),
                        "lng": str(a.longitude),
                    }
                    for a in actions
                ],
            }
        )


class RouteStopsView(APIView):
    """A collector's stops of a day as the office follows them (decision 115):
    the order, the result of each one and the cash still to hand over. It only
    reads: the stops are generated when the collector opens «Mi ruta»."""

    permission_classes = [CanSupervise]

    def get(self, request: Request, collector_id) -> Response:
        collector = get_object_or_404(User, pk=collector_id, company_id=request.user.company_id)
        if not any(c.pk == collector.pk for c in _collectors(request.user)):
            return Response(status=404)
        day = timezone.localdate()
        if request.query_params.get("fecha"):
            day = dt.date.fromisoformat(request.query_params["fecha"])
        stops = list(
            RouteStop.objects.filter(collector=collector, date=day)
            .select_related(
                "loan__customer__sector", "loan__customer__municipality", "payment", "action"
            )
            .order_by("position")
        )
        route = (
            RouteSession.objects.filter(collector=collector, business_date=day)
            .order_by("-opened_at")
            .first()
        )
        payments = (
            Payment.objects.filter(route_session=route, status=Payment.Status.POSTED)
            if route
            else Payment.objects.none()
        )
        by_method = dict(payments.values_list("method").annotate(t=Sum("amount")).order_by())
        return Response(
            {
                "collector_name": person(collector),
                "date": day,
                "route": None
                if route is None
                else {
                    "status": route.status,
                    "cash": str(cash.route_cash(route) if route.status == "open" else ZERO),
                    "other_methods": str(
                        sum((v for k, v in by_method.items() if k != Payment.Method.CASH), ZERO)
                    ),
                },
                "collected": str(sum(by_method.values(), ZERO)),
                "expected": str(sum((stop.amount_due for stop in stops), ZERO)),
                "stops": [_stop_payload(stop) for stop in stops],
            }
        )


class AssignSerializer(serializers.Serializer):
    loans = serializers.ListField(child=serializers.CharField(max_length=30), min_length=1)
    collector = serializers.UUIDField(required=False, allow_null=True)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AssignView(APIView):
    """«Cambiar el cobrador» of one or many loans (G, Su)."""

    permission_classes = [CanSupervise, CompanyNotSuspendedOrReadOnly]

    def get(self, request: Request) -> Response:
        return Response([{"id": str(c.id), "name": person(c)} for c in _collectors(request.user)])

    def post(self, request: Request) -> Response:
        serializer = AssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        loans = list(scope_loans(Loan.objects.all(), request.user).filter(number__in=data["loans"]))
        if len(loans) != len(set(data["loans"])):
            return fail(
                services.CollectionsError("Algún préstamo no existe o es de otra sucursal.")
            )
        collector = None
        if data.get("collector"):
            collector = get_object_or_404(
                User, pk=data["collector"], company_id=request.user.company_id
            )
        try:
            changed = services.assign_collector(
                loans=loans, collector=collector, user=request.user, note=data["note"]
            )
        except services.CollectionsError as exc:
            return fail(exc)
        return Response({"changed": changed})


class CustomerLocationView(APIView):
    """The collector pins where a customer lives, from the visit (F6)."""

    permission_classes = [CanVisit, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request, number: str) -> Response:
        loan = get_object_or_404(scope_loans(Loan.objects.all(), request.user), number=number)
        serializer = PingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = loan.customer
        customer.latitude = serializer.validated_data["latitude"]
        customer.longitude = serializer.validated_data["longitude"]
        customer.save(update_fields=["latitude", "longitude", "updated_at"])
        return Response({"latitude": str(customer.latitude), "longitude": str(customer.longitude)})
