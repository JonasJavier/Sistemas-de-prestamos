"""Mandatory 2FA enforcement (decision 034).

When ``REQUIRE_MFA`` is on, an authenticated user without an activated
TOTP authenticator can only reach the endpoints needed to set one up
(the allauth auth/MFA endpoints, CSRF and /yo). Everything else answers
403 with code ``mfa_required`` and the SPA routes them to Mi cuenta.
"""

from collections.abc import Callable

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse

EXEMPT_PREFIXES = (
    "/api/v1/auth/",  # allauth headless: session, login, 2FA activation
    "/api/v1/csrf/",
    "/api/v1/yo/",  # the SPA needs it to know it must redirect
)


class MFARequiredMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if (
            settings.REQUIRE_MFA
            and request.path.startswith("/api/")
            and not request.path.startswith(EXEMPT_PREFIXES)
            and request.user.is_authenticated
            and not self._has_totp(request)
        ):
            return JsonResponse(
                {
                    "detail": "Activa la verificación en dos pasos para continuar.",
                    "code": "mfa_required",
                },
                status=403,
            )
        return self.get_response(request)

    @staticmethod
    def _has_totp(request: HttpRequest) -> bool:
        from allauth.mfa.models import Authenticator

        cached = getattr(request, "_has_totp", None)
        if cached is None:
            cached = Authenticator.objects.filter(
                user=request.user, type=Authenticator.Type.TOTP
            ).exists()
            request._has_totp = cached  # noqa: SLF001 - request-local cache
        return cached
