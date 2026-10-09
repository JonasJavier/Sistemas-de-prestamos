"""F13 · Castigo (decision 094): the suggestions and the manager's action."""

from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.accounts.reauth import confirm_identity
from apps.core.api.errors import fail
from apps.core.models import Reason
from apps.customers.access import scope_loans
from apps.lending.models import Loan
from apps.payments import write_off
from apps.payments.services import PaymentError

CanWriteOff = role_required(authz.GERENTE, read_any=False, read_roles=(authz.AUDITORIA,))


class WriteOffSerializer(serializers.Serializer):
    reason = serializers.PrimaryKeyRelatedField(
        queryset=Reason.objects.filter(kind=Reason.Kind.WRITE_OFF, is_active=True)
    )
    note = serializers.CharField(max_length=1000)
    second_factor = serializers.CharField(max_length=128, required=False, allow_blank=True)


class SuggestedView(APIView):
    permission_classes = [CanWriteOff]

    def get(self, request: Request) -> Response:
        return Response(
            [
                {
                    "number": loan.number,
                    "customer": loan.customer.display_name,
                    "days_past_due": loan.days_past_due,
                    "principal_outstanding": str(loan.principal_outstanding),
                    "last_payment_on": loan.last_payment_on,
                }
                for loan in write_off.suggested(request.user)[:200]
            ]
        )


class WriteOffView(APIView):
    permission_classes = [CanWriteOff]

    def post(self, request: Request, number: str) -> Response:
        loan = get_object_or_404(scope_loans(Loan.objects.all(), request.user), number=number)
        serializer = WriteOffSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        # Doc 06 §6: writing a loan off asks for the second factor again.
        if not confirm_identity(request.user, data.get("second_factor", "")):
            return Response(
                {"detail": "El código de verificación no es válido.", "code": "second_factor"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            loan = write_off.write_off(
                loan=loan, user=request.user, reason=data["reason"], note=data["note"]
            )
        except PaymentError as exc:
            return fail(exc)
        return Response({"number": loan.number, "status": loan.status})
