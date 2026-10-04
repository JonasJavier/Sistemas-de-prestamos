from django.http import HttpRequest, JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET


@require_GET
def csrf(request: HttpRequest) -> JsonResponse:
    """Hands the SPA a CSRF token (and sets the cookie) before unsafe calls."""
    return JsonResponse({"csrfToken": get_token(request)})
