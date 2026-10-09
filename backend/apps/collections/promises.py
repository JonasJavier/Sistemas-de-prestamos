"""Payment promises (F8 step 4, decision 076).

A promise is a date and an amount. It is **kept** as soon as the payments
made since it was given reach the amount, on or before its date; when the
date passes without that, the nightly job marks it **broken** and puts a
follow-up in the agent's agenda. A loan has at most one pending promise: a
new one replaces the previous. Payments and their reversals re-evaluate the
loan's latest promise, so the status always matches the books.
"""

import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.collections.models import CollectionAction, CollectionTask, PaymentPromise
from apps.collections.services import CollectionsError
from apps.lending.models import Loan
from apps.payments import portfolio
from engine.money import money

ZERO = Decimal("0.00")
MAX_DAYS_AHEAD = 30
MANAGE_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL, authz.COBRADOR)


class PromiseError(CollectionsError):
    pass


def agent_of(loan: Loan) -> User | None:
    """The gestor: the assigned agent or, without one, the collector (079)."""
    return loan.agent or loan.collector


def check_can_manage(user: User, loan: Loan) -> None:
    """Doc 06: G, Su and O within their branches; the collector, his portfolio."""
    from apps.customers.access import can_serve, only_collector

    if not authz.has_any_role(user, *MANAGE_ROLES):
        raise PromiseError("Tu rol no registra gestiones ni promesas.", "forbidden")
    if only_collector(user):
        if user.pk not in (loan.collector_id, loan.agent_id):
            raise PromiseError("Solo gestionas los préstamos de tu cartera.", "forbidden")
    elif not can_serve(user, branch_id=loan.branch_id, customer_id=loan.customer_id):
        raise PromiseError("El préstamo es de otra sucursal.", "out_of_scope")


def pending_of(loan: Loan) -> PaymentPromise | None:
    return PaymentPromise.objects.filter(loan=loan, status=PaymentPromise.Status.PENDING).first()


def paid_toward(promise: PaymentPromise) -> Decimal:
    """Posted payments made since the promise, dated up to its day."""
    from apps.payments.models import Payment

    total = (
        Payment.objects.filter(
            loan_id=promise.loan_id,
            status=Payment.Status.POSTED,
            paid_at__gte=promise.created_at,
            value_date__lte=promise.promised_on,
        )
        .exclude(kind=Payment.Kind.MIGRATED)
        .aggregate(total=Sum("amount"))["total"]
    )
    return total or ZERO


@transaction.atomic
def make_promise(
    *,
    loan: Loan,
    user: User,
    promised_on: dt.date,
    amount: Decimal,
    action: CollectionAction | None = None,
    note: str = "",
) -> PaymentPromise:
    check_can_manage(user, loan)
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    if loan.status != Loan.Status.ACTIVE:
        raise PromiseError("Solo un préstamo activo recibe promesas.", "state")
    today = timezone.localdate()
    if promised_on < today:
        raise PromiseError("La promesa es para hoy o una fecha futura.", "promised_on")
    if promised_on > today + dt.timedelta(days=MAX_DAYS_AHEAD):
        raise PromiseError(
            f"Una promesa se da a {MAX_DAYS_AHEAD} días como máximo; para más, reestructura.",
            "promised_on",
        )
    amount = money(amount)
    if amount <= 0:
        raise PromiseError("Indica cuánto promete pagar.", "amount")
    owed = portfolio.summarize(portfolio.position(loan, today), today).total_owed
    if amount > owed:
        raise PromiseError(f"Promete más de lo que debe (RD$ {owed:,.2f}).", "amount")
    previous = pending_of(loan)
    if previous is not None:
        _close(previous, PaymentPromise.Status.CANCELLED, note="Reemplazada por otra promesa")
    promise = PaymentPromise.objects.create(
        company_id=loan.company_id,
        loan=loan,
        customer_id=loan.customer_id,
        action=action,
        promised_on=promised_on,
        amount=amount,
        note=note.strip()[:300],
        created_by=user,
    )
    record_event(
        company_id=loan.company_id,
        type="collection.promise",
        target=loan,
        actor=user,
        summary=f"Promesa de pago: RD$ {amount:,.2f} el {promised_on:%d/%m/%Y}",
    )
    return promise


