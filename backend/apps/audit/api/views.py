"""P79 «Alertas antifraude» (decision 090): the alerts to review and the
rules with their thresholds. The manager edits and reviews; audit reads."""

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.audit import fraud
from apps.audit.models import FraudAlert, FraudKind, FraudRule
from apps.core.api.errors import person
from apps.core.api.pagination import Pagination

CanWatchFraud = role_required(authz.GERENTE, read_any=False, read_roles=(authz.AUDITORIA,))


def _fail(exc: fraud.FraudError) -> Response:
    code = status.HTTP_403_FORBIDDEN if exc.code == "forbidden" else status.HTTP_400_BAD_REQUEST
    return Response({"detail": exc.message, "code": exc.code}, status=code)


def _alert(alert: FraudAlert) -> dict:
    return {
        "id": str(alert.id),
        "kind": alert.kind,
        "kind_label": FraudKind(alert.kind).label,
        "subject": None
        if alert.subject_id is None
        else {"id": str(alert.subject_id), "name": person(alert.subject)},
        "count": alert.count,
        "threshold": alert.threshold,
        "window_days": alert.window_days,
        "detail": alert.detail,
        "status": alert.status,
        "status_label": alert.get_status_display(),
        "created_at": alert.created_at,
        "reviewed_by": person(alert.reviewed_by) if alert.reviewed_by_id else "",
        "reviewed_at": alert.reviewed_at,
        "review_note": alert.review_note,
    }


def _rule(rule: FraudRule) -> dict:
    return {
        "id": str(rule.id),
        "kind": rule.kind,
        "label": FraudKind(rule.kind).label,
        "threshold": rule.threshold,
        "window_days": rule.window_days,
        "is_active": rule.is_active,
    }


class AlertsView(APIView):
    permission_classes = [CanWatchFraud]

    def get(self, request: Request) -> Response:
        state = request.query_params.get("estado", "open")
        if state not in FraudAlert.Status.values:
            raise ValidationError({"estado": "Estado inválido."})
        alerts = (
            FraudAlert.objects.filter(status=state)
            .select_related("subject", "reviewed_by")
            .order_by("-created_at")
        )
        paginator = Pagination()
        page = paginator.paginate_queryset(alerts, request, view=self)
        response = paginator.get_paginated_response([_alert(a) for a in page])
        response.data["open"] = fraud.open_count()
        return response


class ReviewView(APIView):
    permission_classes = [CanWatchFraud]

    def post(self, request: Request, pk) -> Response:
        alert = get_object_or_404(FraudAlert, pk=pk)
        try:
            alert = fraud.mark_reviewed(
                alert=alert, user=request.user, note=str(request.data.get("note", ""))
            )
        except fraud.FraudError as exc:
            return _fail(exc)
        return Response(_alert(alert))


class RulesView(APIView):
    permission_classes = [CanWatchFraud]

    def get(self, request: Request) -> Response:
        return Response([_rule(r) for r in fraud.rules(request.user.company_id)])


class RuleDetailView(APIView):
    permission_classes = [CanWatchFraud]

    def patch(self, request: Request, pk) -> Response:
        rule = get_object_or_404(FraudRule, pk=pk)
        fields = {}
        try:
            for key in ("threshold", "window_days"):
                if key in request.data:
                    fields[key] = int(request.data[key])
        except (TypeError, ValueError) as exc:
            raise ValidationError({"threshold": "Número inválido."}) from exc
        if "is_active" in request.data:
            fields["is_active"] = bool(request.data["is_active"])
        try:
            rule = fraud.update_rule(user=request.user, rule=rule, **fields)
        except fraud.FraudError as exc:
            return _fail(exc)
        return Response(_rule(rule))
