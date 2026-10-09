"""PT4 «Modo soporte» (decision 046, built in phase 7 as decision 091).

The platform owner helps a company through a temporary grant with a
reason and an end (72 hours by default, a week at most). Entering it
binds the owner's session to that company with the «Auditoría» lens and
**read-only**: the middleware refuses every write, every screen read is
logged as a sensitive read, and the company sees the grant (and may
revoke it) in Ajustes.
"""

import datetime as dt
from uuid import UUID

from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.platform.models import SupportAccessGrant

SESSION_KEY = "cobradia_support_grant"
DEFAULT_HOURS = 72
MAX_HOURS = 168


class SupportError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def is_active(grant: SupportAccessGrant, now: dt.datetime | None = None) -> bool:
    now = now or timezone.now()
    return grant.revoked_at is None and grant.starts_at <= now < grant.ends_at


def _tell_the_company(company_id: UUID, text: str, *, event: str, grant, actor) -> None:
    from apps.audit.models import record_event
    from apps.notifications.models import Notification
    from apps.notifications.services import managers, notify

    with company_context(company_id):
        record_event(
            company_id=company_id, type=event, target=grant, actor=actor, summary=text[:300]
        )
        notify(
            company_id=company_id,
            users=managers(),
            kind=Notification.Kind.SUPPORT_ACCESS,
            text=text,
            link="/ajustes/empresa",
        )


def grant(*, company: Company, admin: User, reason: str, hours: int = DEFAULT_HOURS):
    if not admin.is_platform_admin:
        raise SupportError("Solo el dueño de la plataforma da soporte.", "forbidden")
    if not reason.strip():
        raise SupportError("Escribe el motivo del acceso de soporte.", "reason")
    if not 1 <= hours <= MAX_HOURS:
        raise SupportError(f"La duración va de 1 a {MAX_HOURS} horas.", "hours")
    if company.status == Company.Status.CLOSED:
        raise SupportError("Esa empresa está cerrada.", "closed")
    now = timezone.now()
    access = SupportAccessGrant.objects.create(
        company=company,
        granted_to=admin,
        reason=reason.strip()[:300],
        starts_at=now,
        ends_at=now + dt.timedelta(hours=hours),
    )
    until = timezone.localtime(access.ends_at)
    _tell_the_company(
        company.id,
        f"Soporte de Cobradía tiene acceso de lectura hasta el {until:%d/%m/%Y %H:%M}. "
        f"Motivo: {access.reason}",
        event="support.granted",
        grant=access,
        actor=None,
    )
    return access


def revoke(*, access: SupportAccessGrant, user: User) -> SupportAccessGrant:
    """The owner, or the company's manager, ends the access early."""
    own_company = user.company_id == access.company_id and authz.has_any_role(
        user, authz.GERENTE, authz.ADMINISTRADOR
    )
    if not (user.is_platform_admin or own_company):
        raise SupportError("No puedes revocar este acceso.", "forbidden")
    if not is_active(access):
        raise SupportError("Ese acceso ya terminó.", "ended")
    access.revoked_at = timezone.now()
    access.save(update_fields=["revoked_at", "updated_at"])
    who = (
        "el dueño de la plataforma"
        if user.is_platform_admin
        else (user.get_full_name() or user.email)
    )
    _tell_the_company(
        access.company_id,
        f"El acceso de soporte de Cobradía fue revocado por {who}.",
        event="support.revoked",
        grant=access,
        actor=None if user.is_platform_admin else user,
    )
    return access


def enter(request, access: SupportAccessGrant) -> None:
    if not request.user.is_platform_admin or access.granted_to_id != request.user.pk:
        raise SupportError("Ese acceso no es tuyo.", "forbidden")
    if not is_active(access):
        raise SupportError("Ese acceso ya terminó.", "ended")
    request.session[SESSION_KEY] = str(access.id)


def leave(request) -> None:
    request.session.pop(SESSION_KEY, None)


def current(request) -> SupportAccessGrant | None:
    """The grant this platform session is inside of, if still valid."""
    user = request.user
    if not (user.is_authenticated and getattr(user, "is_platform_admin", False)):
        return None
    grant_id = request.session.get(SESSION_KEY)
    if not grant_id:
        return None
    access = (
        SupportAccessGrant.objects.select_related("company")
        .filter(pk=grant_id, granted_to=user)
        .first()
    )
    if access is None or not is_active(access):
        request.session.pop(SESSION_KEY, None)
        return None
    return access
