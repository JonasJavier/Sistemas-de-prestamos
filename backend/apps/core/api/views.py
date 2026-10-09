from django.conf import settings
from django.core.cache import cache
from django.db import connection
from django.http import HttpRequest, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET


@require_GET
def csrf(request: HttpRequest) -> JsonResponse:
    """Hands the SPA a CSRF token (and sets the cookie) before unsafe calls."""
    return JsonResponse({"csrfToken": get_token(request)})


@require_GET
def health(request: HttpRequest) -> JsonResponse:
    """For the external uptime check (doc 10 - 3): the database and Redis
    answer. Says nothing about companies or data."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
        cache.set("health", "ok", 10)
        if cache.get("health") != "ok":
            raise RuntimeError("cache")
    except Exception:  # noqa: BLE001 - any failure is «not healthy»
        return JsonResponse({"status": "error"}, status=503)
    return JsonResponse({"status": "ok", "version": settings.APP_VERSION})
