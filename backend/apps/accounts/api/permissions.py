"""Company-level management permissions.

Interim rule until the full permission matrix lands (doc 06 - section 3):
the Ajustes screens (branches, users, invitations) belong to the company's
Gerente and Administrador roles.
"""

from typing import TYPE_CHECKING

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts.models import Membership

if TYPE_CHECKING:
    from rest_framework.request import Request
    from rest_framework.views import APIView

MANAGEMENT_ROLES = {"Gerente", "Administrador"}


def is_company_manager(request: Request) -> bool:
    cached = getattr(request, "_is_company_manager", None)
    if cached is None:
        cached = Membership.objects.filter(
            user=request.user, role__name__in=MANAGEMENT_ROLES
        ).exists()
        request._is_company_manager = cached  # noqa: SLF001 - request-local cache
    return cached


class IsCompanyManager(BasePermission):
    message = "Solo el gerente o el administrador pueden hacer esto."

    def has_permission(self, request: Request, view: APIView) -> bool:
        return bool(request.user and request.user.is_authenticated) and is_company_manager(
            request
        )


class IsCompanyManagerOrReadOnly(IsCompanyManager):
    def has_permission(self, request: Request, view: APIView) -> bool:
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return super().has_permission(request, view)
