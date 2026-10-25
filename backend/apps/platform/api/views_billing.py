"""Decision 125: the subscription paid by transfer, with a receipt the
owner confirms. The company's side under /mi-empresa/pago/, the owner's
under /plataforma/."""

from django.db import transaction
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.models import Company
from apps.platform import billing
from apps.platform.api.permissions import IsPlatformAdmin
from apps.platform.api.serializers import (
    BankAccountSerializer,
    PaymentProofSerializer,
    PaymentProofUploadSerializer,
)
from apps.platform.models import BankAccount, PaymentProof

CanPay = role_required(authz.GERENTE, authz.ADMINISTRADOR, read_any=False)


def _file_response(proof: PaymentProof) -> FileResponse:
    return FileResponse(proof.file.open("rb"), content_type=proof.content_type, as_attachment=False)


class CompanyPaymentView(APIView):
    """Suscripción: the accounts to transfer to and the receipts sent."""

    permission_classes = [IsAuthenticated, CanPay]

    def get(self, request: Request) -> Response:
        company_id = request.user.company_id
        accounts = BankAccount.objects.filter(is_active=True)
        proofs = PaymentProof.objects.filter(company_id=company_id).select_related("plan")[:20]
        return Response(
            {
                "accounts": BankAccountSerializer(accounts, many=True).data,
                "proofs": PaymentProofSerializer(proofs, many=True).data,
            }
        )


class CompanyProofView(APIView):
    permission_classes = [IsAuthenticated, CanPay]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request) -> Response:
        serializer = PaymentProofUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        company = Company.objects.get(pk=request.user.company_id)
        try:
            proof = billing.submit_proof(
                company=company,
                by=request.user,
                plan=data["plan"],
                period=data["period"],
                amount=data["amount"],
                reference=data["reference"],
                note=data["note"],
                file=data["file"],
                content_type=data["content_type"],
                size=data["size"],
            )
        except billing.BillingError as exc:
            raise ValidationError({"detail": exc.message}) from exc
        return Response(PaymentProofSerializer(proof).data, status=status.HTTP_201_CREATED)


class CompanyProofFileView(APIView):
    permission_classes = [IsAuthenticated, CanPay]

    def get(self, request: Request, pk) -> FileResponse:
        proof = get_object_or_404(PaymentProof, pk=pk, company_id=request.user.company_id)
        return _file_response(proof)


class ProofViewSet(viewsets.ReadOnlyModelViewSet):
    """The owner: every receipt, the pending ones first; confirm or reject."""

    permission_classes = [IsPlatformAdmin]
    serializer_class = PaymentProofSerializer
    filterset_fields = ["status", "company"]
    queryset = PaymentProof.objects.select_related("plan", "company", "submitted_by")

    @action(detail=True, methods=["get"], url_path="archivo")
    def file(self, request: Request, pk=None) -> FileResponse:
        return _file_response(self.get_object())

    @action(detail=True, methods=["post"], url_path="confirmar")
    def confirm(self, request: Request, pk=None) -> Response:
        try:
            with transaction.atomic():
                proof = billing.confirm_proof(proof=self.get_object(), by=request.user)
        except billing.BillingError as exc:
            raise ValidationError({"detail": exc.message}) from exc
        return Response(PaymentProofSerializer(proof).data)

    @action(detail=True, methods=["post"], url_path="rechazar")
    def reject(self, request: Request, pk=None) -> Response:
        try:
            proof = billing.reject_proof(
                proof=self.get_object(), by=request.user, reason=str(request.data.get("reason", ""))
            )
        except billing.BillingError as exc:
            raise ValidationError({"detail": exc.message}) from exc
        return Response(PaymentProofSerializer(proof).data)


class BankAccountViewSet(viewsets.ModelViewSet):
    """The owner keeps the accounts the companies transfer to."""

    permission_classes = [IsPlatformAdmin]
    serializer_class = BankAccountSerializer
    pagination_class = None
    queryset = BankAccount.objects.all()
