"""Development-only helpers; never imported by the production settings.

Launchers move Vite off 5173 when another project holds that port, so the
browser's Origin can be any local port. Both CSRF checks (Django's
middleware and DRF's session authentication) trust a loopback Origin; the
CSRF token itself is still required.
"""

import re

from django.middleware.csrf import CsrfViewMiddleware
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck

from apps.accounts.authentication import SessionAuthentication

LOOPBACK_ORIGIN = re.compile(r"http://(localhost|127\.0\.0\.1):\d{2,5}")


def _loopback(request) -> bool:
    return bool(LOOPBACK_ORIGIN.fullmatch(request.META.get("HTTP_ORIGIN", "")))


class LoopbackCsrfMiddleware(CsrfViewMiddleware):
    def _origin_verified(self, request) -> bool:
        return _loopback(request) or super()._origin_verified(request)


class _LoopbackCSRFCheck(CSRFCheck):
    def _origin_verified(self, request) -> bool:
        return _loopback(request) or super()._origin_verified(request)


class LoopbackSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request) -> None:
        check = _LoopbackCSRFCheck(lambda request: None)
        check.process_request(request)
        reason = check.process_view(request, None, (), {})
        if reason:
            raise exceptions.PermissionDenied(f"CSRF Failed: {reason}")
