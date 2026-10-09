"""Company-level management permissions.

Interim rule until the full permission matrix lands (doc 06 - section 3):
the Ajustes screens (branches, users, invitations) belong to the company's
Gerente and Administrador roles.
"""

from typing import TYPE_CHECKING

from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.accounts import authz
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
        return bool(request.user and request.user.is_authenticated) and is_company_manager(request)


class IsCompanyManagerOrReadOnly(IsCompanyManager):
    def has_permission(self, request: Request, view: APIView) -> bool:
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return super().has_permission(request, view)


def role_required(
    *role_names: str, read_any: bool = True, read_roles: tuple[str, ...] = ()
) -> type[BasePermission]:
    """Permission class factory for the doc 06 matrix, one slice at a time.

    With ``read_any`` (default), any authenticated company user may read
    and only the named roles may write; without it, the roles gate reads
    too. ``read_roles`` widens reads to more roles than writes (e.g. audit
    reads what the manager edits). Membership lookups are cached per
    request and role set.
    """
    names = frozenset(role_names)
    readers = names | frozenset(read_roles)

    class RolePermission(BasePermission):
        message = "Tu rol no permite esta acción."

        def has_permission(self, request: Request, view: APIView) -> bool:
            if not (request.user and request.user.is_authenticated):
                return False
            reading = request.method in SAFE_METHODS
            if read_any and reading:
                return True
            wanted = readers if reading else names
            cache = getattr(request, "_role_cache", None)
            if cache is None:
                cache = request._role_cache = {}  # noqa: SLF001 - request-local cache
            allowed = cache.get(wanted)
            if allowed is None:
                allowed = bool(authz.role_names(request.user) & wanted)
                cache[wanted] = allowed
            return allowed

    return RolePermission
