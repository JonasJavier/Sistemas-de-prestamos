"""P56 «Contabilidad»: chart of accounts, journal, general ledger, trial
balance, income statement, balance sheet and manual entries (decision 080).

Doc 06 matrix: financial reports for G, Ct and Au; the chart is edited by
G and Ct; manual entries («ajustes contables con motivo») are G only.
"""

import datetime as dt
from decimal import Decimal

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.errors import fail, person
from apps.core.api.pagination import Pagination
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Branch
from apps.ledger import accounting
from apps.ledger.models import AccountingPeriod, LedgerAccount

G, CT, AU = authz.GERENTE, authz.CONTABILIDAD, authz.AUDITORIA
CanReadBooks = role_required(G, CT, AU, read_any=False)
CanEditChart = role_required(G, CT, read_any=False, read_roles=(AU,))
CanAdjust = role_required(G, read_any=False)


def _date(request: Request, key: str, default: dt.date) -> dt.date:
    raw = request.query_params.get(key)
    if not raw:
        return default
    try:
        return dt.date.fromisoformat(raw)
    except ValueError as exc:
        raise ValidationError({key: "Fecha inválida (AAAA-MM-DD)."}) from exc


def _range(request: Request) -> tuple[dt.date, dt.date]:
    today = timezone.localdate()
    date_from = _date(request, "desde", today.replace(day=1))
    date_to = _date(request, "hasta", today)
    if date_from > date_to:
        raise ValidationError({"desde": "La fecha inicial va antes de la final."})
    return date_from, date_to


def _branch(request: Request):
    return request.query_params.get("sucursal") or None


def _account(account: LedgerAccount) -> dict:
    return {
        "id": str(account.id),
        "code": account.code,
        "name": account.name,
        "type": account.type,
        "type_label": account.get_type_display(),
    }


def _section(section: accounting.Section) -> dict:
    return {
        "title": section.title,
        "rows": [{**_account(a), "amount": str(amount)} for a, amount in section.rows],
        "total": str(section.total),
    }


class ChartSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(
        source="balance.balance", max_digits=16, decimal_places=2, read_only=True
    )
    type_label = serializers.CharField(source="get_type_display", read_only=True)
    financial = serializers.SerializerMethodField()

    class Meta:
        model = LedgerAccount
        fields = [
            "id",
            "code",
            "name",
            "type",
            "type_label",
            "parent",
            "is_system",
            "is_active",
            "balance",
            "financial",
        ]
        read_only_fields = ["id", "is_system", "balance"]

    def get_financial(self, obj: LedgerAccount) -> bool:
        return hasattr(obj, "financial_account")

    def validate_code(self, value: str) -> str:
        value = value.strip()
        if not value or not value.replace("-", "").isdigit():
            raise serializers.ValidationError("El código lleva solo números (y guiones).")
        if value.startswith(("1101-", "1102-", "1103-", "1104-")):
            raise serializers.ValidationError("Ese código es de las cajas y los bancos.")
        clash = LedgerAccount.objects.filter(code=value)
        if self.instance is not None:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError("Ya hay una cuenta con ese código.")
        return value

    def validate(self, attrs):
        instance = self.instance
        if instance is not None and (instance.is_system or hasattr(instance, "financial_account")):
            changed = set(attrs) - {"parent"}
            if changed:
                raise ValidationError(
                    {"detail": "Las cuentas del sistema y de cajas o bancos no se modifican aquí."}
                )
        if instance is not None and "type" in attrs and attrs["type"] != instance.type:
            if instance.lines.exists():
                raise ValidationError({"type": "Una cuenta con movimientos no cambia de tipo."})
        parent = attrs.get("parent")
        account_type = attrs.get("type", instance.type if instance else None)
        if parent is not None and parent.type != account_type:
            raise ValidationError({"parent": "La cuenta madre debe ser del mismo tipo."})
        return attrs

    def create(self, validated_data):
        from apps.ledger.models import AccountBalance

        company_id = self.context["request"].user.company_id
        account = LedgerAccount.objects.create(
            company_id=company_id, allows_negative=True, **validated_data
        )
        AccountBalance.objects.create(company_id=company_id, account=account, allows_negative=True)
        return account


