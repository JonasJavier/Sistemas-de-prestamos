"""Customer sub-resources: income data, relatives, references, private
files (audited downloads + 5-minute links) and collateral (P22, P24).
"""

from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import FileResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.api.permissions import role_required
from apps.audit.models import SensitiveAccessLog
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.customers.access import scope_customers
from apps.customers.api.serializers import (
    BusinessSerializer,
    CollateralFileSerializer,
    CollateralSerializer,
    CustomerFileSerializer,
    EmploymentSerializer,
    ReferenceSerializer,
    ReferenceVerifySerializer,
    RelativeSerializer,
)
from apps.customers.models import (
    Business,
    Collateral,
    CollateralFile,
    Customer,
    CustomerFile,
    Employment,
    Reference,
    Relative,
)

CanEditCustomers = role_required("Gerente", "Supervisor", "Oficial de crédito")
# Doc 06 matrix: ver archivos (cédula, ingresos) -> G, Su, O, Ca (+ auditoría later).
CanViewFiles = role_required(
    "Gerente", "Supervisor", "Oficial de crédito", "Cajero", read_any=False
)

FILE_LINK_MAX_AGE = 5 * 60  # doc 06 - section 7: links expire in 5 minutes
_signer = TimestampSigner(salt="customer-file-link")


class _CustomerChildViewSet(viewsets.ModelViewSet):
    permission_classes = [CanEditCustomers, CompanyNotSuspendedOrReadOnly]
    filterset_fields = ["customer"]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    customer_field = "customer"

    def get_queryset(self):
        return scope_customers(super().get_queryset(), self.request.user, field=self.customer_field)


class RelativeViewSet(_CustomerChildViewSet):
    serializer_class = RelativeSerializer
    queryset = Relative.objects.order_by("created_at")


class ReferenceViewSet(_CustomerChildViewSet):
    serializer_class = ReferenceSerializer
    queryset = Reference.objects.select_related("verified_by").order_by("created_at")
    http_method_names = ["get", "post", "patch", "head", "options"]  # no delete: keeps the trail

    @action(detail=True, methods=["post"])
    def verify(self, request: Request, pk: str | None = None) -> Response:
        serializer = ReferenceVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reference = self.get_object()
        reference.verified_by = request.user
        reference.verified_at = timezone.now()
        reference.verification_result = serializer.validated_data["result"]
        reference.save(
            update_fields=["verified_by", "verified_at", "verification_result", "updated_at"]
        )
        return Response(ReferenceSerializer(reference).data)


