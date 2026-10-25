"""PT2 «Tablero de la plataforma» (doc 09 §3, decision 091).

Doc 06 §10: the owner sees companies, their state and subscription, and
aggregated usage — counts, never a customer, a loan or an amount of a
company. Usage counts are taken inside each tenant (RLS stays on) and
leave it as plain numbers.
"""

import datetime as dt

from django.db.models import Count
from django.utils import timezone

from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.platform.models import PaymentProof, Subscription

CONVERSION_DAYS = 90
USAGE_DAYS = 30


def _usage(company: Company, since: dt.datetime) -> dict:
    from apps.accounts.models import User
    from apps.audit.models import LoginEvent
    from apps.lending.models import Loan
    from apps.payments.models import Payment

    with company_context(company.id):
        return {
            "users": User.objects.filter(company=company, is_active=True).count(),
            "active_users": LoginEvent.objects.filter(at__gte=since)
            .values("user_id")
            .distinct()
            .count(),
            "active_loans": Loan.objects.filter(status=Loan.Status.ACTIVE).count(),
            "payments": Payment.objects.filter(created_at__gte=since).count(),
        }


def dashboard(today: dt.date | None = None) -> dict:
    today = today or timezone.localdate()
    since = timezone.now() - dt.timedelta(days=USAGE_DAYS)
    by_status = dict(Company.objects.values_list("status").annotate(n=Count("id")))

    # Doc 09 §3: became «activa» ÷ trials that ended in the period.
    window = today - dt.timedelta(days=CONVERSION_DAYS)
    ended = Company.objects.filter(trial_ends_on__gte=window, trial_ends_on__lt=today)
    converted = ended.filter(status=Company.Status.ACTIVE).count()
    ended_count = ended.count()

    trials_ending = Company.objects.filter(
        status=Company.Status.TRIAL,
        trial_ends_on__gte=today,
        trial_ends_on__lte=today + dt.timedelta(days=7),
    ).order_by("trial_ends_on")
    payments_due = (
        Subscription.objects.filter(
            status__in=[Subscription.Status.ACTIVE, Subscription.Status.PAST_DUE],
            paid_until__lte=today + dt.timedelta(days=7),
        )
        .select_related("company", "plan")
        .order_by("paid_until")
    )
    companies = list(Company.objects.exclude(status=Company.Status.CLOSED).order_by("-created_at"))

    pending_proofs = list(
        PaymentProof.objects.filter(status=PaymentProof.Status.PENDING)
        .select_related("company", "plan")
        .order_by("created_at")
    )
    usage = [{"id": str(c.id), "name": str(c), **_usage(c, since)} for c in companies]
    return {
        "date": today,
        "companies": {
            "trial": by_status.get(Company.Status.TRIAL, 0),
            "active": by_status.get(Company.Status.ACTIVE, 0),
            # Doc 09 §3 «Empresas activas»: active with the subscription in force.
            "active_paid": Company.objects.filter(
                status=Company.Status.ACTIVE, subscription__paid_until__gte=today
            ).count(),
            "suspended": by_status.get(Company.Status.SUSPENDED, 0),
            "closed": by_status.get(Company.Status.CLOSED, 0),
        },
        "conversion": {
            "days": CONVERSION_DAYS,
            "ended": ended_count,
            "converted": converted,
            "rate": None if not ended_count else str(round(converted / ended_count, 4)),
        },
        "pending_proofs": [
            {
                "id": str(p.id),
                "company": str(p.company_id),
                "name": str(p.company),
                "plan": p.plan.name,
                "period": p.period,
                "amount": str(p.amount),
                "created_at": p.created_at,
            }
            for p in pending_proofs
        ],
        "recent": [
            {"id": str(c.id), "name": str(c), "status": c.status, "created_at": c.created_at}
            for c in companies[:8]
        ],
        "trials_ending": [
            {"id": str(c.id), "name": str(c), "trial_ends_on": c.trial_ends_on}
            for c in trials_ending
        ],
        "payments_due": [
            {
                "id": str(s.company_id),
                "name": str(s.company),
                "plan": s.plan.name,
                "paid_until": s.paid_until,
                "overdue": s.paid_until < today if s.paid_until else True,
            }
            for s in payments_due
        ],
        "usage": {
            "days": USAGE_DAYS,
            "rows": usage,
            "totals": {
                key: sum(row[key] for row in usage)
                for key in ("users", "active_users", "active_loans", "payments")
            },
        },
        "definitions": {
            "conversion": "Empresas que pasaron a activa entre empresas cuya prueba terminó en los "
            f"últimos {CONVERSION_DAYS} días.",
            "active": "Empresas activas con suscripción vigente.",
            "usage": f"Conteos de los últimos {USAGE_DAYS} días; nunca datos ni montos de una "
            "empresa.",
        },
    }
