"""Session rules (doc 06 - section 6) and mandatory 2FA (decision 034).

``SessionTimeoutMiddleware``: a session closes after
``SESSION_COOKIE_AGE`` seconds without requests (30 minutes) and after
``SESSION_ABSOLUTE_SECONDS`` in any case (12 hours).

``MFARequiredMiddleware``: when ``REQUIRE_MFA`` is on, an authenticated
user without an activated TOTP authenticator can only reach the endpoints
needed to set one up (the allauth auth/MFA endpoints, CSRF and /yo).
Everything else answers 403 with code ``mfa_required`` and the SPA routes
them to Mi cuenta.
"""

import time
from collections.abc import Callable

from django.conf import settings
from django.contrib.auth import logout
from django.http import HttpRequest, HttpResponse, JsonResponse

SESSION_STARTED = "cobradia_started_at"
SESSION_SEEN = "cobradia_seen_at"
TOUCH_EVERY_SECONDS = 60


class SessionTimeoutMiddleware:
    """Sliding inactivity window plus an absolute cap on every session.

    Saving the session renews its expiry; it is saved at most once a minute
    so an active user is never cut off and the session store is not written
    on every request. Must run after AuthenticationMiddleware and before
    anything that reads ``request.user`` for the tenant.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if request.user.is_authenticated:
            now = int(time.time())
            session = request.session
            started = session.get(SESSION_STARTED)
            if started is None:
                session[SESSION_STARTED] = now
            elif now - started > settings.SESSION_ABSOLUTE_SECONDS:
                logout(request)
                return self.get_response(request)
            if now - session.get(SESSION_SEEN, 0) >= TOUCH_EVERY_SECONDS:
                session[SESSION_SEEN] = now
        return self.get_response(request)


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
