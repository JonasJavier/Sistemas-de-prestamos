"""P50-P52 and the settlement of F6: my cash, the branch's cash sessions,
and the collectors' cash to receive."""

import datetime as dt
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.audit.models import SensitiveAccessLog
from apps.cash import services as cash
from apps.cash.models import DENOMINATIONS, CashSession, RouteSession
from apps.core.api.errors import fail, person
from apps.core.api.pagination import Pagination
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Branch, Reason
from apps.documents.models import GeneratedDocument
from apps.ledger.models import FinancialAccount, JournalLine
from apps.payments.models import Payment

G, SU, CA, CO, CT, AU = (
    authz.GERENTE,
    authz.SUPERVISOR,
    authz.CAJERO,
    authz.COBRADOR,
    authz.CONTABILIDAD,
    authz.AUDITORIA,
)
ZERO = Decimal("0.00")
CanUseCash = role_required(SU, CA, read_any=False)
CanSeeSessions = role_required(G, SU, read_any=False, read_roles=(CT, AU))

SOURCE_LABELS = {
    "payments.payment": "Cobro",
    "lending.disbursement": "Desembolso",
    "cash.settlement": "Rendición",
    "cash.funding": "Fondo",
    "cash.transfer": "Traslado",
    "cash.difference": "Diferencia",
}


def _general_accounts(branch_id) -> list[dict]:
    return [
        {"id": str(a.id), "name": str(a), "kind": a.kind}
        for a in FinancialAccount.objects.filter(
            is_active=True, kind__in=[FinancialAccount.Kind.CASH, FinancialAccount.Kind.BANK]
        ).filter(Q(branch__isnull=True) | Q(branch_id=branch_id))
    ]


def session_payload(session: CashSession, *, detail: bool = True) -> dict:
    payments = Payment.objects.filter(cash_session=session)
    by_method = {
        row["method"]: {"count": row["count"], "amount": str(row["amount"])}
        for row in payments.filter(status=Payment.Status.POSTED)
        .values("method")
        .annotate(count=Count("id"), amount=Sum("amount"))
    }
    data = {
        "id": str(session.id),
        "number": session.number,
        "status": session.status,
        "status_label": session.get_status_display(),
        "branch": str(session.branch_id),
        "branch_name": session.branch.name,
        "cashier_name": person(session.cashier),
        "business_date": session.business_date,
        "opened_at": session.opened_at,
        "carried_over": str(session.carried_over),
        "funded_amount": str(session.funded_amount),
        "expected": str(
            cash.expected_cash(session) if session.status == "open" else session.expected
        ),
        "counted": None if session.counted is None else str(session.counted),
        "difference": None if session.difference is None else str(session.difference),
        "difference_reason": session.difference_reason.text if session.difference_reason else None,
        "difference_note": session.difference_note,
        "returned_amount": str(session.returned_amount),
        "closed_at": session.closed_at,
        "approved_by_name": person(session.approved_by),
        "approved_at": session.approved_at,
        "by_method": by_method,
    }
    if detail:
        lines = (
            JournalLine.objects.filter(cash_session=session, financial_account_id=session.drawer_id)
            .select_related("entry")
            .order_by("entry__created_at")
        )
        data["movements"] = [
            {
                "at": line.entry.created_at,
                "kind": SOURCE_LABELS.get(line.entry.source_type, line.entry.source_type)
                + (" (reverso)" if line.entry.reversal_of_id else ""),
                "description": line.entry.description,
                "in": str(line.debit) if line.debit else None,
                "out": str(line.credit) if line.credit else None,
            }
            for line in lines
        ]
        data["counts"] = [
            {"denomination": str(c.denomination), "quantity": c.quantity}
            for c in session.counts.order_by("-denomination")
        ]
        data["has_pdf"] = GeneratedDocument.objects.filter(
            target_type="cash.cashsession", target_id=session.id
        ).exists()
    return data


