"""Who must know: recipients by role and branch, and the notice itself."""

from collections.abc import Iterable
from uuid import UUID

from apps.accounts import authz
from apps.accounts.models import Membership, User
from apps.notifications.models import Notification


def notify(*, company_id: UUID, users: Iterable[User], kind: str, text: str, link: str = "") -> int:
    rows = [
        Notification(company_id=company_id, user=user, kind=kind, text=text[:300], link=link)
        for user in {user.pk: user for user in users}.values()
    ]
    Notification.objects.bulk_create(rows)
    return len(rows)


def supervisors_of(branch_id: UUID, *, exclude: User | None = None) -> list[User]:
    """The branch's supervisors plus every manager of the company (doc 06)."""
    memberships = Membership.objects.filter(
        user__is_active=True, role__name__in=[authz.SUPERVISOR, authz.GERENTE]
    ).select_related("user", "role")
    users = {
        m.user.pk: m.user
        for m in memberships
        if m.role.name == authz.GERENTE or m.branch_id == branch_id
    }
    if exclude is not None:
        users.pop(exclude.pk, None)
    return list(users.values())


def managers(*, exclude: User | None = None) -> list[User]:
    users = {
        m.user.pk: m.user
        for m in Membership.objects.filter(
            user__is_active=True, role__name__in=[authz.GERENTE, authz.ADMINISTRADOR]
        ).select_related("user")
    }
    if exclude is not None:
        users.pop(exclude.pk, None)
    return list(users.values())
