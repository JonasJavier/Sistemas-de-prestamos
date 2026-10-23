"""«Mantenerme conectado» (decision 118): the choice made on the sign-in
screen becomes the rule of the session that the sign-in opens."""

import time

from allauth.account.signals import user_logged_in
from django.dispatch import receiver

from apps.accounts.middleware import (
    REMEMBER_REQUESTED,
    SESSION_REMEMBER,
    SESSION_SEEN,
    SESSION_STARTED,
)


@receiver(user_logged_in)
def apply_remember_choice(sender, request, user, **kwargs) -> None:
    session = request.session
    session[SESSION_REMEMBER] = bool(session.pop(REMEMBER_REQUESTED, False))
    session[SESSION_STARTED] = int(time.time())
    # The next request sets the expiry that goes with the choice.
    session.pop(SESSION_SEEN, None)
