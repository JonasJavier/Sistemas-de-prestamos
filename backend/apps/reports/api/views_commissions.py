"""P63 «Comisiones» (decision 089): rules (the manager), the month's
calculation and its approval (manager or accounting)."""

from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.accounts.models import User
from apps.core.api.errors import person
from apps.reports import commissions
from apps.reports.models import CommissionRule, CommissionRun

CanSeeCommissions = role_required(
    authz.GERENTE, authz.CONTABILIDAD, read_any=False, read_roles=(authz.AUDITORIA,)
)


def _fail(exc: commissions.CommissionError) -> Response:
    code = status.HTTP_403_FORBIDDEN if exc.code == "forbidden" else status.HTTP_400_BAD_REQUEST
    return Response({"detail": exc.message, "code": exc.code}, status=code)


def _rule(rule: CommissionRule) -> dict:
    return {
        "id": str(rule.id),
        "name": rule.name,
        "role": rule.role,
        "user": str(rule.user_id) if rule.user_id else None,
        "user_name": person(rule.user) if rule.user_id else "",
        "base": rule.base,
        "base_label": rule.get_base_display(),
        "rate": str(rule.rate),
        "goal": str(rule.goal),
        "is_active": rule.is_active,
    }


def _run(run: CommissionRun | None) -> dict | None:
    if run is None:
        return None
    lines = run.lines.select_related("user", "rule", "payable").order_by(
        "-amount", "user__first_name"
    )
    return {
        "id": str(run.id),
        "year": run.year,
        "month": run.month,
        "status": run.status,
        "status_label": run.get_status_display(),
        "total": str(run.total),
        "computed_at": run.computed_at,
        "computed_by": person(run.computed_by),
        "approved_at": run.approved_at,
        "approved_by": person(run.approved_by) if run.approved_by_id else "",
        "lines": [
            {
                "id": str(line.id),
                "user": person(line.user),
                "role": line.rule.role,
                "rule": line.rule.name,
                "base_label": line.rule.get_base_display(),
                "base_amount": str(line.base_amount),
                "rate": str(line.rate),
                "goal": str(line.goal),
                "reached_goal": line.detail.get("reached_goal", True),
                "amount": str(line.amount),
                "payable": None
                if line.payable_id is None
                else {"id": str(line.payable_id), "status": line.payable.get_status_display()},
            }
            for line in lines
        ],
    }


def _decimal(data: dict, key: str, default: str | None = None) -> Decimal:
    raw = data.get(key, default)
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError) as exc:
        raise ValidationError({key: "Número inválido."}) from exc


def _fields(data: dict, partial: bool) -> dict:
    fields = {}
    for key in ("name", "role", "base"):
        if key in data or not partial:
            fields[key] = str(data.get(key, "")).strip()
    if "rate" in data or not partial:
        fields["rate"] = _decimal(data, "rate")
    if "goal" in data or not partial:
        fields["goal"] = _decimal(data, "goal", "0")
    if "is_active" in data:
        fields["is_active"] = bool(data["is_active"])
    if "user" in data or not partial:
        user_id = data.get("user") or None
        fields["user"] = (
            get_object_or_404(User, pk=user_id, company_id=data["_company"]) if user_id else None
        )
    return fields


class RulesView(APIView):
    permission_classes = [CanSeeCommissions]

    def get(self, request: Request) -> Response:
        rules = CommissionRule.objects.select_related("user").order_by("role", "user", "name")
        return Response([_rule(r) for r in rules])

    def post(self, request: Request) -> Response:
        data = {**request.data, "_company": request.user.company_id}
        try:
            rule = commissions.save_rule(actor=request.user, **_fields(data, partial=False))
        except commissions.CommissionError as exc:
            return _fail(exc)
        return Response(_rule(rule), status=status.HTTP_201_CREATED)


class RuleDetailView(APIView):
    permission_classes = [CanSeeCommissions]

    def patch(self, request: Request, pk) -> Response:
        rule = get_object_or_404(CommissionRule, pk=pk)
        data = {**request.data, "_company": request.user.company_id}
        try:
            rule = commissions.save_rule(
                actor=request.user, rule=rule, **_fields(data, partial=True)
            )
        except commissions.CommissionError as exc:
            return _fail(exc)
        return Response(_rule(rule))


def _month(request: Request) -> tuple[int, int]:
    today = timezone.localdate()
    source = request.data if request.method == "POST" else request.query_params
    try:
        year = int(source.get("anio", today.year))
        month = int(source.get("mes", today.month))
    except (TypeError, ValueError) as exc:
        raise ValidationError({"mes": "Mes inválido."}) from exc
    if not (2000 <= year <= 2100 and 1 <= month <= 12):
        raise ValidationError({"mes": "Mes inválido."})
    return year, month


class RunView(APIView):
    """The month's commissions (GET) and their calculation (POST)."""

    permission_classes = [CanSeeCommissions]

    def get(self, request: Request) -> Response:
        year, month = _month(request)
        run = CommissionRun.objects.filter(year=year, month=month).first()
        return Response({"year": year, "month": month, "run": _run(run)})

    def post(self, request: Request) -> Response:
        year, month = _month(request)
        try:
            run = commissions.calculate(year=year, month=month, user=request.user)
        except commissions.CommissionError as exc:
            return _fail(exc)
        return Response({"year": year, "month": month, "run": _run(run)})


class ApproveView(APIView):
    permission_classes = [CanSeeCommissions]

    def post(self, request: Request, pk) -> Response:
        run = get_object_or_404(CommissionRun, pk=pk)
        try:
            run = commissions.approve(run=run, user=request.user)
        except commissions.CommissionError as exc:
            return _fail(exc)
        return Response({"year": run.year, "month": run.month, "run": _run(run)})
