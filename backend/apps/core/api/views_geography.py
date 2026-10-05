from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.models import Province


class ProvinceListView(APIView):
    """Platform-wide geography catalog for address forms (doc 05 - section 4.1)."""

    def get(self, request: Request) -> Response:
        provinces = Province.objects.order_by("name").values("id", "name")
        return Response([{"id": str(p["id"]), "name": p["name"]} for p in provinces])