class MyCashView(APIView):
    """P50: my open drawer, or what I need to open one."""

    permission_classes = [CanUseCash]

    def get(self, request: Request) -> Response:
        user = request.user
        session = cash.open_session_of(user)
        last = (
            CashSession.objects.filter(cashier=user).exclude(status="open").order_by("-opened_at")
        ).first()
        branches = Branch.objects.filter(memberships__user=user, is_active=True).distinct()
        pending_routes = RouteSession.objects.filter(status=RouteSession.Status.OPEN).filter(
            branch__in=branches
        )
        return Response(
            {
                "session": session_payload(session) if session else None,
                "last": session_payload(last, detail=False) if last else None,
                "branches": [{"id": str(b.id), "name": b.name} for b in branches],
                "accounts": _general_accounts(session.branch_id if session else None)
                if session
                else [
                    acc
                    for branch in branches
                    for acc in _general_accounts(branch.id)
                    if acc["kind"] == FinancialAccount.Kind.CASH
                ],
                "denominations": DENOMINATIONS,
                "today": timezone.localdate(),
                "routes_to_settle": [
                    {
                        "id": str(route.id),
                        "collector_name": person(route.collector),
                        "business_date": route.business_date,
                        "expected": str(cash.route_cash(route)),
                        "payments": route.payments.filter(status=Payment.Status.POSTED).count(),
                    }
                    for route in pending_routes.select_related("collector")
                ],
            }
        )


class OpenSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.filter(is_active=True))
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=ZERO)
    fund_from = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True), required=False, allow_null=True
    )


class OpenView(APIView):
    permission_classes = [CanUseCash, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        serializer = OpenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            session = cash.open_session(
                user=request.user,
                branch=data["branch"],
                amount=data["amount"],
                fund_from=data.get("fund_from"),
            )
        except cash.CashError as exc:
            return fail(exc)
        return Response(session_payload(session), status=status.HTTP_201_CREATED)


class MoveSerializer(serializers.Serializer):
    account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True)
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    incoming = serializers.BooleanField()
    note = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class MoveView(APIView):
    permission_classes = [CanUseCash, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        session = cash.open_session_of(request.user)
        if session is None:
            return fail(cash.CashError("No tienes una caja abierta.", "no_session"))
        serializer = MoveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = cash.move(session=session, user=request.user, **serializer.validated_data)
        except cash.CashError as exc:
            return fail(exc)
        return Response(session_payload(session))


class CloseSerializer(serializers.Serializer):
    counts = serializers.DictField(child=serializers.IntegerField(min_value=0))
    reason = serializers.PrimaryKeyRelatedField(
        queryset=Reason.objects.filter(kind=Reason.Kind.CASH_DIFFERENCE),
        required=False,
        allow_null=True,
    )
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")
    return_to = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True), required=False, allow_null=True
    )
    return_amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, min_value=ZERO, required=False, default=ZERO
    )


