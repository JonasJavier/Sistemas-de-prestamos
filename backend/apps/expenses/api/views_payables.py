"""P55 «Cuentas por pagar» (F15, decision 082)."""

import datetime as dt
from decimal import Decimal

from django.db.models import F, Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.errors import fail, person
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Branch
from apps.expenses import payables
from apps.expenses.models import Expense, ExpenseCategory, Payable, PayableSeries
from apps.expenses.services import ExpenseError
from apps.ledger.models import FinancialAccount

CanUsePayables = role_required(
    authz.GERENTE, authz.CONTABILIDAD, read_any=False, read_roles=(authz.AUDITORIA,)
)
ZERO = Decimal("0.00")


def _payload(payable: Payable, *, detail: bool = False) -> dict:
    today = timezone.localdate()
    data = {
        "id": str(payable.id),
        "party_name": payable.party_name,
        "party_document": payable.party_document,
        "ncf": payable.ncf,
        "description": payable.description,
        "category_name": payable.category.name,
        "branch_name": payable.branch.name,
        "amount": str(payable.amount),
        "paid": str(payable.paid),
        "outstanding": str(payable.outstanding),
        "due_on": payable.due_on,
        "overdue": payable.status in (Payable.Status.OPEN, Payable.Status.PARTIAL)
        and payable.due_on < today,
        "status": payable.status,
        "status_label": payable.get_status_display(),
        "recognized_on": payable.recognized_on,
        "series": None
        if payable.series_id is None
        else {
            "frequency": payable.series.get_frequency_display(),
            "occurrence": payable.occurrence,
            "count": payable.series.count,
        },
    }
    if detail:
        data["payments"] = [
            {
                "id": str(p.id),
                "date": p.date,
                "amount": str(p.amount),
                "account_name": str(p.account),
                "method_label": p.get_method_display(),
                "reference": p.reference,
                "entry_number": p.entry.number,
                "created_by_name": person(p.created_by),
            }
            for p in payable.payments.select_related("account", "entry", "created_by").order_by(
                "date", "created_at"
            )
        ]
        data["cancel_reason"] = payable.cancel_reason
        data["cancelled_by_name"] = (
            person(payable.cancelled_by) if payable.cancelled_by_id else None
        )
    return data


class CreateSerializer(serializers.Serializer):
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.filter(is_active=True))
    category = serializers.PrimaryKeyRelatedField(queryset=ExpenseCategory.objects.all())
    party_name = serializers.CharField(max_length=200)
    party_document = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )
    ncf = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")
    description = serializers.CharField(max_length=280)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    due_on = serializers.DateField()
    invoice_on = serializers.DateField(required=False, allow_null=True)
    frequency = serializers.ChoiceField(
        choices=[("", ""), *PayableSeries.Frequency.choices], required=False, default=""
    )
    count = serializers.IntegerField(required=False, default=1, min_value=1)


class PaySerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True)
    )
    date = serializers.DateField()
    method = serializers.ChoiceField(
        choices=Expense.Method.choices, default=Expense.Method.TRANSFER
    )
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")


class PayableViewSet(viewsets.GenericViewSet):
    permission_classes = [CanUsePayables, CompanyNotSuspendedOrReadOnly]
    queryset = Payable.objects.select_related("category", "branch", "series", "cancelled_by")

    def list(self, request: Request) -> Response:
        today = timezone.localdate()
        rows = self.get_queryset()
        params = request.query_params
        view = params.get("vista", "abiertas")
        live = rows.filter(status__in=[Payable.Status.OPEN, Payable.Status.PARTIAL])
        if view == "abiertas":
            rows = live
        elif view == "vencidas":
            rows = live.filter(due_on__lt=today)
        elif view == "proximas":
            rows = live.filter(due_on__gte=today, due_on__lte=today + dt.timedelta(days=7))
        elif view == "pagadas":
            rows = rows.filter(status=Payable.Status.PAID)
        elif view == "canceladas":
            rows = rows.filter(status=Payable.Status.CANCELLED)
        for word in params.get("q", "").split():
            rows = rows.filter(
                Q(party_name__unaccent__icontains=word) | Q(description__unaccent__icontains=word)
            )
        outstanding = F("amount") - F("paid")
        totals = {
            "outstanding": live.aggregate(t=Sum(outstanding))["t"] or ZERO,
            "overdue": live.filter(due_on__lt=today).aggregate(t=Sum(outstanding))["t"] or ZERO,
            "next_7_days": live.filter(
                due_on__gte=today, due_on__lte=today + dt.timedelta(days=7)
            ).aggregate(t=Sum(outstanding))["t"]
            or ZERO,
        }
        page = self.paginate_queryset(rows.order_by("due_on", "party_name"))
        response = self.get_paginated_response([_payload(p) for p in page])
        response.data["totals"] = {k: str(v) for k, v in totals.items()}
        return response

    def retrieve(self, request: Request, pk=None) -> Response:
        return Response(_payload(get_object_or_404(self.get_queryset(), pk=pk), detail=True))

    def create(self, request: Request) -> Response:
        serializer = CreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            created = payables.create(user=request.user, **serializer.validated_data)
        except ExpenseError as exc:
            return fail(exc)
        return Response([_payload(p) for p in created], status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def pagar(self, request: Request, pk=None) -> Response:
        payable = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = PaySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            payables.pay(
                payable=payable,
                user=request.user,
                amount=data["amount"],
                account=data["account"],
                on=data["date"],
                method=data["method"],
                reference=data["reference"],
            )
        except ExpenseError as exc:
            return fail(exc)
        return Response(_payload(self.get_queryset().get(pk=pk), detail=True))

    @action(detail=True, methods=["post"])
    def cancelar(self, request: Request, pk=None) -> Response:
        payable = get_object_or_404(self.get_queryset(), pk=pk)
        try:
            payables.cancel(
                payable=payable, user=request.user, reason=str(request.data.get("reason", ""))
            )
        except ExpenseError as exc:
            return fail(exc)
        return Response(_payload(self.get_queryset().get(pk=pk), detail=True))
