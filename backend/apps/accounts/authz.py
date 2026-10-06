"""Authorization layers 1-3 of doc 06 - section 2, as plain functions.

Layer 0 (company) is RLS; these answer, for one user:
1. which system roles they hold (permission);
2. which branches they may see (scope, decision 033);
3. how much they may approve per operation (limit, doc 06 - section 5).

Results are cached on the user instance, which lives for one request.
"""

from decimal import Decimal
from typing import Any
from uuid import UUID

from apps.accounts.models import ApprovalLimit, Membership, User

GERENTE = "Gerente"
ADMINISTRADOR = "Administrador"
SUPERVISOR = "Supervisor"
OFICIAL = "Oficial de crédito"
CAJERO = "Cajero"
COBRADOR = "Cobrador"
CONTABILIDAD = "Contabilidad"
AUDITORIA = "Auditoría"

# Decision 033: the manager, accounting and audit see every branch.
ALL_BRANCH_ROLES = frozenset({GERENTE, CONTABILIDAD, AUDITORIA})


def _cached(user: User, key: str, compute: Any) -> Any:
    cache = user.__dict__.setdefault("_authz_cache", {})
    if key not in cache:
        cache[key] = compute()
    return cache[key]


def role_names(user: User) -> frozenset[str]:
    return _cached(
        user,
        "roles",
        lambda: frozenset(
            Membership.objects.filter(user=user).values_list("role__name", flat=True)
        ),
    )


def has_any_role(user: User, *names: str) -> bool:
    return bool(role_names(user) & set(names))


def branch_scope(user: User) -> frozenset[UUID] | None:
    """Branch ids the user may see, or None for «all of the company»."""

    def compute() -> frozenset[UUID] | None:
        if role_names(user) & ALL_BRANCH_ROLES:
            return None
        return frozenset(Membership.objects.filter(user=user).values_list("branch_id", flat=True))

    return _cached(user, "branches", compute)


def in_scope(user: User, branch_id: UUID) -> bool:
    scope = branch_scope(user)
    return scope is None or branch_id in scope


class NoLimit:
    """The user holds no limit at all for the operation: cannot approve it."""


NO_LIMIT = NoLimit()


def approval_limit(user: User, operation: str) -> Decimal | None | NoLimit:
    """Max amount the user may approve: a Decimal, None (sin límite) or NO_LIMIT.

    A limit set on the user overrides the role ones; among roles, the
    most generous wins (an empty max_amount means unlimited).
    """

    def compute() -> Decimal | None | NoLimit:
        personal = ApprovalLimit.objects.filter(user=user, operation=operation).first()
        if personal is not None:
            return personal.max_amount
        amounts = list(
            ApprovalLimit.objects.filter(
                role__memberships__user=user, operation=operation
            ).values_list("max_amount", flat=True)
        )
        if not amounts:
            return NO_LIMIT
        if any(amount is None for amount in amounts):
            return None
        return max(amounts)

    return _cached(user, f"limit:{operation}", compute)


def within_limit(user: User, operation: str, amount: Decimal) -> bool:
    limit = approval_limit(user, operation)
    if isinstance(limit, NoLimit):
        return False
    return limit is None or amount <= limit


# Doc 06 - section 5 example values, seeded at signup (None = sin límite).
# Companies edit them in Ajustes; **Validar** with the first client.
DEFAULT_APPROVAL_LIMITS: dict[str, dict[str, Decimal | None]] = {
    GERENTE: {op: None for op in ApprovalLimit.Operation.values},
    SUPERVISOR: {
        ApprovalLimit.Operation.APPROVE_APPLICATION: Decimal("50000"),
        ApprovalLimit.Operation.WAIVE_LATE_FEE: Decimal("5000"),
        ApprovalLimit.Operation.PAYOFF_DISCOUNT: Decimal("2000"),
        ApprovalLimit.Operation.AUTHORIZE_REVERSAL: Decimal("20000"),
        ApprovalLimit.Operation.EXPENSE: Decimal("5000"),
        ApprovalLimit.Operation.CASH_DIFFERENCE: Decimal("500"),
    },
    CAJERO: {
        ApprovalLimit.Operation.WAIVE_LATE_FEE: Decimal("500"),
        ApprovalLimit.Operation.EXPENSE: Decimal("1000"),
    },
}
