from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import IsCompanyManagerOrReadOnly, role_required
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.lending import simulator
from apps.lending.api.serializers import (
    LoanProductSerializer,
    ProductChargeSerializer,
    SimulationRequestSerializer,
)
from apps.lending.models import LoanProduct, ProductCharge

# Doc 06 matrix: the simulator serves the counter (P25): G, Su, O, Ca.
CanSimulate = role_required("Gerente", "Supervisor", "Oficial de crédito", "Cajero", read_any=False)


class LoanProductViewSet(viewsets.ModelViewSet):
    """Products (P74). Everyone reads (selectors); G/A manage (doc 06 matrix)."""

    serializer_class = LoanProductSerializer
    permission_classes = [IsCompanyManagerOrReadOnly, CompanyNotSuspendedOrReadOnly]
    filterset_fields = ["type", "is_active"]
    http_method_names = ["get", "post", "patch", "head", "options"]  # deactivate, never delete
    queryset = (
        LoanProduct.objects.select_related("late_fee_policy")
        .prefetch_related("charges")
        .order_by("name")
    )


class ProductChargeViewSet(viewsets.ModelViewSet):
    serializer_class = ProductChargeSerializer
    permission_classes = [IsCompanyManagerOrReadOnly, CompanyNotSuspendedOrReadOnly]
    filterset_fields = ["product"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    queryset = ProductCharge.objects.order_by("name")


class SimulateView(APIView):
    """P25: the server quotes; the screen only displays (doc 01, principle 3)."""

    permission_classes = [CanSimulate]

    def post(self, request: Request) -> Response:
        serializer = SimulationRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            result = simulator.simulate(
                product=data["product"],
                amount=data["amount"],
                installments=data["installments"],
                frequency=data["frequency"],
                rate=data.get("rate"),
                first_due=data.get("first_due"),
            )
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict) from exc
        # Money travels as strings, never floats (doc 01: exact money).
        return Response(
            {
                "principal": str(result.principal),
                "requested_amount": str(result.requested_amount),
                "net_disbursed": str(result.net_disbursed),
                "periodic_rate": str(result.periodic_rate),
                "monthly_rate": str(result.monthly_rate),
                "annual_rate": str(result.annual_rate),
                "total_interest": str(result.total_interest),
                "total_charges": str(result.total_charges),
                "total_to_pay": str(result.total_to_pay),
                "charges": [
                    {"name": line.name, "mode": line.mode, "amount": str(line.amount)}
                    for line in result.charges
                ],
                "schedule": [
                    {
                        "number": row.number,
                        "due_date": row.due_date.isoformat(),
                        "original_due_date": row.original_due_date.isoformat(),
                        "principal": str(row.principal),
                        "interest": str(row.interest),
                        "total": str(row.total),
                    }
                    for row in result.schedule
                ],
            }
        )