class CloseView(APIView):
    permission_classes = [CanUseCash, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        session = cash.open_session_of(request.user)
        if session is None:
            return fail(cash.CashError("No tienes una caja abierta.", "no_session"))
        serializer = CloseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            session = cash.close_session(
                session=session, user=request.user, **serializer.validated_data
            )
        except cash.CashError as exc:
            return fail(exc)
        return Response(session_payload(session))


class SessionsView(APIView):
    """P52: the branch's sessions, closings to approve first."""

    permission_classes = [CanSeeSessions]

    def get(self, request: Request) -> Response:
        queryset = CashSession.objects.select_related(
            "branch", "cashier", "approved_by", "difference_reason"
        )
        scope = authz.branch_scope(request.user)
        if scope is not None:
            queryset = queryset.filter(branch_id__in=scope)
        params = request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("date"):
            queryset = queryset.filter(business_date=params["date"])
        # Paged like every list (25 rows): the history no longer stops at the
        # last 100 sessions.
        paginator = Pagination()
        sessions = paginator.paginate_queryset(queryset.order_by("-opened_at"), request, view=self)
        return Response(
            {
                "count": paginator.page.paginator.count,
                "results": [session_payload(s, detail=False) for s in sessions],
                "to_approve": queryset.filter(status=CashSession.Status.CLOSED).count(),
            }
        )


class SessionDetailView(APIView):
    permission_classes = [CanSeeSessions, CompanyNotSuspendedOrReadOnly]

    def _get(self, request: Request, pk) -> CashSession:
        session = get_object_or_404(
            CashSession.objects.select_related("branch", "cashier", "drawer"), pk=pk
        )
        if not authz.in_scope(request.user, session.branch_id):
            raise Http404
        return session

    def get(self, request: Request, pk) -> Response:
        session = self._get(request, pk)
        data = session_payload(session)
        data["can_approve"] = (
            session.status == CashSession.Status.CLOSED
            and session.cashier_id != request.user.pk
            and authz.has_any_role(request.user, G, SU)
        )
        return Response(data)

    def post(self, request: Request, pk) -> Response:
        session = self._get(request, pk)
        try:
            session = cash.approve_session(
                session=session, user=request.user, note=request.data.get("note", "")
            )
        except cash.CashError as exc:
            return fail(exc)
        return Response(session_payload(session))


class SessionPdfView(APIView):
    permission_classes = [CanSeeSessions]

    def get(self, request: Request, pk) -> Response:
        session = get_object_or_404(CashSession, pk=pk)
        if not authz.in_scope(request.user, session.branch_id):
            return Response(status=404)
        document = GeneratedDocument.objects.filter(
            target_type="cash.cashsession", target_id=session.pk
        ).first()
        if document is None:
            if session.status != CashSession.Status.APPROVED:
                return fail(cash.CashError("El PDF se emite al aprobar el cierre.", "state"))
            from apps.documents.services import issue_cash_close

            document = issue_cash_close(session, issued_by=request.user)
        SensitiveAccessLog.objects.create(
            company_id=session.company_id,
            user=request.user,
            action=SensitiveAccessLog.Action.DOCUMENT,
            target_type="generated_document",
            target_id=document.id,
            detail=f"Cierre de caja {session.number}",
        )
        return FileResponse(
            document.file.open("rb"),
            content_type="application/pdf",
            filename=f"{session.number}.pdf",
        )


class SettleSerializer(serializers.Serializer):
    delivered = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=ZERO)
    reason = serializers.PrimaryKeyRelatedField(
        queryset=Reason.objects.filter(kind=Reason.Kind.CASH_DIFFERENCE),
        required=False,
        allow_null=True,
    )
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True, default="")


class SettleView(APIView):
    """F6 step 5: receive a collector's cash into my drawer."""

    permission_classes = [CanUseCash, CompanyNotSuspendedOrReadOnly]

    def get(self, request: Request, pk) -> Response:
        route = get_object_or_404(RouteSession.objects.select_related("collector"), pk=pk)
        payments = route.payments.select_related("loan", "customer").order_by("paid_at")
        return Response(
            {
                "id": str(route.id),
                "collector_name": person(route.collector),
                "business_date": route.business_date,
                "status": route.status,
                "expected": str(
                    cash.route_cash(route) if route.status == "open" else route.expected
                ),
                "handovers": [
                    {
                        "at": h.created_at,
                        "amount": str(h.amount),
                        "received_by_name": person(h.received_by),
                    }
                    for h in route.handovers.select_related("received_by").order_by("created_at")
                ],
                "payments": [
                    {
                        "number": p.number,
                        "loan_number": p.loan.number,
                        "customer_name": p.customer.display_name,
                        "method": p.get_method_display(),
                        "amount": str(p.amount),
                        "status": p.status,
                    }
                    for p in payments
                ],
            }
        )

    def post(self, request: Request, pk) -> Response:
        route = get_object_or_404(RouteSession, pk=pk)
        serializer = SettleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            route = cash.settle_route(route=route, user=request.user, **serializer.validated_data)
        except cash.CashError as exc:
            return fail(exc)
        return Response({"status": route.status, "difference": str(route.difference)})


class HandoverSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=ZERO)


class HandoverView(APIView):
    """Decision 075: part of a collector's cash, received before the day ends."""

    permission_classes = [CanUseCash, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request, pk) -> Response:
        route = get_object_or_404(RouteSession, pk=pk)
        serializer = HandoverSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            handover = cash.receive_handover(
                route=route, user=request.user, amount=serializer.validated_data["amount"]
            )
        except cash.CashError as exc:
            return fail(exc)
        return Response(
            {"amount": str(handover.amount), "carried": str(cash.route_cash(route))},
            status=201,
        )


