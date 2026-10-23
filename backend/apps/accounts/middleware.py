"""Session rules (doc 06 - section 6) and mandatory 2FA (decision 034).

``SessionTimeoutMiddleware``: a session closes after
``SESSION_COOKIE_AGE`` seconds without requests (30 minutes), after
``SESSION_ABSOLUTE_SECONDS`` in any case (12 hours) and when the browser
closes. With «Mantenerme conectado» (decision 118) it lasts 7 days without
use and 30 days in any case.

``MFARequiredMiddleware``: when ``REQUIRE_MFA`` is on, an authenticated
user without an authenticator app or a passkey can only reach the endpoints
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
SESSION_REMEMBER = "cobradia_remember"
# Chosen on the sign-in screen before signing in; the sign-in applies it.
REMEMBER_REQUESTED = "cobradia_remember_requested"
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
            remembered = bool(session.get(SESSION_REMEMBER))
            started = session.get(SESSION_STARTED)
            if started is None:
                session[SESSION_STARTED] = now
            elif now - started > (
                settings.SESSION_REMEMBER_ABSOLUTE_SECONDS
                if remembered
                else settings.SESSION_ABSOLUTE_SECONDS
            ):
                logout(request)
                return self.get_response(request)
            if now - session.get(SESSION_SEEN, 0) >= TOUCH_EVERY_SECONDS:
                session[SESSION_SEEN] = now
                # 0: the cookie ends with the browser; the store still keeps
                # the session only SESSION_COOKIE_AGE after the last save.
                session.set_expiry(settings.SESSION_REMEMBER_IDLE_SECONDS if remembered else 0)
        return self.get_response(request)


EXEMPT_PREFIXES = (
    "/api/v1/auth/",  # allauth headless: session, login, 2FA activation
    "/api/v1/oauth/",  # back from Google (decision 118)
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
            # Decision 121: a passkey is a second step as good as the app.
            cached = Authenticator.objects.filter(
                user=request.user,
                type__in=[Authenticator.Type.TOTP, Authenticator.Type.WEBAUTHN],
            ).exists()
            request._has_totp = cached  # noqa: SLF001 - request-local cache
        return cached


HOURS_EXEMPT_PREFIXES = ("/api/v1/auth/", "/api/v1/csrf/")


class WorkingHoursMiddleware:
    """Decision 035: outside the branch hours a cashier's or collector's
    session closes; the SPA shows why on the sign-in screen."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        user = request.user
        if (
            settings.ENFORCE_WORKING_HOURS
            and request.path.startswith("/api/")
            and not request.path.startswith(HOURS_EXEMPT_PREFIXES)
            and user.is_authenticated
            and getattr(user, "company_id", None)
        ):
            from apps.accounts.hours import outside_hours

            message = outside_hours(user)
            if message:
                logout(request)
                return JsonResponse(
                    {"detail": message, "code": "outside_hours"},
                    status=401,
                    headers={"WWW-Authenticate": 'Session realm="api"'},
                )
        return self.get_response(request)
