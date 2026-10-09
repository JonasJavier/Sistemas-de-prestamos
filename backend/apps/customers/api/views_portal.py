"""P92–P93 · Portal del cliente (decision 099): the staff's invitation and
the customer's own API, which never uses a staff session."""

from django.db import transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.authentication import BaseAuthentication, SessionAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.settings import api_settings
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.core.models import Company
from apps.core.qr import public_url
from apps.core.tenancy import company_context
from apps.customers import portal
from apps.customers.access import scope_customers
from apps.customers.models import Customer
from apps.lending.models import Loan

CanInvite = role_required(
    authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL, authz.CAJERO, read_any=False
)


def _fail(exc: portal.PortalError) -> Response:
    return Response({"detail": exc.message, "code": exc.code}, status=status.HTTP_400_BAD_REQUEST)


class InviteView(APIView):
    """Staff: send (or re-send) the customer's personal portal link, or
    revoke it."""

    permission_classes = [CanInvite]

    def _customer(self, request: Request, pk) -> Customer:
        return get_object_or_404(scope_customers(Customer.objects.all(), request.user), pk=pk)

    def post(self, request: Request, pk) -> Response:
        link = portal.invite(customer=self._customer(request, pk), user=request.user)
        # Shown too, to share by hand when no message can reach the customer.
        return Response(
            {"link": public_url(f"/portal/entrar?t={link.token}")},
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request: Request, pk) -> Response:
        portal.revoke(customer=self._customer(request, pk), user=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class PortalCsrf(BaseAuthentication):
    """No staff identity on the portal, but the same CSRF check as the
    staff's session (whatever the settings configure), answered in JSON."""

    def authenticate(self, request: Request) -> None:
        session = next(
            cls
            for cls in api_settings.DEFAULT_AUTHENTICATION_CLASSES
            if issubclass(cls, SessionAuthentication)
        )
        session().enforce_csrf(request)
        return None


class PortalPublicView(APIView):
    """The portal keeps its own key in the session (decision 099)."""

    authentication_classes = [PortalCsrf]
    permission_classes = [AllowAny]


class CodeView(PortalPublicView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "portal"

    def post(self, request: Request) -> Response:
        try:
            return Response(portal.request_code(str(request.data.get("token", ""))))
        except portal.PortalError as exc:
            return _fail(exc)


class EnterView(PortalPublicView):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "portal"

    def post(self, request: Request) -> Response:
        token = str(request.data.get("token", ""))
        try:
            customer = portal.enter(request, token, str(request.data.get("code", "")))
        except portal.PortalError as exc:
            return _fail(exc)
        return Response({"customer": customer.display_name})


class LeaveView(PortalPublicView):
    def post(self, request: Request) -> Response:
        portal.leave(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


@method_decorator(transaction.non_atomic_requests, name="dispatch")
class PortalSessionView(PortalPublicView):
    """Runs inside the customer's company and only for that customer. Like
    the tenant middleware, the company context wraps the transaction, so a
    rolled-back request (a 404) can still leave the context cleanly."""

    customer: Customer
    company: Company

    def dispatch(self, request, *args, **kwargs):
        session = portal.current(request)
        if session is None:
            return JsonResponse(
                {"detail": "Tu sesión del portal terminó: entra de nuevo.", "code": "portal"},
                status=401,
            )
        company_id, customer_id = session
        with company_context(company_id), transaction.atomic():
            self.company = Company.objects.get(pk=company_id)
            self.customer = Customer.objects.get(pk=customer_id)
            return super().dispatch(request, *args, **kwargs)

    def loans(self):
        return (
            Loan.objects.filter(customer=self.customer)
            .exclude(status=Loan.Status.VOIDED)
            .select_related("product")
        )


def _loan_row(loan: Loan) -> dict:
    return {
        "number": loan.number,
        "product": loan.product.name,
        "status": loan.status,
        "status_label": loan.get_status_display(),
        "principal": str(loan.principal),
        "principal_outstanding": str(loan.principal_outstanding),
        "late_fee_outstanding": str(loan.late_fee_outstanding),
        "days_past_due": loan.days_past_due,
        "next_due_date": loan.next_due_date,
        "disbursed_on": loan.disbursed_on,
    }


class MeView(PortalSessionView):
    def get(self, request: Request) -> Response:
        return Response(
            {
                "customer": self.customer.display_name,
                "company": str(self.company),
                "phone": self.company.phone,
                "loans": [_loan_row(loan) for loan in self.loans().order_by("-disbursed_on")],
            }
        )


class LoanView(PortalSessionView):
    def get(self, request: Request, number: str) -> Response:
        from apps.payments import portfolio
        from apps.payments.models import Payment

        loan = get_object_or_404(self.loans(), number=number)
        lines = portfolio.position(loan, timezone.localdate())
        payments = Payment.objects.filter(loan=loan).order_by("-paid_at")
        return Response(
            {
                **_loan_row(loan),
                "installments": [
                    {
                        "number": line.installment.number,
                        "due_date": line.installment.due_date,
                        "total": str(line.installment.total_due),
                        "owed": str(line.total),
                        "late_fee": str(line.late_fee),
                        "days_late": line.days_late,
                        "status": line.installment.status,
                        "status_label": line.installment.get_status_display(),
                    }
                    for line in lines
                ],
                "payments": [
                    {
                        "number": payment.number,
                        "date": payment.value_date,
                        "amount": str(payment.amount),
                        "reversed": payment.status == Payment.Status.REVERSED,
                        "receipt_path": None
                        if payment.receipt_revoked_at
                        else f"/r/{payment.receipt_token}",
                    }
                    for payment in payments
                ],
            }
        )


class StatementView(PortalSessionView):
    """The «estado de cuenta» of today, issued and registered like any other."""

    def get(self, request: Request, number: str) -> HttpResponse:
        from apps.documents.services import issue_account_statement

        loan = get_object_or_404(self.loans(), number=number)
        document = issue_account_statement(loan, issued_by=None)
        with document.file.open("rb") as handle:
            response = HttpResponse(handle.read(), content_type="application/pdf")
        response["Content-Disposition"] = f'inline; filename="{document.folio}.pdf"'
        return response
