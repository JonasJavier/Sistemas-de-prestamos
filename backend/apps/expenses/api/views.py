"""P54 «Gastos e ingresos» (F15, decision 081)."""

from decimal import Decimal

from django.db.models import Q, Sum
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.errors import fail, person
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Branch
from apps.expenses import services
from apps.expenses.models import Expense, ExpenseCategory, ExpenseFile, Kind
from apps.ledger.models import FinancialAccount, LedgerAccount

G, SU, CA, CT, AU = (
    authz.GERENTE,
    authz.SUPERVISOR,
    authz.CAJERO,
    authz.CONTABILIDAD,
    authz.AUDITORIA,
)
CanUseExpenses = role_required(G, SU, CA, CT, read_any=False, read_roles=(AU,))
CanEditCategories = role_required(G, CT, read_any=False, read_roles=(SU, CA, AU))
ZERO = Decimal("0.00")


class CategorySerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source="account.code", read_only=True)
    account_name = serializers.CharField(source="account.name", read_only=True)
    nature_label = serializers.CharField(source="get_nature_display", read_only=True)

    class Meta:
        model = ExpenseCategory
        fields = [
            "id",
            "name",
            "kind",
            "nature",
            "nature_label",
            "account",
            "account_code",
            "account_name",
            "is_active",
        ]
        read_only_fields = ["id"]

    def validate(self, attrs):
        kind = attrs.get("kind", self.instance.kind if self.instance else None)
        nature = attrs.get("nature", self.instance.nature if self.instance else "operating")
        account: LedgerAccount | None = attrs.get("account")
        if account is not None:
            expected = {
                (Kind.EXPENSE, "operating"): LedgerAccount.Type.EXPENSE,
                (Kind.EXPENSE, "owner"): LedgerAccount.Type.EQUITY,
                (Kind.INCOME, "operating"): LedgerAccount.Type.INCOME,
            }.get((kind, nature))
            if expected is None:
                raise serializers.ValidationError({"nature": "Un ingreso es siempre operativo."})
            if account.type != expected or hasattr(account, "financial_account"):
                raise serializers.ValidationError(
                    {"account": f"La cuenta debe ser de tipo {LedgerAccount.Type(expected).label}."}
                )
        return attrs

    def create(self, validated_data):
        return ExpenseCategory.objects.create(
            company_id=self.context["request"].user.company_id, **validated_data
        )


class CategoryViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = CategorySerializer
    permission_classes = [CanEditCategories, CompanyNotSuspendedOrReadOnly]
    queryset = ExpenseCategory.objects.select_related("account").order_by("kind", "name")
    http_method_names = ["get", "post", "patch", "head", "options"]
    pagination_class = None
    filterset_fields = ["kind", "is_active"]