class _PrivateFileViewSet(
    mixins.CreateModelMixin,
    mixins.ListModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """Shared machinery for private uploads: audited reads, 5-minute links."""

    permission_classes = [CanEditCustomers, CompanyNotSuspendedOrReadOnly]
    parser_classes = [MultiPartParser, FormParser]
    target_type = ""  # key in SIGNED_FILE_MODELS

    def _detail(self, file) -> str:
        raise NotImplementedError

    def _log(self, request: Request, file, action_kind: str) -> None:
        SensitiveAccessLog.objects.create(
            company_id=request.user.company_id,
            user=request.user,
            action=action_kind,
            target_type=self.target_type,
            target_id=file.id,
            detail=self._detail(file),
        )

    @action(detail=True, methods=["get"], permission_classes=[CanViewFiles])
    def download(self, request: Request, pk: str | None = None) -> Response:
        file = self.get_object()
        self._log(request, file, SensitiveAccessLog.Action.FILE_DOWNLOAD)
        return FileResponse(
            file.file.open("rb"), content_type=file.content_type, as_attachment=False
        )

    @action(detail=True, methods=["post"], permission_classes=[CanViewFiles])
    def link(self, request: Request, pk: str | None = None) -> Response:
        """A share/download URL that expires in 5 minutes (doc 06 - section 7)."""
        file = self.get_object()
        self._log(request, file, SensitiveAccessLog.Action.FILE_LINK)
        token = _signer.sign(f"{self.target_type}:{file.id}")
        return Response(
            {
                "url": request.build_absolute_uri(f"/api/v1/archivos/descarga/{token}/"),
                "expires_in": FILE_LINK_MAX_AGE,
            }
        )


class CustomerFileViewSet(_PrivateFileViewSet):
    serializer_class = CustomerFileSerializer
    filterset_fields = ["customer", "kind"]
    queryset = CustomerFile.objects.select_related("uploaded_by", "customer").order_by(
        "-created_at"
    )
    target_type = "customer_file"

    def get_queryset(self):
        return scope_customers(super().get_queryset(), self.request.user, field="customer")

    def _detail(self, file: CustomerFile) -> str:
        return f"{file.get_kind_display()} de {file.customer.display_name}"


class CollateralFileViewSet(_PrivateFileViewSet):
    serializer_class = CollateralFileSerializer
    filterset_fields = ["collateral", "kind"]
    queryset = CollateralFile.objects.select_related("uploaded_by", "collateral").order_by(
        "-created_at"
    )
    target_type = "collateral_file"

    def get_queryset(self):
        return scope_customers(super().get_queryset(), self.request.user, field="collateral__owner")

    def _detail(self, file: CollateralFile) -> str:
        return f"{file.get_kind_display()} de {file.collateral.description}"


SIGNED_FILE_MODELS = {
    "customer_file": CustomerFile,
    "collateral_file": CollateralFile,
}


class SignedFileDownloadView(APIView):
    """Session + signed token, both required: belt and suspenders."""

    def get(self, request: Request, token: str) -> Response:
        try:
            payload = _signer.unsign(token, max_age=FILE_LINK_MAX_AGE)
        except SignatureExpired:
            return Response(
                {"detail": "El enlace venció (dura 5 minutos). Genera uno nuevo."},
                status=status.HTTP_410_GONE,
            )
        except BadSignature:
            return Response(status=status.HTTP_404_NOT_FOUND)
        target_type, _, file_id = payload.partition(":")
        model = SIGNED_FILE_MODELS.get(target_type)
        if model is None or not file_id:
            return Response(status=status.HTTP_404_NOT_FOUND)
        try:
            file = model.objects.get(pk=file_id)  # RLS scopes it
        except model.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return FileResponse(
            file.file.open("rb"), content_type=file.content_type, as_attachment=True
        )


class CollateralViewSet(viewsets.ModelViewSet):
    serializer_class = CollateralSerializer
    permission_classes = [CanEditCustomers, CompanyNotSuspendedOrReadOnly]
    filterset_fields = ["owner", "type", "status"]
    http_method_names = ["get", "post", "patch", "head", "options"]  # status changes by flow
    queryset = Collateral.objects.select_related("owner", "vehicle", "property").order_by(
        "-created_at"
    )

    def get_queryset(self):
        return scope_customers(super().get_queryset(), self.request.user, field="owner")


class CustomerEmploymentView(APIView):
    """GET/PUT upsert for the one-to-one income records (F1 step 3)."""

    permission_classes = [CanEditCustomers, CompanyNotSuspendedOrReadOnly]
    model = Employment
    serializer_class = EmploymentSerializer

    def _customer(self, pk: str) -> Customer:
        # RLS and the branch scope: 404 if not ours (handled below).
        return scope_customers(Customer.objects.all(), self.request.user).get(pk=pk)

    def get(self, request: Request, pk: str) -> Response:
        try:
            self._customer(pk)
            record = self.model.objects.get(customer_id=pk)
        except self.model.DoesNotExist, Customer.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        return Response(self.serializer_class(record).data)

    def put(self, request: Request, pk: str) -> Response:
        try:
            customer = self._customer(pk)
        except Customer.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        instance = self.model.objects.filter(customer=customer).first()
        serializer = self.serializer_class(instance, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(customer=customer, company_id=customer.company_id)
        return Response(serializer.data)


class CustomerBusinessView(CustomerEmploymentView):
    model = Business
    serializer_class = BusinessSerializer
