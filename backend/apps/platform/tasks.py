"""Nightly platform jobs (flow F19)."""

import datetime as dt

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


GRACE_DAYS = 3  # D11: days after paid_until before the account goes read-only


def _manager_emails(company: Company) -> list[str]:
    from apps.accounts import authz
    from apps.accounts.models import Membership
    from apps.core.tenancy import company_context

    with company_context(company.id):
        return sorted(
            set(
                Membership.objects.filter(
                    role__name__in=[authz.GERENTE, authz.ADMINISTRADOR], user__is_active=True
                ).values_list("user__email", flat=True)
            )
        )


@shared_task
def warn_renewals() -> int:
    """D11 (decision 136): 7, 3 and 1 day before the paid period ends, the
    managers hear it by e-mail, once each day; the annual option is offered."""
    today = timezone.localdate()
    sent = 0
    due = Subscription.objects.filter(
        company__status=Company.Status.ACTIVE, paid_until__isnull=False
    ).select_related("company", "plan")
    for subscription in due:
        left = (subscription.paid_until - today).days
        if left not in WARN_DAYS or subscription.renewal_warned_on == today:
            continue
        emails = _manager_emails(subscription.company)
        if emails:
            day = "mañana" if left == 1 else f"en {left} días"
            price = subscription.plan.monthly_price
            send_mail(
                subject=f"Tu plan {subscription.plan.name} de Cobradía vence {day}",
                message=(
                    f"El período pagado de {subscription.company} termina {day}, el "
                    f"{subscription.paid_until:%d/%m/%Y}. Pasados {GRACE_DAYS} días sin pago, la "
                    "cuenta queda en solo lectura: podrás ver y exportar todo, pero no registrar "
                    "operaciones.\n\n"
                    f"Renueva por transferencia desde Suscripción: RD$ {price:,.2f} el mes, o "
                    f"RD$ {price * 10:,.2f} el año completo (pagas 10 meses, dos gratis).\n"
                    f"{settings.FRONTEND_URL}/ajustes/suscripcion\n"
                ),
                from_email=None,
                recipient_list=emails,
            )
            sent += 1
        subscription.renewal_warned_on = today
        subscription.save(update_fields=["renewal_warned_on", "updated_at"])
    return sent


@shared_task
def expire_subscriptions() -> int:
    """D11 (decision 136): an active company whose paid period ended more
    than GRACE_DAYS ago goes read-only until it pays (what the terms say)."""
    today = timezone.localdate()
    limit = today - dt.timedelta(days=GRACE_DAYS)
    count = 0
    lapsed = Subscription.objects.filter(
        company__status=Company.Status.ACTIVE, paid_until__lt=limit
    ).select_related("company")
    for subscription in lapsed:
        company = subscription.company
        company.status = Company.Status.SUSPENDED
        company.status_reason = (
            f"El período pagado terminó el {subscription.paid_until:%d/%m/%Y}. Renueva tu "
            "suscripción para seguir operando."
        )
        company.save(update_fields=["status", "status_reason", "updated_at"])
        subscription.status = Subscription.Status.PAST_DUE
        subscription.save(update_fields=["status", "updated_at"])
        emails = _manager_emails(company)
        if emails:
            send_mail(
                subject=f"Tu cuenta de Cobradía quedó en solo lectura ({company})",
                message=(
                    f"El período pagado de {company} terminó el "
                    f"{subscription.paid_until:%d/%m/%Y} y no hemos recibido el pago. La cuenta "
                    "queda en solo lectura: nada se pierde, y vuelve a la normalidad en cuanto "
                    "confirmemos tu transferencia.\n\n"
                    f"{settings.FRONTEND_URL}/ajustes/suscripcion\n"
                ),
                from_email=None,
                recipient_list=emails,
            )
        count += 1
    return count


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
