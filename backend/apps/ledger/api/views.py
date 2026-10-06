"""P53 «Cuentas y bancos»: balances, movements, contributions and transfers.

Doc 06 matrix: G and Ct see and transfer; capital adjustments («Ajustes
contables con motivo») are G only. Cashiers and other disbursers read
the active accounts to pick a disbursement source.
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Branch
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount, JournalLine

CanManageAccounts = role_required(
    authz.GERENTE, authz.CONTABILIDAD, read_any=False, read_roles=(authz.AUDITORIA,)
)
CanAdjustCapital = role_required(authz.GERENTE, read_any=False)


class FinancialAccountSerializer(serializers.ModelSerializer):
    balance = serializers.DecimalField(
        source="ledger_account.balance.balance", max_digits=16, decimal_places=2, read_only=True
    )
    ledger_code = serializers.CharField(source="ledger_account.code", read_only=True)
    account_number = serializers.CharField(write_only=True, required=False, allow_blank=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True, default="")

    class Meta:
        model = FinancialAccount
        fields = [
            "id",
            "name",
            "kind",
            "bank_name",
            "account_number",
            "account_number_last4",
            "branch",
            "branch_name",
            "currency",
            "is_active",
            "balance",
            "ledger_code",
        ]
        read_only_fields = ["id", "account_number_last4", "currency"]

    def validate(self, attrs):
        if self.instance is None and attrs.get("kind") == FinancialAccount.Kind.BANK:
            if not attrs.get("bank_name"):
                raise ValidationError({"bank_name": "Indica el banco."})
        return attrs

    def create(self, validated_data):
        return ledger.create_financial_account(
            company_id=self.context["request"].user.company_id,
            name=validated_data["name"],
            kind=validated_data["kind"],
            branch=validated_data.get("branch"),
            bank_name=validated_data.get("bank_name", ""),
            account_number=validated_data.get("account_number", ""),
        )

    def update(self, instance, validated_data):
        # Kind, number and ledger link are fixed once created.
        for field in ("name", "bank_name", "branch", "is_active"):
            if field in validated_data:
                setattr(instance, field, validated_data[field])
        instance.save()
        return instance


class CapitalSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    direction = serializers.ChoiceField(choices=["in", "out"])
    note = serializers.CharField(max_length=200)


class TransferSerializer(serializers.Serializer):
    source = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True)
    )
    target = serializers.PrimaryKeyRelatedField(
        queryset=FinancialAccount.objects.filter(is_active=True)
    )
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal("0.01"))
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


class MovementSerializer(serializers.ModelSerializer):
    number = serializers.CharField(source="entry.number")
    date = serializers.DateField(source="entry.date")
    description = serializers.CharField(source="entry.description")
    source_type = serializers.CharField(source="entry.source_type")

    class Meta:
        model = JournalLine
        fields = ["id", "number", "date", "description", "source_type", "debit", "credit"]


def _branch_for(request: Request, account: FinancialAccount) -> Branch:
    """Entries need a branch: the account's, else the user's first one."""
    if account.branch_id:
        return account.branch
    scope = authz.branch_scope(request.user)
    branches = Branch.objects.filter(is_active=True).order_by("created_at")
    if scope is not None:
        branches = branches.filter(id__in=scope)
    branch = branches.first()
    if branch is None:
        raise ValidationError({"detail": "No tienes una sucursal activa."})
    return branch


class FinancialAccountViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = FinancialAccountSerializer
    permission_classes = [CanManageAccounts, CompanyNotSuspendedOrReadOnly]
    filterset_fields = ["kind", "is_active", "branch"]
    pagination_class = None
    http_method_names = ["get", "post", "patch", "head", "options"]
    queryset = FinancialAccount.objects.select_related(
        "ledger_account__balance", "branch"
    ).order_by("kind", "name")

    @action(detail=True, methods=["get"])
    def movimientos(self, request: Request, pk: str | None = None) -> Response:
        """The latest 200 movements; date-range reports arrive in phase 6."""
        account = self.get_object()
        lines = (
            JournalLine.objects.filter(account=account.ledger_account)
            .select_related("entry")
            .order_by("-entry__date", "-entry__created_at")[:200]
        )
        return Response({"results": MovementSerializer(lines, many=True).data})

    @action(
        detail=True, methods=["post"], url_path="capital", permission_classes=[CanAdjustCapital]
    )
    def capital(self, request: Request, pk: str | None = None) -> Response:
        account = self.get_object()
        serializer = CapitalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            entry = ledger.capital_movement(
                account=account,
                amount=data["amount"],
                increase=data["direction"] == "in",
                branch=_branch_for(request, account),
                on=timezone.localdate(),
                note=data["note"],
                created_by=request.user,
            )
        except ledger.LedgerError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"entry": entry.number}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["post"])
    def transferir(self, request: Request) -> Response:
        serializer = TransferSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            entry = ledger.transfer(
                source=data["source"],
                target=data["target"],
                amount=data["amount"],
                branch=_branch_for(request, data["source"]),
                on=timezone.localdate(),
                note=data.get("note", ""),
                created_by=request.user,
            )
        except ledger.LedgerError as exc:
            raise ValidationError({"detail": str(exc)}) from exc
        return Response({"entry": entry.number}, status=status.HTTP_201_CREATED)