def _expense_payload(expense: Expense, user, *, detail: bool = False) -> dict:
    data = {
        "id": str(expense.id),
        "number": expense.number,
        "kind": expense.kind,
        "kind_label": expense.get_kind_display(),
        "date": expense.date,
        "branch_name": expense.branch.name,
        "category": str(expense.category_id),
        "category_name": expense.category.name,
        "nature": expense.category.nature,
        "description": expense.description,
        "amount": str(expense.amount),
        "itbis": str(expense.itbis),
        "method": expense.method,
        "method_label": expense.get_method_display(),
        "account_name": expense.account.name,
        "from_drawer": expense.cash_session_id is not None,
        "party_name": expense.party_name,
        "party_document": expense.party_document,
        "ncf": expense.ncf,
        "status": expense.status,
        "status_label": expense.get_status_display(),
        "created_by_name": person(expense.created_by),
        "created_at": expense.created_at,
        "files": expense.files.count() if not detail else None,
    }
    if detail:
        data.update(
            {
                "entry_number": expense.entry.number if expense.entry_id else None,
                "decided_by_name": person(expense.decided_by) if expense.decided_by_id else None,
                "decided_at": expense.decided_at,
                "decision_note": expense.decision_note,
                "voided_by_name": person(expense.voided_by) if expense.voided_by_id else None,
                "voided_at": expense.voided_at,
                "void_reason": expense.void_reason,
                "void_entry_number": expense.void_entry.number if expense.void_entry_id else None,
                "files": [
                    {
                        "id": str(f.id),
                        "name": f.file.name.rsplit("/", 1)[-1],
                        "content_type": f.content_type,
                        "size": f.size,
                    }
                    for f in expense.files.order_by("created_at")
                ],
                "history": [
                    {
                        "at": event.pgh_created_at,
                        "label": event.pgh_label,
                        "description": event.description,
                        "ncf": event.ncf,
                        "party_name": event.party_name,
                        "status": event.status,
                    }
                    for event in expense.events.order_by("pgh_created_at")
                ],
                "can_decide": expense.status == Expense.Status.PENDING
                and expense.created_by_id != user.pk
                and authz.has_any_role(user, *services.APPROVE_ROLES)
                and (
                    authz.has_any_role(user, G)
                    or authz.within_limit(user, "expense", expense.amount)
                ),
                "can_void": expense.status == Expense.Status.POSTED
                and authz.has_any_role(user, *services.VOID_ROLES),
            }
        )
    return data


class RegisterSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=Kind.choices)
    date = serializers.DateField()
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.filter(is_active=True))
    category = serializers.PrimaryKeyRelatedField(queryset=ExpenseCategory.objects.all())
    description = serializers.CharField(max_length=300)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    itbis = serializers.DecimalField(max_digits=14, decimal_places=2, default=ZERO)
    method = serializers.ChoiceField(choices=Expense.Method.choices, default=Expense.Method.CASH)
    account = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True), required=False, allow_null=True
    )
    from_drawer = serializers.BooleanField(default=False)
    party_name = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    party_document = serializers.CharField(
        max_length=20, required=False, allow_blank=True, default=""
    )
    ncf = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")


class DetailsSerializer(serializers.Serializer):
    description = serializers.CharField(max_length=300, required=False)
    party_name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    party_document = serializers.CharField(max_length=20, required=False, allow_blank=True)
    ncf = serializers.CharField(max_length=20, required=False, allow_blank=True)


class NoteSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class ExpenseViewSet(viewsets.GenericViewSet):
    permission_classes = [CanUseExpenses, CompanyNotSuspendedOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_queryset(self):
        user = self.request.user
        rows = Expense.objects.select_related(
            "branch", "category", "account", "created_by", "decided_by", "voided_by"
        )
        if authz.has_any_role(user, G, CT, AU):
            return rows
        scope = authz.branch_scope(user)
        if authz.has_any_role(user, SU):
            return rows if scope is None else rows.filter(branch_id__in=scope)
        return rows.filter(created_by=user)  # the cashier sees what he registered

    def _filtered(self, request: Request):
        rows = self.get_queryset()
        params = request.query_params
        if params.get("tipo") in Kind.values:
            rows = rows.filter(kind=params["tipo"])
        if params.get("estado") in Expense.Status.values:
            rows = rows.filter(status=params["estado"])
        if params.get("categoria"):
            rows = rows.filter(category_id=params["categoria"])
        if params.get("sucursal"):
            rows = rows.filter(branch_id=params["sucursal"])
        if params.get("desde"):
            rows = rows.filter(date__gte=params["desde"])
        if params.get("hasta"):
            rows = rows.filter(date__lte=params["hasta"])
        for word in params.get("q", "").split():
            rows = rows.filter(
                Q(number__icontains=word)
                | Q(description__unaccent__icontains=word)
                | Q(party_name__unaccent__icontains=word)
                | Q(ncf__icontains=word)
            )
        return rows

    def list(self, request: Request) -> Response:
        rows = self._filtered(request).order_by("-date", "-created_at")
        valid = rows.filter(status=Expense.Status.POSTED)
        totals = {
            "expense": valid.filter(kind=Kind.EXPENSE).aggregate(t=Sum("amount"))["t"] or ZERO,
            "income": valid.filter(kind=Kind.INCOME).aggregate(t=Sum("amount"))["t"] or ZERO,
            "pending": rows.filter(status=Expense.Status.PENDING).count(),
        }
        page = self.paginate_queryset(rows)
        response = self.get_paginated_response(
            [_expense_payload(expense, request.user) for expense in page]
        )
        response.data["totals"] = {k: str(v) for k, v in totals.items()}
        return response

    def retrieve(self, request: Request, pk=None) -> Response:
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        return Response(_expense_payload(expense, request.user, detail=True))

    def create(self, request: Request) -> Response:
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            expense = services.register(
                user=request.user,
                files=request.FILES.getlist("files"),
                **serializer.validated_data,
            )
        except services.ExpenseError as exc:
            return fail(exc)
        return Response(
            _expense_payload(expense, request.user, detail=True), status=status.HTTP_201_CREATED
        )

    def partial_update(self, request: Request, pk=None) -> Response:
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = DetailsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            expense = services.update_details(
                expense=expense, user=request.user, **serializer.validated_data
            )
        except services.ExpenseError as exc:
            return fail(exc)
        return Response(_expense_payload(expense, request.user, detail=True))

    def _decide(self, request: Request, pk, verb: str) -> Response:
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        serializer = NoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        note = serializer.validated_data["note"]
        try:
            if verb == "approve":
                expense = services.approve(expense=expense, user=request.user, note=note)
            elif verb == "reject":
                expense = services.reject(expense=expense, user=request.user, note=note)
            else:
                expense = services.void(expense=expense, user=request.user, reason=note)
        except services.ExpenseError as exc:
            return fail(exc)
        return Response(_expense_payload(expense, request.user, detail=True))

    @action(detail=True, methods=["post"])
    def aprobar(self, request: Request, pk=None) -> Response:
        return self._decide(request, pk, "approve")

    @action(detail=True, methods=["post"])
    def rechazar(self, request: Request, pk=None) -> Response:
        return self._decide(request, pk, "reject")

    @action(detail=True, methods=["post"])
    def anular(self, request: Request, pk=None) -> Response:
        return self._decide(request, pk, "void")

    @action(detail=True, methods=["post"])
    def archivos(self, request: Request, pk=None) -> Response:
        expense = get_object_or_404(self.get_queryset(), pk=pk)
        if expense.status in (Expense.Status.VOIDED, Expense.Status.REJECTED):
            return fail(
                services.ExpenseError("Lo anulado o rechazado ya no recibe archivos.", "state")
            )
        uploads = request.FILES.getlist("files")
        if not uploads:
            return fail(services.ExpenseError("Adjunta el comprobante.", "file"))
        try:
            for upload in uploads:
                services.attach(expense=expense, user=request.user, upload=upload)
        except services.ExpenseError as exc:
            return fail(exc)
        return Response(_expense_payload(expense, request.user, detail=True))

    @action(detail=False, methods=["get"])
    def cuentas(self, request: Request) -> Response:
        """Where an expense can be paid from: active cash boxes and banks
        (drawers move only through their sessions)."""
        accounts = FinancialAccount.objects.filter(
            is_active=True, kind__in=[FinancialAccount.Kind.CASH, FinancialAccount.Kind.BANK]
        ).order_by("kind", "name")
        return Response([{"id": str(a.id), "name": str(a), "kind": a.kind} for a in accounts])

    @action(detail=False, methods=["get"], url_path=r"archivos/(?P<file_id>[0-9a-f-]+)")
    def archivo(self, request: Request, file_id=None) -> FileResponse:
        file = get_object_or_404(
            ExpenseFile.objects.filter(expense__in=self.get_queryset()), pk=file_id
        )
        return FileResponse(file.file.open("rb"), content_type=file.content_type)