def _close(promise: PaymentPromise, status: str, *, paid: Decimal = ZERO, note: str = "") -> None:
    promise.status = status
    promise.paid = paid
    promise.resolved_at = timezone.now()
    if note:
        promise.note = (f"{promise.note} · {note}" if promise.note else note)[:300]
    promise.save(update_fields=["status", "paid", "resolved_at", "note", "updated_at"])


@transaction.atomic
def cancel(*, promise: PaymentPromise, user: User, note: str) -> PaymentPromise:
    check_can_manage(user, promise.loan)
    if promise.status != PaymentPromise.Status.PENDING:
        raise PromiseError("Esa promesa ya se resolvió.", "state")
    if not note.strip():
        raise PromiseError("Escribe por qué se cancela.", "note")
    _close(promise, PaymentPromise.Status.CANCELLED, note=note.strip())
    record_event(
        company_id=promise.company_id,
        type="collection.promise_cancelled",
        target=promise.loan,
        actor=user,
        summary=f"Promesa cancelada: {note.strip()}",
    )
    return promise


def evaluate(loan: Loan, today: dt.date) -> PaymentPromise | None:
    """After a payment or a reversal: the loan's latest promise follows the books."""
    promise = (
        PaymentPromise.objects.select_for_update()
        .filter(loan=loan, status__in=[PaymentPromise.Status.PENDING, PaymentPromise.Status.KEPT])
        .order_by("-created_at")
        .first()
    )
    if promise is None:
        return None
    paid = paid_toward(promise)
    if promise.status == PaymentPromise.Status.PENDING:
        if paid >= promise.amount:
            _close(promise, PaymentPromise.Status.KEPT, paid=paid)
            _settle_tasks(promise, "La promesa se cumplió")
    elif paid < promise.amount:  # a reversal undid it
        if promise.promised_on >= today:
            promise.status = PaymentPromise.Status.PENDING
            promise.paid = ZERO
            promise.resolved_at = None
            promise.save(update_fields=["status", "paid", "resolved_at", "updated_at"])
        else:
            _close(promise, PaymentPromise.Status.BROKEN, paid=paid, note="Se reversó el pago")
            _broken_task(promise, today)
    return promise


def _settle_tasks(promise: PaymentPromise, note: str) -> None:
    CollectionTask.objects.filter(
        loan_id=promise.loan_id,
        status=CollectionTask.Status.OPEN,
        kind__in=[CollectionTask.Kind.FOLLOW_UP, CollectionTask.Kind.BROKEN_PROMISE],
    ).update(
        status=CollectionTask.Status.DONE,
        done_at=timezone.now(),
        done_note=note,
        updated_at=timezone.now(),
    )


def _broken_task(promise: PaymentPromise, today: dt.date) -> CollectionTask:
    loan = promise.loan
    owner = agent_of(loan) or promise.created_by
    return CollectionTask.objects.create(
        company_id=promise.company_id,
        loan=loan,
        kind=CollectionTask.Kind.BROKEN_PROMISE,
        due_on=today,
        assigned_to=owner,
        promise=promise,
        note=(
            f"Prometió RD$ {promise.amount:,.2f} para el {promise.promised_on:%d/%m/%Y}"
            f" y pagó RD$ {promise.paid:,.2f}."
        ),
    )


@transaction.atomic
def resolve_overdue(today: dt.date) -> list[PaymentPromise]:
    """Nightly: pending promises whose day passed become broken (F8 step 4)."""
    broken = []
    overdue = PaymentPromise.objects.select_for_update(of=("self",)).filter(
        status=PaymentPromise.Status.PENDING, promised_on__lt=today
    )
    for promise in overdue.select_related("loan__agent", "loan__collector", "created_by"):
        paid = paid_toward(promise)
        if paid >= promise.amount:  # paid but not evaluated yet: kept after all
            _close(promise, PaymentPromise.Status.KEPT, paid=paid)
            continue
        _close(promise, PaymentPromise.Status.BROKEN, paid=paid)
        if promise.loan.status == Loan.Status.ACTIVE:
            _broken_task(promise, today)
        broken.append(promise)
    return broken
