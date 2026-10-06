"""Nightly lending jobs; each company runs inside its own tenant context."""

from celery import shared_task
from django.db import transaction

from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.lending.applications import expire_overdue


@shared_task
def expire_applications() -> int:
    """Approved applications past their 15-day validity expire (F3 step 5)."""
    total = 0
    for company_id in Company.objects.exclude(status=Company.Status.CLOSED).values_list(
        "id", flat=True
    ):
        # Commit inside the context: RLS (and deferred checks) need the tenant.
        with company_context(company_id), transaction.atomic():
            total += expire_overdue()
    return total
