from django.db.models import Q
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.customers.access import scope_customers, scope_loans
from apps.customers.api.serializers import CustomerListSerializer
from apps.customers.models import Customer
from apps.customers.search import search_customers

LOAN_READERS = (
    authz.GERENTE,
    authz.SUPERVISOR,
    authz.OFICIAL,
    authz.CAJERO,
    authz.COBRADOR,
    authz.CONTABILIDAD,
    authz.AUDITORIA,
)


def _loans(request: Request, q: str) -> list[dict]:
    """Loans by number or borrower, under the same scope as P31."""
    from apps.lending.models import Loan

    user = request.user
    if not authz.has_any_role(user, *LOAN_READERS):
        return []
    loans = Loan.objects.select_related("customer").filter(
        Q(number__icontains=q)
        | Q(customer__first_name__unaccent__icontains=q)
        | Q(customer__last_name__unaccent__icontains=q)
        | Q(customer__legal_name__unaccent__icontains=q)
    )
    loans = scope_loans(loans, user)
    return [
        {
            "number": loan.number,
            "customer_name": loan.customer.display_name,
            "status": loan.status,
            "principal_outstanding": str(loan.principal_outstanding),
        }
        for loan in loans.order_by("-disbursed_on")[:5]
    ]


class GlobalSearchView(APIView):
    """Ctrl+K (decision 017): customers and loans."""

    def get(self, request: Request) -> Response:
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"customers": [], "loans": []})
        customers = search_customers(
            q,
            scope_customers(
                Customer.objects.select_related("home_branch").order_by("-created_at"),
                request.user,
            ),
        )[:5]
        return Response(
            {
                "customers": CustomerListSerializer(customers, many=True).data,
                "loans": _loans(request, q),
            }
        )
