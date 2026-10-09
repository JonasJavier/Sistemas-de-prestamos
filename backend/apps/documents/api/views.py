"""P91 «Verificar documento» (decision 098): what a QR proves, publicly.

Only what confirms authenticity — the kind, the folio, the company, when
it was issued and its fingerprint — never the document's content."""

from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.models import Company, PublicLink
from apps.core.tenancy import company_context


class VerifyView(APIView):
    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "public_receipt"

    def get(self, request: Request, token: str) -> Response:
        link = PublicLink.objects.filter(token=token).first()
        if link is None:
            return Response(
                {"valid": False, "detail": "Este código no corresponde a ningún documento."},
                status=404,
            )
        company = Company.objects.get(pk=link.tenant)
        data = {"valid": link.revoked_at is None, "company": str(company)}
        with company_context(link.tenant):
            if link.kind == PublicLink.Kind.DOCUMENT:
                from apps.documents.models import GeneratedDocument

                document = GeneratedDocument.objects.filter(pk=link.object_id).first()
                if document is None:
                    return Response({"valid": False, "detail": "Documento no encontrado."}, 404)
                data.update(
                    {
                        "kind": "document",
                        "label": document.get_kind_display(),
                        "folio": document.folio,
                        "issued_at": document.created_at,
                        "fingerprint": document.sha256[:16],
                        "legal_status": document.legal_status,
                    }
                )
            else:
                from apps.payments.models import Payment

                payment = Payment.objects.filter(pk=link.object_id).first()
                if payment is None:
                    return Response({"valid": False, "detail": "Recibo no encontrado."}, 404)
                data.update(
                    {
                        "kind": "receipt",
                        "label": "Recibo de pago",
                        "folio": payment.number,
                        "issued_at": payment.paid_at,
                        "amount": str(payment.amount),
                        "reversed": payment.status == Payment.Status.REVERSED,
                    }
                )
        return Response(data)
