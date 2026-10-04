"""Cross-cutting API permissions tied to the tenant lifecycle (F19)."""

from typing import TYPE_CHECKING

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.core.models import Company

if TYPE_CHECKING:  # avoid importing DRF views while settings load (circular import)
    from rest_framework.request import Request
    from rest_framework.views import APIView

BLOCKED_STATUSES = {Company.Status.SUSPENDED, Company.Status.CLOSED}


class CompanyNotSuspendedOrReadOnly(BasePermission):
    """A suspended company keeps read access but cannot operate (F19 step 3)."""

    message = "La empresa está suspendida: puedes consultar y exportar, pero no operar."

    def has_permission(self, request: Request, view: APIView) -> bool:
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return True  # authentication itself is another permission's job
        company_id = getattr(user, "company_id", None)
        if company_id is None:
            return True  # the platform owner has no tenant
        status = getattr(request, "_company_status", None)
        if status is None:
            status = (
                Company.objects.only("status").get(pk=company_id).status
            )
            request._company_status = status  # noqa: SLF001 - request-local cache
        return status not in BLOCKED_STATUSES
