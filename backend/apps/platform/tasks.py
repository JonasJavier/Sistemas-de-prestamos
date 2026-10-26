"""Nightly platform jobs (flow F19)."""

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
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


@shared_task
def purge_closed_companies() -> int:
    """D8 (decision 132): a company cancelled 90 days ago leaves with everything."""
    from apps.platform.cancellation import purge_closed_companies as purge

    return purge()


WARN_DAYS = (7, 3, 1)  # F19: notices before the trial ends


@shared_task
def warn_trials() -> int:
    """F19 (decision 104): the company's managers hear 7, 3 and 1 day
    before the trial ends, once each day, by e-mail."""
    from apps.accounts import authz
    from apps.accounts.models import Membership
    from apps.core.tenancy import company_context

    today = timezone.localdate()
    sent = 0
    for company in Company.objects.filter(status=Company.Status.TRIAL, trial_ends_on__isnull=False):
        left = (company.trial_ends_on - today).days
        if left not in WARN_DAYS or company.trial_warned_on == today:
            continue
        with company_context(company.id):
            emails = sorted(
                set(
                    Membership.objects.filter(
                        role__name__in=[authz.GERENTE, authz.ADMINISTRADOR], user__is_active=True
                    ).values_list("user__email", flat=True)
                )
            )
        if emails:
            day = "mañana" if left == 1 else f"en {left} días"
            send_mail(
                subject=f"Tu prueba de Cobradía termina {day}",
                message=(
                    f"La prueba gratis de {company} termina {day}, el "
                    f"{company.trial_ends_on:%d/%m/%Y}. Después la cuenta queda en solo "
                    "lectura: podrás ver y exportar todo, pero no registrar operaciones.\n\n"
                    "Para seguir sin interrupciones, activa tu suscripción aquí:\n"
                    f"{settings.FRONTEND_URL}/ajustes/suscripcion\n"
                ),
                from_email=None,
                recipient_list=emails,
            )
            sent += 1
        company.trial_warned_on = today
        company.save(update_fields=["trial_warned_on", "updated_at"])
    return sent


def notify_owner_of_signup(company: Company, admin_email: str) -> None:
    """F19: the platform owner hears of every new company."""
    from apps.accounts.models import User

    owners = list(
        User.objects.filter(is_platform_admin=True, is_active=True).values_list("email", flat=True)
    )
    if not owners:
        return
    send_mail(
        subject=f"Nueva financiera en Cobradía: {company}",
        message=(
            f"{company} se registró con {admin_email}. Su prueba termina el "
            f"{company.trial_ends_on:%d/%m/%Y}.\n\n{settings.FRONTEND_URL}/plataforma\n"
        ),
        from_email=None,
        recipient_list=owners,
    )
