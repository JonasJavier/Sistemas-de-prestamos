"""D8 (decision 132): a company cancels from the app and leaves with its
data. The terms promise it: cancel any time, a copy of the data during the
90 days that follow, deletion afterwards (except what the law makes us keep).

Cancelling closes the company (read-only, like a suspension), cancels its
subscription, revokes any support access and tells its managers and the
platform owner. The nightly purge deletes companies closed for 90 days.
"""

from __future__ import annotations

import datetime as dt

import pgtrigger
from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import Membership, User
from apps.audit.models import record_event
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.platform import support
from apps.platform.models import Subscription

RETENTION_DAYS = 90


class CancellationError(Exception):
    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


def purge_on(company: Company) -> dt.date | None:
    if company.status != Company.Status.CLOSED or company.closed_at is None:
        return None
    return (timezone.localtime(company.closed_at) + dt.timedelta(days=RETENTION_DAYS)).date()


def _manager_emails(company_id) -> list[str]:
    with company_context(company_id):
        return sorted(
            set(
                Membership.objects.filter(
                    role__name__in=[authz.GERENTE, authz.ADMINISTRADOR], user__is_active=True
                ).values_list("user__email", flat=True)
            )
        )


def cancel_company(*, company: Company, by: User, reason: str) -> Company:
    """Runs as the manager who asked; the identity check is the view's job."""
    if company.status == Company.Status.CLOSED:
        raise CancellationError("La empresa ya está cancelada.", "closed")
    now = timezone.now()
    with transaction.atomic():
        company.status = Company.Status.CLOSED
        company.closed_at = now
        company.status_reason = (
            f"Cancelada por {by.get_full_name() or by.email} el "
            f"{timezone.localtime(now):%d/%m/%Y}. Puedes descargar tu copia hasta el "
            f"{purge_on(company):%d/%m/%Y}; después se elimina todo."
        )
        company.save(update_fields=["status", "closed_at", "status_reason", "updated_at"])
        Subscription.objects.filter(company=company).update(status=Subscription.Status.CANCELED)
        for grant in company.support_grants.filter(revoked_at__isnull=True):
            if support.is_active(grant):
                grant.revoked_at = now
                grant.save(update_fields=["revoked_at", "updated_at"])
        with company_context(company.id):
            record_event(
                company_id=company.id,
                type="platform.cancelled",
                target=company,
                actor=by,
                summary=f"Canceló la suscripción: {reason}",
                data={"reason": reason, "purge_on": purge_on(company).isoformat()},
            )
        transaction.on_commit(lambda: _notify(company, by, reason))
    return company


def _notify(company: Company, by: User, reason: str) -> None:
    until = purge_on(company)
    managers = _manager_emails(company.id)
    if managers:
        send_mail(
            subject=f"Cancelaste tu suscripción a Cobradía ({company})",
            message=(
                f"{by.get_full_name() or by.email} canceló la suscripción de {company}.\n\n"
                "La cuenta queda en solo lectura: puedes entrar, consultar y descargar la copia "
                f"completa de tus datos hasta el {until:%d/%m/%Y} desde Ajustes → Suscripción.\n"
                "Después de esa fecha se elimina todo, salvo lo que la ley obligue a conservar.\n\n"
                "Si fue un error o quieres volver, escríbenos a hola@cobradia.com: reactivamos la "
                "cuenta tal cual estaba.\n\n"
                f"{settings.FRONTEND_URL}/ajustes/suscripcion\n"
            ),
            from_email=None,
            recipient_list=managers,
        )
    owners = list(
        User.objects.filter(is_platform_admin=True, is_active=True).values_list("email", flat=True)
    )
    if owners:
        send_mail(
            subject=f"Cancelación en Cobradía: {company}",
            message=(
                f"{company} canceló su suscripción ({by.email}).\nMotivo: {reason}\n\n"
                f"Sus datos se eliminan el {until:%d/%m/%Y} si no vuelve.\n"
                f"{settings.FRONTEND_URL}/plataforma/empresas/{company.id}\n"
            ),
            from_email=None,
            recipient_list=owners,
        )


def _company_bound_tables() -> list[tuple[str, str]]:
    """Every table with a column pointing at Company (tenant tables, their
    history tables, grants, proofs…), as (table, column)."""
    from django.apps import apps

    tables = []
    for model in apps.get_models():
        if model is Company:
            continue
        for field in model._meta.local_fields:
            if field.is_relation and field.related_model is Company:
                tables.append((model._meta.db_table, field.column))
                break
    return tables


def purge_closed_companies(today: dt.date | None = None) -> int:
    """Deletes every company closed for RETENTION_DAYS days or more, with all
    of its rows. The tenant rows go by SQL inside the company's context (the
    foreign keys are deferred, so the order does not matter); then the users,
    then the company, through the ORM so what hangs from them follows."""
    from django.db import connection

    today = today or timezone.localdate()
    limit = timezone.now() - dt.timedelta(days=RETENTION_DAYS)
    purged = 0
    for company in Company.objects.filter(status=Company.Status.CLOSED, closed_at__lte=limit):
        if purge_on(company) > today:
            continue
        # The append-only and balance triggers (pgtrigger) guard the books of
        # a living company; a purge is the one legitimate deletion. The
        # deferred ones fire while still ignored, before the commit.
        with pgtrigger.ignore(), company_context(company.id), transaction.atomic():
            with connection.cursor() as cursor:
                for table, column in _company_bound_tables():
                    cursor.execute(f'DELETE FROM "{table}" WHERE "{column}" = %s', [company.id])  # noqa: S608 - identifiers come from the model registry
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            User.objects.filter(company_id=company.id).delete()
            company.delete()
        purged += 1
    return purged
