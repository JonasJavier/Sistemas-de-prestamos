"""Yearly calendar upkeep for every company (doc 03 - section 4)."""

from celery import shared_task
from django.db import transaction
from django.utils import timezone

from apps.core.holidays import seed_year
from apps.core.models import Company
from apps.core.tenancy import company_context


@shared_task
def seed_next_year_holidays() -> int:
    """Every December, add next year's fixed and movable holidays."""
    year = timezone.localdate().year + 1
    total = 0
    for company_id in Company.objects.exclude(status=Company.Status.CLOSED).values_list(
        "id", flat=True
    ):
        with company_context(company_id), transaction.atomic():
            total += seed_year(company_id, year)
    return total
