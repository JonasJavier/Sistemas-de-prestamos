"""Working hours for cashiers and collectors (decision 035, doc 06 - 6).

Whoever only holds the Cajero and/or Cobrador roles works within the
hours of their branch; a supervisor may extend them for a while (audited).
Everybody else signs in at any hour, with everything audited.
"""

import datetime as dt

from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import HoursExtension, User
from apps.audit.models import record_event
from apps.core.models import Branch

RESTRICTED_ROLES = frozenset({authz.CAJERO, authz.COBRADOR})
DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MAX_EXTENSION = dt.timedelta(hours=6)


def is_restricted(user: User) -> bool:
    roles = authz.role_names(user)
    return bool(roles) and roles <= RESTRICTED_ROLES


def _describe(branch: Branch) -> str:
    days = sorted(branch.workdays)
    if not days:
        return "la sucursal no tiene días laborables configurados"
    span = (
        f"{DAY_NAMES[days[0]]} a {DAY_NAMES[days[-1]]}"
        if days == list(range(days[0], days[-1] + 1))
        else ", ".join(DAY_NAMES[d] for d in days)
    )
    return f"{span}, de {branch.opens_at:%H:%M} a {branch.closes_at:%H:%M}"


def outside_hours(user: User, now: dt.datetime | None = None) -> str | None:
    """None when the user may work now; otherwise the message to show."""
    if not is_restricted(user):
        return None
    now = timezone.localtime(now)
    if HoursExtension.objects.filter(user=user, until__gt=now).exists():
        return None
    branches = list(Branch.objects.filter(memberships__user=user).distinct())
    for branch in branches:
        if now.weekday() in branch.workdays and branch.opens_at <= now.time() < branch.closes_at:
            return None
    hours = _describe(branches[0]) if branches else "el horario de tu sucursal"
    return f"Fuera del horario de tu sucursal ({hours}). Pide una extensión a tu supervisor."


def beyond_branch_hours(user: User, at: dt.datetime) -> bool:
    """Whether ``at`` falls outside the hours of every branch of the user,
    whatever their roles (the fraud review, decision 090)."""
    at = timezone.localtime(at)
    branches = list(Branch.objects.filter(memberships__user=user).distinct())
    if not branches:
        return False
    return not any(
        at.weekday() in branch.workdays and branch.opens_at <= at.time() < branch.closes_at
        for branch in branches
    )


def extend(*, user: User, granted_by: User, minutes: int, note: str) -> HoursExtension:
    if not authz.has_any_role(granted_by, authz.GERENTE, authz.SUPERVISOR):
        raise PermissionError("Solo el supervisor o el gerente extienden el horario.")
    if granted_by.pk == user.pk:
        raise PermissionError("Nadie extiende su propio horario.")
    if not any(
        authz.in_scope(granted_by, branch_id)
        for branch_id in user.memberships.values_list("branch_id", flat=True)
    ):
        raise PermissionError("Ese usuario es de otra sucursal.")
    if not note.strip():
        raise ValueError("Escribe el motivo de la extensión.")
    span = dt.timedelta(minutes=minutes)
    if not dt.timedelta(minutes=15) <= span <= MAX_EXTENSION:
        raise ValueError("La extensión va de 15 minutos a 6 horas.")
    extension = HoursExtension.objects.create(
        company_id=user.company_id,
        user=user,
        until=timezone.now() + span,
        note=note.strip()[:300],
        granted_by=granted_by,
    )
    record_event(
        company_id=user.company_id,
        type="user.hours_extended",
        target=user,
        actor=granted_by,
        summary=f"Horario extendido hasta las {timezone.localtime(extension.until):%H:%M}: "
        f"{extension.note}",
    )
    return extension
