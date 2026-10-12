from django.db.models import Q, QuerySet, Value
from django.db.models.functions import Concat
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.customers import access, listing
from apps.customers.api.serializers import (
    BlockSerializer,
    CustomerListSerializer,
    CustomerSerializer,
)
from apps.customers.models import Customer
from apps.customers.search import search_customers
from apps.customers.validators import mask_document

# Doc 06 matrix: create/edit customers -> G, Su, O; block -> G, Su.
CanEditCustomers = role_required("Gerente", "Supervisor", "Oficial de crédito")
CanBlockCustomers = role_required("Gerente", "Supervisor")


class CustomerViewSet(viewsets.ModelViewSet):
    """Customers of the caller's company (P20-P22). RLS scopes everything."""

    permission_classes = [CanEditCustomers, CompanyNotSuspendedOrReadOnly]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status", "kind", "home_branch"]

    def get_queryset(self) -> QuerySet[Customer]:
        queryset = access.scope_customers(
            Customer.objects.select_related(
                "home_branch", "score", "sector", "municipality", "province"
            ).order_by("-created_at"),
            self.request.user,
        )
        params = self.request.query_params
        q = params.get("q", "")
        if q.strip():
            queryset = search_customers(q, queryset)
        collector = params.get("cobrador", "")
        if collector:
            try:
                queryset = listing.by_collector(queryset, collector)
            except ValueError as exc:
                raise ValidationError({"cobrador": "Valor inválido."}) from exc
        if self.action == "list":
            # Decision 115: the portfolio of each customer and the state filter.
            queryset = listing.by_state(listing.with_portfolio(queryset), params.get("estado", ""))
        return queryset

    @action(detail=False, methods=["get"], url_path="resumen")
    def summary(self, request: Request) -> Response:
        """The counts of «Todos · Al día · En atraso · Sin préstamo» and the
        active portfolio, for the same search and collector as the list."""
        data = listing.summary(self.filter_queryset(self.get_queryset()))
        data["principal"] = str(data["principal"])
        return Response(data)

    def get_serializer_class(self):
        if self.action == "list":
            return CustomerListSerializer
        return CustomerSerializer

    def create(self, request: Request, *args, **kwargs) -> Response:
        """F1: an exact document blocks; a lookalike warns unless confirmed."""
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.data.get("confirm_duplicate"):
            candidates = self._possible_duplicates(serializer.validated_data)
            if candidates:
                return Response(
                    {
                        "code": "possible_duplicate",
                        "detail": "Hay clientes parecidos. Revisa antes de crear.",
                        "candidates": CustomerListSerializer(candidates, many=True).data,
                    },
                    status=status.HTTP_409_CONFLICT,
                )
        serializer.save()
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def _possible_duplicates(self, data: dict) -> list[Customer]:
        phone = data.get("phone", "")
        if not phone:
            return []
        name = (
            data.get("legal_name", "")
            or f"{data.get('first_name', '')} {data.get('last_name', '')}".strip()
        )
        matches = (
            Customer.objects.annotate(
                full_name=Concat("first_name", Value(" "), "last_name", Value(" "), "legal_name")
            )
            .filter(Q(phone=phone) | Q(phone2=phone))
            .filter(full_name__unaccent__trigram_word_similar=name)
        )
        return list(matches[:5])

    @action(detail=True, methods=["post"], permission_classes=[CanBlockCustomers])
    def block(self, request: Request, pk: str | None = None) -> Response:
        serializer = BlockSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        customer = self.get_object()
        customer.status = Customer.Status.BLOCKED
        customer.block_reason = serializer.validated_data["reason"]
        customer.save(update_fields=["status", "block_reason", "updated_at"])
        return Response(CustomerSerializer(customer).data)

    @action(detail=True, methods=["post"], permission_classes=[CanBlockCustomers])
    def unblock(self, request: Request, pk: str | None = None) -> Response:
        customer = self.get_object()
        customer.status = Customer.Status.ACTIVE
        customer.block_reason = ""
        customer.save(update_fields=["status", "block_reason", "updated_at"])
        return Response(CustomerSerializer(customer).data)

    @action(detail=False, methods=["get"], url_path="otra-sucursal")
    def other_branch(self, request: Request) -> Response:
        """An exact document of a customer outside the user's branches: only
        enough to ask for access (decision 033)."""
        digits = "".join(ch for ch in request.query_params.get("documento", "") if ch.isalnum())
        if len(digits) < 6 or not authz.has_any_role(request.user, *access.GRANT_ROLES):
            return Response([])
        visible = access.scope_customers(Customer.objects.all(), request.user).values("id")
        matches = (
            Customer.objects.filter(document_number=digits)
            .exclude(id__in=visible)
            .select_related("home_branch")[:3]
        )
        return Response(
            [
                {
                    "id": str(c.id),
                    "display_name": c.display_name,
                    "document": mask_document(c.document_number),
                    "branch_name": c.home_branch.name,
                }
                for c in matches
            ]
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="acceso-especial",
        permission_classes=[IsAuthenticated, CompanyNotSuspendedOrReadOnly],
    )
    def special_access(self, request: Request, pk: str | None = None) -> Response:
        """«Atender un cliente de otra sucursal», with a reason; logged."""
        if not authz.has_any_role(request.user, *access.GRANT_ROLES):
            return Response({"detail": "Tu rol no atiende otras sucursales."}, status=403)
        customer = Customer.objects.filter(pk=pk).first()
        if customer is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            grant = access.grant(
                user=request.user, customer=customer, note=request.data.get("note", "")
            )
        except ValueError as exc:
            return Response({"detail": str(exc), "code": "note"}, status=400)
        return Response({"expires_at": grant.expires_at}, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer) -> None:
        # Consent timestamp is set once, when the signed consent arrives.
        if serializer.validated_data.get("consent_at") and not serializer.instance.consent_at:
            serializer.validated_data["consent_at"] = timezone.now()
        serializer.save()
