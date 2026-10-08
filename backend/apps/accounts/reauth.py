"""Re-confirming who is at the keyboard before a critical action (doc 06 - 6).

With an authenticator app, a current code (or an unused recovery code);
without one — only possible where 2FA is not yet mandatory, as in
development — the user's password.
"""

from apps.accounts.models import User


def confirm_identity(user: User, secret: str) -> bool:
    from allauth.mfa.models import Authenticator  # needs the app registry

    secret = (secret or "").strip()
    if not secret:
        return False
    authenticators = list(
        Authenticator.objects.filter(
            user=user,
            type__in=[Authenticator.Type.TOTP, Authenticator.Type.RECOVERY_CODES],
        )
    )
    if any(a.type == Authenticator.Type.TOTP for a in authenticators):
        return any(a.wrap().validate_code(secret) for a in authenticators)
    return user.check_password(secret)
