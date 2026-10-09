"""The nightly job (F8 step 1, 00:30): late fees, days past due and
buckets for every active loan, the day's delinquency snapshot, expired
authorizations, cash left open, the 90-day location purge and the
reconciliation of the caches with the books (doc 05 - section 7).
"""

import datetime as dt

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.cash import services as cash
from apps.collections import agenda, promises
from apps.collections.models import DelinquencySnapshot
from apps.collections.services import purge_pings
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.ledger import reconciliation
from apps.lending.models import Loan
from apps.notifications.models import Notification
from apps.notifications.services import managers, notify, supervisors_of
from apps.payments import portfolio, reversals

ZERO = portfolio.ZERO


def refresh_loan(loan_id, today: dt.date) -> None:
    with transaction.atomic():
        loan = Loan.objects.select_for_update().get(pk=loan_id)
        if loan.status != Loan.Status.ACTIVE:
            return
        lines = portfolio.refresh(loan, today)
        overdue = [line for line in lines if line.installment.due_date < today]
        DelinquencySnapshot.objects.update_or_create(
            loan=loan,
            date=today,
            defaults={
                "company_id": loan.company_id,
                "branch_id": loan.branch_id,
                "days_past_due": loan.days_past_due,
                "bucket": portfolio.bucket_of(loan.days_past_due),
                "principal_outstanding": loan.principal_outstanding,
                "principal_overdue": sum((line.principal for line in overdue), ZERO),
                "interest_overdue": sum((line.interest for line in overdue), ZERO),
                "late_fee_outstanding": loan.late_fee_outstanding,
            },
        )


def run_nightly(company_id, today: dt.date) -> dict:
    loans = list(Loan.objects.filter(status=Loan.Status.ACTIVE).values_list("id", flat=True))
    for loan_id in loans:
        refresh_loan(loan_id, today)
    # Phase 5 (F8): broken promises, escalation and cured loans, after the
    # refresh so days past due are today's.
    broken = promises.resolve_overdue(today)
    _notify_broken(company_id, broken)
    escalated = agenda.run_escalation(today)
    agenda.close_cured(today)
    # Phase 6: series of payables that fell due become expense and debt.
    from apps.expenses.payables import recognize_due

    recognized = recognize_due(today)
    from apps.cash.differences import nightly as differences_nightly

    differences = differences_nightly(today)
    expired = reversals.expire_requests()
    stale_cash, stale_routes = cash.stale_sessions(today)
    for session in stale_cash:
        notify(
            company_id=company_id,
            users=supervisors_of(session.branch_id),
            kind=Notification.Kind.CLOSING_TO_APPROVE,
            text=f"La caja {session.number} quedó abierta desde el {session.business_date:%d/%m}.",
            link="/cajas",
        )
    for route in stale_routes:
        name = route.collector.get_full_name() or route.collector.email
        notify(
            company_id=company_id,
            users=supervisors_of(route.branch_id),
            kind=Notification.Kind.CASH_DIFFERENCE,
            text=f"La ruta de {name} del {route.business_date:%d/%m} no se rindió.",
            link="/rutas",
        )
    purged = purge_pings(today)
    problems = reconciliation.check(company_id)
    if problems:
        notify(
            company_id=company_id,
            users=managers(),
            kind=Notification.Kind.RECONCILIATION,
            text=f"La conciliación nocturna encontró {len(problems)} diferencia(s): "
            + " ".join(problems)[:200],
        )
    return {
        "loans": len(loans),
        "expired": expired,
        "purged": purged,
        "problems": problems,
        "broken_promises": len(broken),
        "escalated": escalated,
        "payables_recognized": recognized,
        **differences,
    }


def _notify_broken(company_id, broken) -> None:
    by_owner: dict = {}
    for promise in broken:
        owner = promises.agent_of(promise.loan) or promise.created_by
        by_owner.setdefault(owner, []).append(promise.loan.number)
    for owner, numbers in by_owner.items():
        notify(
            company_id=company_id,
            users=[owner],
            kind=Notification.Kind.PROMISES_BROKEN,
            text=f"{len(numbers)} promesa(s) incumplida(s): "
            + ", ".join(numbers[:5])
            + ("…" if len(numbers) > 5 else ""),
            link="/cobranza",
        )


@shared_task
def nightly_portfolio() -> int:
    today = timezone.localdate()
    total = 0
    for company_id in Company.objects.exclude(status=Company.Status.CLOSED).values_list(
        "id", flat=True
    ):
        with company_context(company_id):
            total += run_nightly(company_id, today)["loans"]
    return total
