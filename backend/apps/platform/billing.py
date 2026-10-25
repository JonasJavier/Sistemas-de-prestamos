"""Paying the subscription by bank transfer (decision 125).

The company picks a plan, transfers to one of the owner's accounts and
uploads the receipt from Suscripción. The owner sees it in the panel and
confirms it with one click: the payment is recorded, the plan applied and
the company activated until the end of the paid period. Or rejects it
with a reason. Both sides hear by e-mail and in the app.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.core.models import Company
from apps.core.tenancy import company_context
from apps.platform.models import PaymentProof, Plan, Subscription, SubscriptionPayment

MONTHS = {PaymentProof.Period.MONTHLY: 1, PaymentProof.Period.ANNUAL: 12}


class BillingError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def expected_amount(plan: Plan, period: str) -> Decimal:
    """Monthly price, or ten months for the year (decision 124)."""
    if period == PaymentProof.Period.ANNUAL:
        return plan.monthly_price * 10
    return plan.monthly_price


def add_months(day: dt.date, months: int) -> dt.date:
    month = day.month - 1 + months
    year = day.year + month // 12
    month = month % 12 + 1
    last = (dt.date(year + (month == 12), month % 12 + 1, 1) - dt.timedelta(days=1)).day
    return dt.date(year, month, min(day.day, last))


def _managers_emails(company_id) -> list[str]:
    from apps.notifications.services import managers

    with company_context(company_id):
        return sorted({u.email for u in managers()})


def _tell_company(company_id, text: str, *, actor: User | None, event: str, target) -> None:
    from apps.audit.models import record_event
    from apps.notifications.models import Notification
    from apps.notifications.services import managers, notify

    with company_context(company_id):
        record_event(
            company_id=company_id, type=event, target=target, actor=actor, summary=text[:300]
        )
        notify(
            company_id=company_id,
            users=managers(),
            kind=Notification.Kind.SUBSCRIPTION,
            text=text,
            link="/ajustes/suscripcion",
        )


@transaction.atomic
def submit_proof(
    *,
    company: Company,
    by: User,
    plan: Plan,
    period: str,
    amount: Decimal,
    reference: str,
    note: str,
    file,
    content_type: str,
    size: int,
) -> PaymentProof:
    if not plan.is_active or plan.is_trial:
        raise BillingError("Ese plan no está disponible.")
    if PaymentProof.objects.filter(company=company, status=PaymentProof.Status.PENDING).exists():
        raise BillingError(
            "Ya enviaste un comprobante que está por confirmar. Espera a que lo revisemos."
        )
    proof = PaymentProof.objects.create(
        company=company,
        plan=plan,
        period=period,
        amount=amount,
        reference=reference[:100],
        note=note[:300],
        file=file,
        content_type=content_type,
        size=size,
        submitted_by=by,
    )
    _tell_company(
        company.id,
        f"Comprobante de pago enviado: plan {plan.name} ({proof.get_period_display().lower()}), "
        f"RD$ {amount:,.2f}. Lo confirmamos en el día.",
        actor=by,
        event="subscription.proof_sent",
        target=proof,
    )
    owners = list(
        User.objects.filter(is_platform_admin=True, is_active=True).values_list("email", flat=True)
    )
    if owners:
        transaction.on_commit(
            lambda: send_mail(
                subject=f"Comprobante de pago: {company} · {plan.name}",
                message=(
                    f"{company} envió un comprobante de RD$ {amount:,.2f} por el plan {plan.name} "
                    f"({proof.get_period_display().lower()})"
                    f"{f', referencia {reference}' if reference else ''}.\n\n"
                    f"Confírmalo en {settings.FRONTEND_URL}/plataforma/empresas/{company.id}\n"
                ),
                from_email=None,
                recipient_list=owners,
            )
        )
    return proof


@transaction.atomic
def confirm_proof(*, proof: PaymentProof, by: User) -> PaymentProof:
    if proof.status != PaymentProof.Status.PENDING:
        raise BillingError("Ese comprobante ya fue revisado.")
    company = proof.company
    subscription = Subscription.objects.select_related("plan").get(company=company)
    today = timezone.localdate()
    # A payment extends what is already paid; otherwise it starts today.
    start = today
    if subscription.paid_until and subscription.paid_until >= today:
        start = subscription.paid_until + dt.timedelta(days=1)
    end = add_months(start, MONTHS[proof.period]) - dt.timedelta(days=1)
    payment = SubscriptionPayment.objects.create(
        subscription=subscription,
        period_start=start,
        period_end=end,
        amount=proof.amount,
        method=SubscriptionPayment.Method.TRANSFER,
        reference=proof.reference,
        recorded_by=by,
    )
    subscription.plan = proof.plan
    subscription.status = Subscription.Status.ACTIVE
    subscription.paid_until = end
    subscription.save(update_fields=["plan", "status", "paid_until", "updated_at"])
    company.status = Company.Status.ACTIVE
    company.status_reason = ""
    company.save(update_fields=["status", "status_reason", "updated_at"])
    proof.status = PaymentProof.Status.CONFIRMED
    proof.reviewed_by = by
    proof.reviewed_at = timezone.now()
    proof.payment = payment
    proof.save(update_fields=["status", "reviewed_by", "reviewed_at", "payment", "updated_at"])
    text = (
        f"Pago confirmado: plan {proof.plan.name} activo hasta el {end:%d/%m/%Y}. "
        "Gracias por confiar en Cobradía."
    )
    _tell_company(company.id, text, actor=None, event="subscription.paid", target=payment)
    emails = _managers_emails(company.id)
    if emails:
        transaction.on_commit(
            lambda: send_mail(
                subject=f"Tu pago de Cobradía fue confirmado · {proof.plan.name}",
                message=(
                    f"Recibimos tu pago de RD$ {proof.amount:,.2f}. Tu plan {proof.plan.name} "
                    f"está activo hasta el {end:%d/%m/%Y}.\n\n"
                    f"{settings.FRONTEND_URL}/ajustes/suscripcion\n"
                ),
                from_email=None,
                recipient_list=emails,
            )
        )
    return proof


@transaction.atomic
def reject_proof(*, proof: PaymentProof, by: User, reason: str) -> PaymentProof:
    if proof.status != PaymentProof.Status.PENDING:
        raise BillingError("Ese comprobante ya fue revisado.")
    if not reason.strip():
        raise BillingError("Escribe el motivo del rechazo: la empresa lo verá.")
    proof.status = PaymentProof.Status.REJECTED
    proof.rejection_reason = reason.strip()[:300]
    proof.reviewed_by = by
    proof.reviewed_at = timezone.now()
    proof.save(
        update_fields=["status", "rejection_reason", "reviewed_by", "reviewed_at", "updated_at"]
    )
    text = f"No pudimos confirmar tu comprobante: {proof.rejection_reason}"
    _tell_company(
        proof.company_id, text, actor=None, event="subscription.proof_rejected", target=proof
    )
    emails = _managers_emails(proof.company_id)
    if emails:
        transaction.on_commit(
            lambda: send_mail(
                subject="Tu comprobante de pago de Cobradía necesita revisión",
                message=(
                    f"{text}\n\nPuedes enviar otro comprobante desde "
                    f"{settings.FRONTEND_URL}/ajustes/suscripcion\n"
                ),
                from_email=None,
                recipient_list=emails,
            )
        )
    return proof
