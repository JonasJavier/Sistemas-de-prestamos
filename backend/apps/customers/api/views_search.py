from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.customers.api.serializers import CustomerListSerializer
from apps.customers.models import Customer
from apps.customers.search import search_customers


class GlobalSearchView(APIView):
    """Ctrl+K (P10/doc 02): customers now; loans join in phase 3."""

    def get(self, request: Request) -> Response:
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"customers": []})
        customers = search_customers(
            q, Customer.objects.select_related("home_branch").order_by("-created_at")
        )[:5]
        return Response({"customers": CustomerListSerializer(customers, many=True).data})
