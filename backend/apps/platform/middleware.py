"""PT4 (decision 091): inside a support grant everything is read-only and
every screen read is logged for the company to see."""

from collections.abc import Callable

from django.http import HttpRequest, HttpResponse, JsonResponse

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
# Signing out, the CSRF cookie and leaving the support mode still work.
WRITABLE_PREFIXES = ("/api/v1/auth/", "/api/v1/csrf/", "/api/v1/plataforma/soporte/salir/")
# Polled or framing endpoints: not a «screen» the support person opened.
UNLOGGED_PREFIXES = ("/api/v1/yo/", "/api/v1/csrf/", "/api/v1/auth/", "/api/v1/avisos/")


class SupportReadOnlyMiddleware:
    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        access = getattr(request, "support_grant", None)
        if access is None or not request.path.startswith("/api/"):
            return self.get_response(request)
        if request.method not in SAFE_METHODS and not request.path.startswith(WRITABLE_PREFIXES):
            return JsonResponse(
                {
                    "detail": "Modo soporte: solo lectura. No se puede registrar ni cambiar nada.",
                    "code": "support_read_only",
                },
                status=403,
            )
        if request.method == "GET" and not request.path.startswith(UNLOGGED_PREFIXES):
            from apps.audit.models import SensitiveAccessLog

            query = request.META.get("QUERY_STRING", "")
            SensitiveAccessLog.objects.create(
                company_id=access.company_id,
                user=request.user,
                action=SensitiveAccessLog.Action.SUPPORT_READ,
                target_type="platform.supportaccessgrant",
                target_id=access.id,
                detail=(request.path + (f"?{query}" if query else ""))[:300],
            )
        return self.get_response(request)
