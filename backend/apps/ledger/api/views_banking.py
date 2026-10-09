"""Bank reconciliation in P56 (F15, decision 083): G and Ct work it; Au reads."""

from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.errors import fail, person
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Branch
from apps.ledger import banking
from apps.ledger.models import (
    BankReconciliation,
    BankStatementLine,
    FinancialAccount,
    JournalLine,
    LedgerAccount,
)

CanReconcile = role_required(
    authz.GERENTE, authz.CONTABILIDAD, read_any=False, read_roles=(authz.AUDITORIA,)
)


def _book(line: JournalLine) -> dict:
    return {
        "id": str(line.id),
        "date": line.entry.date,
        "entry": line.entry.number,
        "description": line.entry.description,
        "amount": str(line.debit - line.credit),
    }


def _payload(reconciliation: BankReconciliation) -> dict:
    result = banking.summary(reconciliation)
    lines = reconciliation.lines.select_related("matched_line__entry", "matched_by").order_by(
        "date", "created_at"
    )
    in_transit = banking.unmatched_book_lines(reconciliation)
    return {
        "id": str(reconciliation.id),
        "account": str(reconciliation.account_id),
        "account_name": str(reconciliation.account),
        "year": reconciliation.year,
        "month": reconciliation.month,
        "status": reconciliation.status,
        "status_label": reconciliation.get_status_display(),
        "closed_at": reconciliation.closed_at,
        "closed_by_name": person(reconciliation.closed_by) if reconciliation.closed_by_id else None,
        "summary": {
            "book_balance": str(result.book_balance),
            "in_transit": str(result.in_transit),
            "expected_statement": str(result.expected_statement),
            "statement_closing": str(result.statement_closing),
            "difference": str(result.difference),
            "unmatched_statement": result.unmatched_statement,
            "can_close": result.can_close,
        },
        "lines": [
            {
                "id": str(line.id),
                "date": line.date,
                "description": line.description,
                "reference": line.reference,
                "amount": str(line.amount),
                "matched": None if line.matched_line_id is None else _book(line.matched_line),
            }
            for line in lines
        ],
        "in_transit": [_book(line) for line in in_transit[:300]],
    }


class StartSerializer(serializers.Serializer):
    account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(kind=FinancialAccount.Kind.BANK)
    )
    year = serializers.IntegerField(min_value=2000, max_value=2100)
    month = serializers.IntegerField(min_value=1, max_value=12)
    statement_closing = serializers.DecimalField(max_digits=16, decimal_places=2)


class ReconciliationsView(APIView):
    permission_classes = [CanReconcile, CompanyNotSuspendedOrReadOnly]

    def get(self, request: Request) -> Response:
        rows = BankReconciliation.objects.select_related("account", "closed_by").order_by(
            "-year", "-month"
        )
        if request.query_params.get("cuenta"):
            rows = rows.filter(account_id=request.query_params["cuenta"])
        return Response(
            [
                {
                    "id": str(r.id),
                    "account_name": str(r.account),
                    "year": r.year,
                    "month": r.month,
                    "status": r.status,
                    "status_label": r.get_status_display(),
                    "statement_closing": str(r.statement_closing),
                }
                for r in rows[:100]
            ]
        )

    def post(self, request: Request) -> Response:
        serializer = StartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reconciliation = banking.start(user=request.user, **serializer.validated_data)
        except banking.BankingError as exc:
            return fail(exc)
        return Response(_payload(reconciliation), status=status.HTTP_201_CREATED)


class ReconciliationView(APIView):
    permission_classes = [CanReconcile, CompanyNotSuspendedOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    verb = ""

    def get(self, request: Request, pk) -> Response:
        return Response(_payload(get_object_or_404(BankReconciliation, pk=pk)))

    def post(self, request: Request, pk) -> Response:
        reconciliation = get_object_or_404(BankReconciliation, pk=pk)
        try:
            if self.verb == "extracto":
                upload = request.FILES.get("file")
                if upload is None:
                    raise banking.BankingError("Adjunta el extracto (CSV o Excel).", "file")
                added, skipped = banking.import_statement(
                    reconciliation=reconciliation, user=request.user, upload=upload
                )
                data = _payload(reconciliation)
                data["imported"] = {"added": added, "skipped": skipped}
                return Response(data)
            if self.verb == "auto":
                matched = banking.auto_match(reconciliation=reconciliation, user=request.user)
                data = _payload(reconciliation)
                data["matched"] = matched
                return Response(data)
            if self.verb == "cerrar":
                closed = banking.close(reconciliation=reconciliation, user=request.user)
                return Response(_payload(closed))
        except banking.BankingError as exc:
            return fail(exc)
        return Response(status=status.HTTP_404_NOT_FOUND)


class LineActionSerializer(serializers.Serializer):
    book = serializers.PrimaryKeyRelatedField(queryset=JournalLine.objects.all(), required=False)
    counterpart = serializers.PrimaryKeyRelatedField(
        queryset=LedgerAccount.objects.all(), required=False
    )
    branch = serializers.PrimaryKeyRelatedField(
        queryset=Branch.objects.filter(is_active=True), required=False
    )
    description = serializers.CharField(max_length=200, required=False, allow_blank=True)


class StatementLineView(APIView):
    """Match a statement line by hand, undo it, or book the bank charge."""

    permission_classes = [CanReconcile, CompanyNotSuspendedOrReadOnly]
    verb = ""

    def post(self, request: Request, pk, line_id) -> Response:
        line = get_object_or_404(
            BankStatementLine.objects.select_related("reconciliation"),
            pk=line_id,
            reconciliation_id=pk,
        )
        serializer = LineActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            if self.verb == "emparejar":
                if "book" not in data:
                    raise banking.BankingError("Elige el movimiento del libro.", "book")
                banking.match(line=line, book=data["book"], user=request.user)
            elif self.verb == "desemparejar":
                banking.unmatch(line=line, user=request.user)
            elif self.verb == "registrar":
                if "counterpart" not in data:
                    raise banking.BankingError("Elige la cuenta del cargo o del abono.", "account")
                branch = (
                    data.get("branch")
                    or Branch.objects.filter(is_active=True).order_by("created_at").first()
                )
                banking.book_from_line(
                    line=line,
                    user=request.user,
                    counterpart=data["counterpart"],
                    branch=branch,
                    description=data.get("description", ""),
                )
        except banking.BankingError as exc:
            return fail(exc)
        return Response(_payload(line.reconciliation))
