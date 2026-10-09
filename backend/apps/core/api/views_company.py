"""P70 · Empresa: the company's legal data, logo and operating defaults.

The header of every document comes from here (doc 09 - section 1), and so
do the operating knobs earlier phases left with defaults: application
validity (027), the capacity alert, the collector's cash limit (072) and the
ceiling on a loan's annual effective cost (075). The Gerente and the
Administrador edit; Contabilidad and Auditoría read.
"""

import mimetypes
from decimal import Decimal
from io import BytesIO

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.http import Http404, HttpResponse
from PIL import Image, UnidentifiedImageError
from rest_framework import serializers
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.audit.models import record_event
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.core.models import Company
from apps.customers.validators import validate_rnc

MAX_LOGO_BYTES = 1024 * 1024
LOGO_FORMATS = {"PNG", "JPEG"}


class CompanySettingsSerializer(serializers.ModelSerializer):
    # Typed with dashes or not; stored as its 9 digits.
    rnc = serializers.CharField(max_length=20, required=False, allow_blank=True)
    legal_max_effective_annual_rate = serializers.SerializerMethodField()
    has_logo = serializers.SerializerMethodField()
    remove_logo = serializers.BooleanField(write_only=True, required=False, default=False)

    class Meta:
        model = Company
        fields = [
            "legal_name",
            "trade_name",
            "rnc",
            "address",
            "phone",
            "email",
            "logo",
            "has_logo",
            "remove_logo",
            "application_validity_days",
            "capacity_alert_ratio",
            "collector_cash_limit",
            "max_effective_annual_rate",
            "legal_max_effective_annual_rate",
            "write_off_days",
        ]
        extra_kwargs = {"logo": {"write_only": True, "required": False}}

    def get_legal_max_effective_annual_rate(self, obj: Company) -> str | None:
        return settings.LEGAL_MAX_EFFECTIVE_ANNUAL_RATE

    def get_has_logo(self, obj: Company) -> bool:
        return bool(obj.logo)

    def validate_rnc(self, value: str) -> str:
        if not value:
            return value
        try:
            return validate_rnc(value)
        except Exception as exc:  # noqa: BLE001 - Django's ValidationError, re-raised for DRF
            raise serializers.ValidationError(exc.messages[0]) from exc

    def validate_logo(self, value: UploadedFile) -> UploadedFile:
        if value.size > MAX_LOGO_BYTES:
            raise serializers.ValidationError("El logo pesa más de 1 MB.")
        try:
            image = Image.open(BytesIO(value.read()))
            kind = image.format
            image.verify()
        except (UnidentifiedImageError, OSError) as exc:
            raise serializers.ValidationError("El archivo no es una imagen válida.") from exc
        finally:
            value.seek(0)
        if kind not in LOGO_FORMATS:
            raise serializers.ValidationError("El logo debe ser PNG o JPG.")
        return value

    def validate_application_validity_days(self, value: int) -> int:
        if not 1 <= value <= 90:
            raise serializers.ValidationError("Entre 1 y 90 días.")
        return value

    def validate_capacity_alert_ratio(self, value: Decimal) -> Decimal:
        if not Decimal("0.05") <= value <= 1:
            raise serializers.ValidationError("Entre el 5 % y el 100 % del ingreso.")
        return value

    def validate_collector_cash_limit(self, value: Decimal) -> Decimal:
        if value < 0:
            raise serializers.ValidationError("No puede ser negativo.")
        return value

    def validate_write_off_days(self, value: int) -> int:
        if not 90 <= value <= 720:
            raise serializers.ValidationError("Entre 90 y 720 días de atraso.")
        return value

    def validate_max_effective_annual_rate(self, value: Decimal | None) -> Decimal | None:
        if value is not None and value <= 0:
            raise serializers.ValidationError("Déjalo vacío o indica un tope mayor que cero.")
        return value

    def update(self, instance: Company, validated_data: dict) -> Company:
        if validated_data.pop("remove_logo", False) and instance.logo:
            instance.logo.delete(save=False)
        return super().update(instance, validated_data)


CanEditCompany = role_required(
    authz.GERENTE,
    authz.ADMINISTRADOR,
    read_any=False,
    read_roles=(authz.CONTABILIDAD, authz.AUDITORIA),
)


class CompanySettingsView(APIView):
    permission_classes = [CanEditCompany, CompanyNotSuspendedOrReadOnly]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _company(self, request: Request) -> Company:
        return Company.objects.get(pk=request.user.company_id)

    def get(self, request: Request) -> Response:
        return Response(CompanySettingsSerializer(self._company(request)).data)

    def patch(self, request: Request) -> Response:
        company = self._company(request)
        serializer = CompanySettingsSerializer(company, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        changed = sorted(k for k in serializer.validated_data if k != "remove_logo")
        if serializer.validated_data.get("remove_logo"):
            changed.append("logo")
        serializer.save()
        record_event(
            company_id=company.id,
            type="company.settings_changed",
            target=company,
            actor=request.user,
            summary=f"Ajustes de la empresa: {', '.join(changed) or 'sin cambios'}",
        )
        return Response(CompanySettingsSerializer(company).data)


class CompanyLogoView(APIView):
    """The logo for the screen's header preview (media is never public)."""

    permission_classes = [role_required()]

    def get(self, request: Request) -> HttpResponse:
        company = Company.objects.get(pk=request.user.company_id)
        if not company.logo:
            raise Http404
        # At most 1 MB: read it whole, no file handle outlives the request.
        with company.logo.open("rb") as handle:
            content = handle.read()
        kind = mimetypes.guess_type(company.logo.name)[0] or "application/octet-stream"
        return HttpResponse(content, content_type=kind)
