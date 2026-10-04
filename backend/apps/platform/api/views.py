from allauth.account.models import EmailAddress
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.models import Company
from apps.platform import services
from apps.platform.api.permissions import IsPlatformAdmin
from apps.platform.api.serializers import (
    CompanySerializer,
    MyCompanySerializer,
    RegistrationSerializer,
    StatusChangeSerializer,
)


class RegistrationView(APIView):
    """Public company signup (F19). Heavily throttled; email must be verified."""

    permission_classes = [AllowAny]
    authentication_classes: list[type] = []
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "registration"

    def post(self, request: Request) -> Response:
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        result = services.register_company(
            legal_name=data["company_legal_name"],
            trade_name=data["company_trade_name"],
            rnc=data["rnc"],
            phone=data["phone"],
            admin_email=data["email"],
            admin_password=data["password"],
            admin_first_name=data["first_name"],
            admin_last_name=data["last_name"],
        )
        address = EmailAddress.objects.add_email(
            request, result.admin, result.admin.email, confirm=True, signup=True
        )
        address.set_as_primary()
        return Response(
            {
                "company_id": str(result.company.id),
                "trial_ends_on": result.company.trial_ends_on,
                "detail": "Revisa tu correo para confirmar la cuenta.",
            },
            status=status.HTTP_201_CREATED,
        )


class CompanyViewSet(viewsets.ReadOnlyModelViewSet):
    """The owner's company panel (PT1): lifecycle only, no business data (046)."""

    permission_classes = [IsPlatformAdmin]
    serializer_class = CompanySerializer
    queryset = Company.objects.select_related("subscription__plan").order_by("-created_at")
    filterset_fields = ["status"]

    @action(detail=True, methods=["post"])
    def suspend(self, request: Request, pk: str | None = None) -> Response:
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = self.get_object()
        company.status = Company.Status.SUSPENDED
        company.status_reason = serializer.validated_data["reason"]
        company.save(update_fields=["status", "status_reason", "updated_at"])
        return Response(CompanySerializer(company).data)

    @action(detail=True, methods=["post"])
    def reactivate(self, request: Request, pk: str | None = None) -> Response:
        serializer = StatusChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        company = self.get_object()
        company.status = Company.Status.ACTIVE
        company.status_reason = serializer.validated_data["reason"]
        company.save(update_fields=["status", "status_reason", "updated_at"])
        return Response(CompanySerializer(company).data)


class MyCompanyView(APIView):
    """A tenant reads its own company and subscription (P83)."""

    permission_classes = [IsAuthenticated]

    def get(self, request: Request) -> Response:
        company_id = getattr(request.user, "company_id", None)
        if company_id is None:
            return Response(status=status.HTTP_404_NOT_FOUND)
        company = Company.objects.select_related("subscription__plan").get(pk=company_id)
        data = MyCompanySerializer(company).data
        if company.trial_ends_on:
            data["trial_days_left"] = max(
                (company.trial_ends_on - timezone.localdate()).days, 0
            )
        return Response(data)