class ChartView(APIView):
    """The chart of accounts with today's balance (cache checked nightly)."""

    permission_classes = [CanEditChart, CompanyNotSuspendedOrReadOnly]

    def get(self, request: Request) -> Response:
        accounts = LedgerAccount.objects.select_related("balance", "financial_account").order_by(
            "code"
        )
        return Response(ChartSerializer(accounts, many=True).data)

    def post(self, request: Request) -> Response:
        serializer = ChartSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class ChartDetailView(APIView):
    permission_classes = [CanEditChart, CompanyNotSuspendedOrReadOnly]

    def patch(self, request: Request, pk) -> Response:
        account = get_object_or_404(LedgerAccount, pk=pk)
        serializer = ChartSerializer(account, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class TrialBalanceView(APIView):
    permission_classes = [CanReadBooks]

    def get(self, request: Request) -> Response:
        date_from, date_to = _range(request)
        rows = accounting.trial_balance(date_from, date_to, branch_id=_branch(request))
        totals = {
            "debit": sum((r.debit for r in rows), Decimal("0")),
            "credit": sum((r.credit for r in rows), Decimal("0")),
        }
        return Response(
            {
                "date_from": date_from,
                "date_to": date_to,
                "rows": [
                    {
                        **_account(r.account),
                        "opening": str(r.opening),
                        "debit": str(r.debit),
                        "credit": str(r.credit),
                        "closing": str(r.closing),
                    }
                    for r in rows
                ],
                "totals": {k: str(v) for k, v in totals.items()},
            }
        )


class IncomeStatementView(APIView):
    permission_classes = [CanReadBooks]

    def get(self, request: Request) -> Response:
        date_from, date_to = _range(request)
        report = accounting.income_statement(date_from, date_to, branch_id=_branch(request))
        return Response(
            {
                "date_from": date_from,
                "date_to": date_to,
                "income": _section(report.income),
                "expenses": _section(report.expenses),
                "result": str(report.result),
            }
        )


class BalanceSheetView(APIView):
    permission_classes = [CanReadBooks]

    def get(self, request: Request) -> Response:
        as_of = _date(request, "fecha", timezone.localdate())
        report = accounting.balance_sheet(as_of, branch_id=_branch(request))
        return Response(
            {
                "as_of": as_of,
                "assets": _section(report.assets),
                "liabilities": _section(report.liabilities),
                "equity": _section(report.equity),
                "retained": str(report.retained),
                "current": str(report.current),
                "equity_total": str(report.equity_total),
                "liabilities_and_equity": str(report.liabilities.total + report.equity_total),
                "balances": report.balances,
            }
        )


class AccountLedgerView(APIView):
    permission_classes = [CanReadBooks]

    def get(self, request: Request, pk) -> Response:
        account = get_object_or_404(LedgerAccount, pk=pk)
        date_from, date_to = _range(request)
        opening, rows, truncated = accounting.account_ledger(
            account, date_from, date_to, branch_id=_branch(request)
        )
        return Response(
            {
                "account": _account(account),
                "date_from": date_from,
                "date_to": date_to,
                "opening": str(opening),
                "closing": str(rows[-1].balance if rows else opening),
                "truncated": truncated,
                "rows": [
                    {
                        "entry": row.line.entry.number,
                        "date": row.line.entry.date,
                        "description": row.line.entry.description,
                        "memo": row.line.memo,
                        "debit": str(row.line.debit),
                        "credit": str(row.line.credit),
                        "balance": str(row.balance),
                    }
                    for row in rows
                ],
            }
        )


class JournalView(APIView):
    permission_classes = [CanReadBooks]

    def get(self, request: Request) -> Response:
        date_from, date_to = _range(request)
        entries = accounting.journal(date_from, date_to, branch_id=_branch(request))
        paginator = Pagination()
        page = paginator.paginate_queryset(
            entries.select_related("branch", "created_by").prefetch_related("lines__account"),
            request,
            view=self,
        )
        return paginator.get_paginated_response(
            [
                {
                    "id": str(entry.id),
                    "number": entry.number,
                    "date": entry.date,
                    "description": entry.description,
                    "source_type": entry.source_type,
                    "branch_name": entry.branch.name,
                    "created_by_name": person(entry.created_by) if entry.created_by_id else None,
                    "reversal_of": str(entry.reversal_of_id) if entry.reversal_of_id else None,
                    "lines": [
                        {
                            **_account(line.account),
                            "debit": str(line.debit),
                            "credit": str(line.credit),
                            "memo": line.memo,
                        }
                        for line in entry.lines.all()
                    ],
                }
                for entry in page
            ]
        )


class ManualLineSerializer(serializers.Serializer):
    account = serializers.PrimaryKeyRelatedField(queryset=LedgerAccount.objects.all())
    debit = serializers.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    credit = serializers.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0"))
    memo = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")


class ManualEntrySerializer(serializers.Serializer):
    date = serializers.DateField()
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.filter(is_active=True))
    description = serializers.CharField(max_length=250)
    lines = ManualLineSerializer(many=True)

    def validate_date(self, value: dt.date) -> dt.date:
        if value > timezone.localdate():
            raise serializers.ValidationError("Un ajuste no lleva fecha futura.")
        return value


