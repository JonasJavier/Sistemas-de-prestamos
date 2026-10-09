"""Plan limits (F19, decision 104): users, branches and active loans.

Each plan may cap them (an empty limit means no cap). The check runs where
each one grows: inviting or reactivating a user, creating or reactivating
a branch, and disbursing a loan (a renewal replaces its loan, so it does
not add one). Pending invitations count as users, or inviting would get
round the cap. Callers run inside the company's tenant context.
"""

from django.utils import timezone

from apps.platform.models import Subscription

LIMITS = {
    "users": ("max_users", "usuarios activos"),
    "branches": ("max_branches", "sucursales activas"),
    "active_loans": ("max_active_loans", "préstamos activos"),
}


class PlanLimitError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def usage(company_id) -> dict[str, int]:
    from apps.accounts.models import Invitation, User
    from apps.core.models import Branch
    from apps.lending.models import Loan

    pending = Invitation.objects.filter(
        company_id=company_id, accepted_at__isnull=True, expires_at__gt=timezone.now()
    ).count()
    return {
        "users": User.objects.filter(company_id=company_id, is_active=True).count() + pending,
        "branches": Branch.objects.filter(company_id=company_id, is_active=True).count(),
        "active_loans": Loan.objects.filter(
            company_id=company_id, status=Loan.Status.ACTIVE
        ).count(),
    }


def check(company_id, what: str, adding: int = 1) -> None:
    subscription = Subscription.objects.select_related("plan").filter(company_id=company_id).first()
    if subscription is None or adding <= 0:
        return
    field, label = LIMITS[what]
    limit = getattr(subscription.plan, field)
    if limit is None:
        return
    if usage(company_id)[what] + adding > limit:
        raise PlanLimitError(
            f"Tu plan «{subscription.plan.name}» permite hasta {limit} {label}. "
            "Para agregar más, cambia de plan en Ajustes · Suscripción."
        )
