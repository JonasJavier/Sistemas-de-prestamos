"""Setting up the authenticator app (decisions 034 and 117).

allauth's headless API makes up a new secret every time the setup is read.
Reopening Mi cuenta (or a second tab) silently replaced the code the person
had already scanned, and the right six digits were refused from then on.
Here the setup keeps the secret of the session until it is activated.
"""

from typing import Any

from allauth.headless.mfa import response
from allauth.headless.mfa import views as mfa_views
from allauth.mfa.adapter import get_adapter
from allauth.mfa.totp.internal import auth as totp_auth
from django.http import HttpRequest, HttpResponse


class ManageTOTPView(mfa_views.ManageTOTPView):
    def get(self, request: HttpRequest, *args: Any, **kwargs: Any) -> HttpResponse:
        if self._get_authenticator() is not None:
            return super().get(request, *args, **kwargs)
        error = mfa_views._validate_can_add_authenticator(request)  # noqa: SLF001
        if error:
            return error
        secret = totp_auth.get_totp_secret(regenerate=False)
        url = get_adapter().build_totp_url(request.user, secret)
        return response.TOTPNotFoundResponse(request, secret, url)