class ManualEntryView(APIView):
    permission_classes = [CanAdjust, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        serializer = ManualEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            entry = accounting.manual_entry(
                user=request.user,
                branch=data["branch"],
                on=data["date"],
                description=data["description"],
                lines=[accounting.ManualLine(**line) for line in data["lines"]],
            )
        except accounting.ledger.LedgerError as exc:
            return fail(exc)
        return Response({"id": str(entry.id), "number": entry.number}, status=201)


class PeriodsView(APIView):
    """The last 24 months and whether each is open or closed (F15)."""

    permission_classes = [CanReadBooks]

    def get(self, request: Request) -> Response:
        today = timezone.localdate()
        stored = {
            (p.year, p.month): p for p in AccountingPeriod.objects.select_related("closed_by")
        }
        months = []
        year, month = today.year, today.month
        for _ in range(24):
            period = stored.get((year, month))
            months.append(
                {
                    "year": year,
                    "month": month,
                    "status": period.status if period else AccountingPeriod.Status.OPEN,
                    "closed_at": period.closed_at if period else None,
                    "closed_by_name": person(period.closed_by)
                    if period and period.closed_by_id
                    else None,
                }
            )
            year, month = (year - 1, 12) if month == 1 else (year, month - 1)
        return Response(months)


class MonthCloseView(APIView):
    """F15: the checklist of a month, and closing or reopening it (G)."""

    permission_classes = [CanReadBooks, CompanyNotSuspendedOrReadOnly]
    verb = ""

    def get(self, request: Request, year: int, month: int) -> Response:
        from apps.ledger import closing

        if not 1 <= month <= 12:
            raise ValidationError({"month": "Mes inválido."})
        period = AccountingPeriod.objects.filter(year=year, month=month).first()
        _, last = accounting.month_bounds(year, month)
        preview = sum((item.amount for item in closing.accrual(last)), Decimal("0"))
        from apps.documents.models import GeneratedDocument

        document = (
            GeneratedDocument.objects.filter(
                target_type="ledger.accountingperiod", target_id=period.pk
            )
            .order_by("-created_at")
            .first()
            if period
            else None
        )
        return Response(
            {
                "year": year,
                "month": month,
                "status": period.status if period else AccountingPeriod.Status.OPEN,
                "closed_at": period.closed_at if period else None,
                "closed_by_name": person(period.closed_by)
                if period and period.closed_by_id
                else None,
                "reopen_reason": period.reopen_reason if period else "",
                "checklist": closing.checklist(year, month).as_dict(),
                "accrual_preview": str(preview),
                "accrual": (period.checklist or {}).get("accrual") if period else None,
                "document": None if document is None else str(document.id),
                "can_close": authz.has_any_role(request.user, G),
            }
        )

    def post(self, request: Request, year: int, month: int) -> Response:
        from apps.ledger import closing

        try:
            if self.verb == "cerrar":
                closing.close_month(year=year, month=month, user=request.user)
            elif self.verb == "reabrir":
                closing.reopen_month(
                    year=year,
                    month=month,
                    user=request.user,
                    reason=str(request.data.get("reason", "")),
                )
        except closing.ClosingError as exc:
            response = fail(exc)
            if exc.checklist is not None:
                response.data["checklist"] = exc.checklist.as_dict()
            return response
        return self.get(request, year, month)


class MonthClosePdfView(APIView):
    permission_classes = [CanReadBooks]

    def get(self, request: Request, year: int, month: int):
        from django.http import FileResponse, Http404

        from apps.documents.models import GeneratedDocument

        period = AccountingPeriod.objects.filter(year=year, month=month).first()
        document = (
            GeneratedDocument.objects.filter(
                target_type="ledger.accountingperiod", target_id=period.pk
            )
            .order_by("-created_at")
            .first()
            if period
            else None
        )
        if document is None:
            raise Http404
        return FileResponse(
            document.file.open("rb"),
            content_type="application/pdf",
            filename=f"{document.folio}.pdf",
        )
