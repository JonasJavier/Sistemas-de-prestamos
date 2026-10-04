from rest_framework.permissions import BasePermission
from rest_framework.request import Request
from rest_framework.views import APIView


class IsPlatformAdmin(BasePermission):
    """Only the Cobradia owner account(s); no tenant user ever passes."""

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "is_platform_admin", False)
        )
