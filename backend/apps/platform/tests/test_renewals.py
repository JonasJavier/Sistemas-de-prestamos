"""D11 (decision 136): renewal notices and the lapse to read-only."""

import datetime as dt
from decimal import Decimal

from django.core import mail
from django.utils import timezone

from apps.core.models import Company
from apps.platform import tasks
from apps.platform.models import Plan, Subscription


def _activate(tenant, *, paid_until: dt.date) -> Subscription:
    plan = Plan.objects.create(
        name="Profesional", monthly_price=Decimal("2290"), tier="profesional"
    )
    company = tenant.company
    company.status = Company.Status.ACTIVE
    company.save(update_fields=["status"])
    Subscription.objects.filter(company=company).update(
        plan=plan, status=Subscription.Status.ACTIVE, paid_until=paid_until
    )
    return Subscription.objects.get(company=company)


def test_renewal_notices_go_out_7_3_and_1_day_before_once_a_day(tenant) -> None:
    today = timezone.localdate()
    subscription = _activate(tenant, paid_until=today + dt.timedelta(days=3))
    mail.outbox.clear()
    assert tasks.warn_renewals() == 1
    assert tasks.warn_renewals() == 0  # once a day
    message = mail.outbox[0]
    assert message.subject == "Tu plan Profesional de Cobradía vence en 3 días"
    assert "gerente@uno.do" in message.to and "gerente2@uno.do" in message.to
    assert "RD$ 22,900.00 el año completo" in message.body
    subscription.refresh_from_db()
    assert subscription.renewal_warned_on == today

    # Five days before: nothing. One day before: again.
    Subscription.objects.filter(pk=subscription.pk).update(
        paid_until=today + dt.timedelta(days=5), renewal_warned_on=None
    )
    assert tasks.warn_renewals() == 0
    Subscription.objects.filter(pk=subscription.pk).update(
        paid_until=today + dt.timedelta(days=1), renewal_warned_on=None
    )
    assert tasks.warn_renewals() == 1
    assert mail.outbox[-1].subject.endswith("vence mañana")


def test_a_lapsed_period_goes_read_only_after_the_grace_days(tenant) -> None:
    today = timezone.localdate()
    subscription = _activate(tenant, paid_until=today - dt.timedelta(days=tasks.GRACE_DAYS))
    mail.outbox.clear()
    assert tasks.expire_subscriptions() == 0  # still within the grace days
    Subscription.objects.filter(pk=subscription.pk).update(
        paid_until=today - dt.timedelta(days=tasks.GRACE_DAYS + 1)
    )
    assert tasks.expire_subscriptions() == 1
    tenant.company.refresh_from_db()
    subscription.refresh_from_db()
    assert tenant.company.status == Company.Status.SUSPENDED
    assert "Renueva tu suscripción" in tenant.company.status_reason
    assert subscription.status == Subscription.Status.PAST_DUE
    assert mail.outbox[-1].subject.startswith("Tu cuenta de Cobradía quedó en solo lectura")
    # Read-only means the manager cannot register, but can read.
    client = tenant.client("gerente")
    assert client.get("/api/v1/mi-empresa/").status_code == 200
    assert client.post("/api/v1/sucursales/", {"code": "02", "name": "Norte"}).status_code == 403
    assert tasks.expire_subscriptions() == 0  # not twice
