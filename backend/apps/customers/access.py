"""Branch scope for customers (decision 033, staged by 059).

Everyone sees the customers of their branches; the manager, accounting
and audit see all. Serving a customer of another branch takes an explicit,
logged grant that lasts until the end of the day.
"""

import datetime as dt
from uuid import UUID

from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import SensitiveAccessLog
from apps.customers.models import BranchAccessGrant, Customer


def granted_customer_ids(user: User) -> set[UUID]:
    cache = user.__dict__.setdefault("_authz_cache", {})
    if "grants" not in cache:
        cache["grants"] = set(
            BranchAccessGrant.objects.filter(user=user, expires_at__gt=timezone.now()).values_list(
                "customer_id", flat=True
            )
        )
    return cache["grants"]


def only_collector(user: User) -> bool:
    """A user whose only role is Cobrador sees just his portfolio (doc 06, «P»)."""
    roles = authz.role_names(user)
    return bool(roles) and roles <= {authz.COBRADOR}


def scope_customers(queryset: QuerySet, user: User, *, field: str = "") -> QuerySet:
    """Customers (or rows pointing to one through ``field``) the user may see."""
    prefix = f"{field}__" if field else ""
    if only_collector(user):
        return queryset.filter(
            Q(**{f"{prefix}loans__collector": user}) | Q(**{f"{prefix}loans__agent": user})
        ).distinct()
    scope = authz.branch_scope(user)
    if scope is None:
        return queryset
    return queryset.filter(
        Q(**{f"{prefix}home_branch_id__in": scope})
        | Q(**{f"{prefix}id__in": granted_customer_ids(user)})
    )


def scope_loans(queryset: QuerySet, user: User) -> QuerySet:
    if only_collector(user):  # his portfolio: collected or managed by him (079)
        return queryset.filter(Q(collector=user) | Q(agent=user))
    scope = authz.branch_scope(user)
    if scope is None:
        return queryset
    return queryset.filter(Q(branch_id__in=scope) | Q(customer_id__in=granted_customer_ids(user)))


def can_serve(user: User, *, branch_id: UUID, customer_id: UUID) -> bool:
    return authz.in_scope(user, branch_id) or customer_id in granted_customer_ids(user)


GRANT_ROLES = (authz.SUPERVISOR, authz.OFICIAL, authz.CAJERO)


def end_of_day() -> dt.datetime:
    today = timezone.localdate()
    return timezone.make_aware(dt.datetime.combine(today + dt.timedelta(days=1), dt.time.min))


def grant(*, user: User, customer: Customer, note: str) -> BranchAccessGrant:
    """«Atender un cliente de otra sucursal»: needs a reason and is logged."""
    if not note.strip():
        raise ValueError("Escribe por qué atiendes a este cliente de otra sucursal.")
    access = BranchAccessGrant.objects.create(
        company_id=customer.company_id,
        user=user,
        customer=customer,
        note=note.strip()[:300],
        expires_at=end_of_day(),
    )
    SensitiveAccessLog.objects.create(
        company_id=customer.company_id,
        user=user,
        action=SensitiveAccessLog.Action.OTHER_BRANCH,
        target_type="customer",
        target_id=customer.id,
        detail=f"{customer.display_name}: {access.note}"[:300],
    )
    user.__dict__.get("_authz_cache", {}).pop("grants", None)
    return access
