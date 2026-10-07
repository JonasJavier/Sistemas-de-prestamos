"""DRF authentication for the SPA: Django session cookie plus CSRF."""

from rest_framework import authentication
from rest_framework.request import Request


class SessionAuthentication(authentication.SessionAuthentication):
    """Same as DRF's, but an anonymous call answers 401 instead of 403.

    DRF only sends 401 when the scheme names a ``WWW-Authenticate`` value;
    with it, the SPA reads 401 as «tu sesión se cerró» and 403 as «no
    tienes permiso» (doc 06 - section 6).
    """

    def authenticate_header(self, request: Request) -> str:
        return 'Session realm="api"'
