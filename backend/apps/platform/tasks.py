"""Nightly platform jobs (flow F19)."""

from celery import shared_task
from django.utils import timezone

from apps.core.models import Company
from apps.platform.models import Subscription


@shared_task
def expire_trials() -> int:
    """Suspend companies whose trial ended (read-only mode until they pay)."""
    today = timezone.localdate()
    expired = Company.objects.filter(status=Company.Status.TRIAL, trial_ends_on__lt=today)
    count = 0
    for company in expired:
        company.status = Company.Status.SUSPENDED
        company.status_reason = (
            "La prueba gratis terminó. Activa tu suscripción para seguir operando."
        )
        company.save(update_fields=["status", "status_reason", "updated_at"])
        Subscription.objects.filter(company=company).update(status=Subscription.Status.PAST_DUE)
        count += 1
    return count
