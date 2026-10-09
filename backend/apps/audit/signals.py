"""Sign-ins land in the access log (doc 06 §9, decision 090); password
changes and resets in the audit trail."""

from allauth.account.signals import password_changed, password_reset, user_logged_in
from django.dispatch import receiver
from django.utils import timezone

from apps.core.net import client_ip
from apps.core.tenancy import company_context


@receiver(user_logged_in)
def record_login(sender, request, user, **kwargs) -> None:
    if user.company_id is None:  # the platform owner has no tenant
        return
    from apps.accounts.hours import beyond_branch_hours
    from apps.audit.models import LoginEvent

    agent = request.META.get("HTTP_USER_AGENT", "")[:300]
    now = timezone.now()
    with company_context(user.company_id):
        known = LoginEvent.objects.filter(user=user, user_agent=agent).exists()
        first_ever = not LoginEvent.objects.filter(user=user).exists()
        LoginEvent.objects.create(
            company_id=user.company_id,
            user=user,
            at=now,
            ip=client_ip(request),
            user_agent=agent,
            # The very first sign-in has nothing to compare with: not «new».
            new_device=not known and not first_ever,
            outside_hours=beyond_branch_hours(user, now),
        )


def _record_password(user, summary: str) -> None:
    if user.company_id is None:
        return
    from apps.audit.models import record_event

    with company_context(user.company_id):
        record_event(
            company_id=user.company_id,
            type="account.password",
            target=user,
            actor=user,
            summary=summary,
        )


@receiver(password_changed)
def record_password_change(sender, request, user, **kwargs) -> None:
    _record_password(user, "Cambió su contraseña desde Mi cuenta")


@receiver(password_reset)
def record_password_reset(sender, request, user, **kwargs) -> None:
    _record_password(user, "Restableció su contraseña con el enlace del correo")
