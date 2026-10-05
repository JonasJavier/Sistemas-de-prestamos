from django.db.models import Q, QuerySet, Value
from django.db.models.functions import Concat
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.accounts.api.permissions import role_required
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.customers.api.serializers import (
    BlockSerializer,
    CustomerListSerializer,
    CustomerSerializer,
)
from apps.customers.models import Customer
from apps.customers.search import search_customers

# Doc 06 matrix: create/edit customers -> G, Su, O; block -> G, Su.
CanEditCustomers = role_required("Gerente", "Supervisor", "Oficial de crédito")
CanBlockCustomers = role_required("Gerente", "Supervisor")


class CustomerViewSet(viewsets.ModelViewSet):
    """Customers of the caller's company (P20-P22). RLS scopes everything."""

    permission_classes = [CanEditCustomers, CompanyNotSuspendedOrReadOnly]
    http_method_names = ["get", "post", "patch", "head", "options"]
    filterset_fields = ["status", "kind", "home_branch"]

    def get_queryset(self) -> QuerySet[Customer]:
        queryset = Customer.objects.select_related("home_branch").order_by("-created_at")
        q = self.request.query_params.get("q", "")
        if q.strip():
            queryset = search_customers(q, queryset)
        return queryset

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
                full_name=Concat(
                    "first_name", Value(" "), "last_name", Value(" "), "legal_name"
                )
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

    def perform_update(self, serializer) -> None:
        # Consent timestamp is set once, when the signed consent arrives.
        if serializer.validated_data.get("consent_at") and not serializer.instance.consent_at:
            serializer.validated_data["consent_at"] = timezone.now()
        serializer.save()