class RoutePdfView(APIView):
    permission_classes = [role_required(G, SU, CA, read_any=False, read_roles=(CT, AU))]

    def get(self, request: Request, pk) -> Response:
        route = get_object_or_404(RouteSession, pk=pk)
        if route.status != RouteSession.Status.SETTLED:
            return fail(cash.CashError("La rendición aún no se ha recibido.", "state"))
        document = GeneratedDocument.objects.filter(
            target_type="cash.routesession", target_id=route.pk
        ).first()
        if document is None:
            from apps.documents.services import issue_route_settlement

            document = issue_route_settlement(route, issued_by=request.user)
        return FileResponse(
            document.file.open("rb"),
            content_type="application/pdf",
            filename=f"{document.folio}.pdf",
        )


# --- Cash differences (decision 075) -------------------------------------------------------------


def _difference_payload(difference, user) -> dict:
    from apps.cash import differences

    source = difference.cash_session or difference.route_session
    return {
        "id": str(difference.id),
        "kind": difference.kind,
        "kind_label": difference.get_kind_display(),
        "amount": str(difference.amount),
        "resolved": str(difference.resolved),
        "outstanding": str(difference.outstanding),
        "status": difference.status,
        "status_label": difference.get_status_display(),
        "person_name": person(difference.person),
        "is_mine": difference.person_id == user.pk,
        "branch_name": difference.branch.name,
        "occurred_on": difference.occurred_on,
        "source": (
            f"Caja {source.number}"
            if difference.cash_session_id
            else f"Rendición del {difference.route_session.business_date:%d/%m/%Y}"
        )
        if source
        else "",
        "claim_until": difference.occurred_on + dt.timedelta(days=differences.CLAIM_DAYS)
        if difference.kind == "overage"
        else None,
        "actions": [
            {
                "action": a.action,
                "label": a.get_action_display(),
                "amount": str(a.amount),
                "user_name": person(a.user) if a.user_id else "Automático",
                "note": a.note,
                "at": a.created_at,
            }
            for a in difference.actions.select_related("user").order_by("created_at")
        ],
    }


class DifferencesView(APIView):
    """Shortages and overages to resolve: the branch's for G/Su, mine otherwise."""

    permission_classes = [role_required(G, SU, CA, CO, read_any=False, read_roles=(CT, AU))]

    def get(self, request: Request) -> Response:
        from apps.cash.models import CashDifference

        rows = CashDifference.objects.select_related(
            "person", "branch", "cash_session", "route_session"
        ).order_by("status", "-occurred_on")
        user = request.user
        if authz.has_any_role(user, G, CT, AU):
            pass
        elif authz.has_any_role(user, SU):
            scope = authz.branch_scope(user)
            if scope is not None:
                rows = rows.filter(branch_id__in=scope)
        else:
            rows = rows.filter(person=user)
        if request.query_params.get("estado") == "todas":
            rows = rows[:200]
        else:
            rows = rows.filter(status=CashDifference.Status.OPEN)
        return Response([_difference_payload(d, user) for d in rows])


class DifferenceActionSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, allow_null=True
    )
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class DifferenceActionView(APIView):
    permission_classes = [role_required(G, SU, CA, read_any=False), CompanyNotSuspendedOrReadOnly]
    verb = ""

    def post(self, request: Request, pk) -> Response:
        from apps.cash import differences
        from apps.cash.models import CashDifference

        difference = get_object_or_404(CashDifference, pk=pk)
        serializer = DifferenceActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            if self.verb == "reponer":
                differences.repay(
                    difference=difference,
                    user=request.user,
                    amount=data.get("amount"),
                    note=data["note"],
                )
            elif self.verb == "perdida":
                differences.take_loss(difference=difference, user=request.user, note=data["note"])
            elif self.verb == "aplicar":
                differences.apply_overage(
                    difference=difference,
                    user=request.user,
                    amount=data.get("amount"),
                    note=data["note"],
                )
            elif self.verb == "ingreso":
                differences.overage_to_income(
                    difference=difference, user=request.user, note=data["note"]
                )
        except cash.CashError as exc:
            return fail(exc)
        difference.refresh_from_db()
        return Response(_difference_payload(difference, request.user))
