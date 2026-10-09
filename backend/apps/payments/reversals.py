"""F12: reversing and correcting payments, and the authorizations of the
payment screen (doc 03 - section 10; doc 06 - sections 4 and 5).

Nothing is deleted: a payment is reversed whole, with an inverse entry
linked to the original, and the installments go back to what they were.
Only the last standing payment of a loan can be reversed (later ones
would have been allocated on top of it); «Corregir pago» reverses it and
registers the right one in the same transaction (E14). Every reversal is
asked by one person and authorized by another, within their limit.
"""

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import ApprovalLimit, User
from apps.audit.models import record_event
from apps.cash import services as cash
from apps.cash.models import CashSession, RouteSession
from apps.core.models import ApprovalRequest, Reason
from apps.customers.access import can_serve
from apps.customers.models import Collateral
from apps.ledger import services as ledger
from apps.lending.models import Installment, Loan
from apps.notifications.models import Notification
from apps.notifications.services import notify, supervisors_of
from apps.payments import portfolio
from apps.payments.models import Payment, PaymentAllocation, PaymentReversal
from apps.payments.services import (
    PaymentError,
    _apply_to_installments,
    new_version,
    post_payment,
)
from engine.allocation import Applied
from engine.money import money
from engine.schedule import Installment as Row

ZERO = Decimal("0.00")
REQUEST_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.CAJERO)
DECIDE_ROLES = (authz.GERENTE, authz.SUPERVISOR)
OPERATION = {
    ApprovalRequest.Kind.WAIVE_LATE_FEE: ApprovalLimit.Operation.WAIVE_LATE_FEE,
    ApprovalRequest.Kind.PAYOFF_DISCOUNT: ApprovalLimit.Operation.PAYOFF_DISCOUNT,
    ApprovalRequest.Kind.REVERSAL: ApprovalLimit.Operation.AUTHORIZE_REVERSAL,
    ApprovalRequest.Kind.CORRECTION: ApprovalLimit.Operation.AUTHORIZE_REVERSAL,
}
REVERSAL_KINDS = (ApprovalRequest.Kind.REVERSAL, ApprovalRequest.Kind.CORRECTION)


def _person(user: User) -> str:
    return user.get_full_name() or user.email


def _end_of_day(days: int = 0):
    from apps.customers.access import end_of_day

    return end_of_day() + dt.timedelta(days=days)


# --- Reversals ---------------------------------------------------------------------------


def last_standing(loan: Loan) -> Payment | None:
    return (
        Payment.objects.filter(loan=loan, status=Payment.Status.POSTED)
        .order_by("-paid_at", "-created_at")
        .first()
    )


def check_reversible(payment: Payment) -> None:
    if payment.status != Payment.Status.POSTED:
        raise PaymentError("Ese pago ya fue reversado.", "state")
    if payment.kind == Payment.Kind.MIGRATED:
        raise PaymentError("Los pagos migrados no se reversan desde aquí.", "migrated")
    last = last_standing(payment.loan)
    if last is not None and last.pk != payment.pk:
        raise PaymentError(
            f"Solo se reversa el último pago del préstamo ({last.number}): "
            "reversa primero los posteriores.",
            "not_last",
        )


def _check_request(payment: Payment, user: User, correct_amount: Decimal | None) -> None:
    if not authz.has_any_role(user, *REQUEST_ROLES):
        raise PaymentError("Tu rol no pide reversos.", "forbidden")
    loan = payment.loan
    if not can_serve(user, branch_id=loan.branch_id, customer_id=loan.customer_id):
        raise PaymentError("El pago es de otra sucursal.", "out_of_scope")
    check_reversible(payment)
    if correct_amount is not None:
        if payment.kind != Payment.Kind.REGULAR:
            raise PaymentError("Solo se corrige un cobro regular; este se reversa.", "kind")
        if correct_amount <= 0 or correct_amount == payment.amount:
            raise PaymentError("El monto correcto debe ser otro y mayor que cero.", "amount")
        route = payment.route_session
        if route is not None and route.status == RouteSession.Status.OPEN:
            raise PaymentError(
                "El efectivo sigue con el cobrador: corrige este cobro después de la rendición.",
                "route_open",
            )


def request_reversal(
    *,
    payment: Payment,
    user: User,
    reason: Reason,
    note: str,
    correct_amount: Decimal | None = None,
) -> ApprovalRequest:
    """F12 step 1: the cashier asks, with the reason; someone else decides."""
    payment = Payment.objects.select_related("loan", "route_session").get(pk=payment.pk)
    correct_amount = money(correct_amount) if correct_amount is not None else None
    _check_request(payment, user, correct_amount)
    if reason.kind != Reason.Kind.REVERSAL or not reason.is_active:
        raise PaymentError("Elige un motivo de reverso del catálogo.", "reason")
    if not note.strip():
        raise PaymentError("Explica en la nota qué pasó.", "note")
    if ApprovalRequest.objects.filter(
        target_id=payment.id, kind__in=REVERSAL_KINDS, status=ApprovalRequest.Status.PENDING
    ).exists():
        raise PaymentError("Ya hay una solicitud pendiente para este pago.", "pending")
    kind = ApprovalRequest.Kind.CORRECTION if correct_amount else ApprovalRequest.Kind.REVERSAL
    request = ApprovalRequest.objects.create(
        company_id=payment.company_id,
        kind=kind,
        branch_id=payment.branch_id,
        target_type="payments.payment",
        target_id=payment.id,
        target_label=payment.number,
        amount=payment.amount,
        reason=reason,
        note=note.strip(),
        payload={"correct_amount": str(correct_amount)} if correct_amount else {},
        requested_by=user,
        expires_at=_end_of_day(days=2),
    )
    verb = (
        f"corregir {payment.number} a RD$ {correct_amount:,.2f}"
        if correct_amount
        else f"reversar {payment.number}"
    )
    notify(
        company_id=payment.company_id,
        users=supervisors_of(payment.branch_id, exclude=user),
        kind=Notification.Kind.APPROVAL_REQUESTED,
        text=f"{_person(user)} pide {verb} (RD$ {payment.amount:,.2f}): {reason.text}.",
        link="/avisos",
    )
    record_event(
        company_id=payment.company_id,
        type="payment.reversal_requested",
        target=payment.loan,
        actor=user,
        summary=f"Pedido: {verb}. {reason.text}",
    )
    return request


def _redirect(payment: Payment, requester: User) -> dict:
    """A payment whose cash session closed (or whose route was settled) is
    reversed in the requester's drawer open today (doc 03 - section 10)."""
    closed_cash = (
        payment.cash_session is not None and payment.cash_session.status != CashSession.Status.OPEN
    )
    settled_route = (
        payment.route_session is not None
        and payment.route_session.status != RouteSession.Status.OPEN
    )
    if payment.method != Payment.Method.CASH or not (closed_cash or settled_route):
        return {}
    session = cash.open_session_of(requester)
    if session is None:
        raise PaymentError(
            "La caja de ese cobro ya cerró: quien pidió el reverso debe tener su caja abierta.",
            "no_session",
        )
    return {
        payment.financial_account_id: (
            session.drawer,
            {"cash_session_id": session.id, "route_session_id": None},
        )
    }


def _restore_schedule(payment: Payment, user: User, today: dt.date):
    """Undo a prepayment: a new version with the installments it replaced."""
    replaced = list(
        Installment.objects.filter(id__in=payment.new_terms.replaced_installments).order_by(
            "number"
        )
    )
    current = list(payment.new_terms.schedule.exclude(status=Installment.Status.SUPERSEDED))
    rows = [
        Row(
            number=inst.number,
            due_date=inst.due_date,
            original_due_date=inst.original_due_date,
            principal=inst.principal_due,
            interest=inst.interest_due,
        )
        for inst in replaced
    ]
    return new_version(
        loan=payment.loan,
        base=replaced[0].terms,
        reason=f"Reverso del abono {payment.number}",
        user=user,
        on=today,
        rows=rows,
        first_number=replaced[0].number,
        replaced=current,
        principal=sum((row.principal for row in rows), ZERO),
    )


@transaction.atomic
def execute_reversal(
    *,
    payment: Payment,
    requested_by: User,
    authorized_by: User,
    reason: Reason,
    note: str,
    approval: ApprovalRequest | None = None,
    correct_amount: Decimal | None = None,
    dry_run: bool = False,
) -> PaymentReversal | None:
    """``dry_run`` (the preview) skips the record that needs two people."""
    loan = Loan.objects.select_for_update().get(pk=payment.loan_id)
    payment = Payment.objects.select_related(
        "cash_session", "route_session", "journal_entry", "new_terms", "loan"
    ).get(pk=payment.pk)
    check_reversible(payment)
    if loan.status not in (Loan.Status.ACTIVE, Loan.Status.PAID_OFF):
        raise PaymentError("El préstamo ya no admite reversos.", "state")
    today = timezone.localdate()
    try:
        entry = ledger.reverse_entry(
            payment.journal_entry,
            on=today,
            description=f"Reverso del cobro {payment.number}: {reason.text}",
            created_by=authorized_by,
            redirect=_redirect(payment, requested_by),
        )
    except ledger.InsufficientFunds as exc:
        raise PaymentError(
            "No hay efectivo suficiente en la caja para devolver ese cobro.", "insufficient_funds"
        ) from exc

    pieces: dict = {}
    for row in PaymentAllocation.objects.filter(payment=payment):
        pieces.setdefault(row.installment_id, {})[row.component] = row.amount
    _apply_to_installments(
        [Applied(key=key, **components) for key, components in pieces.items()], sign=-1
    )
    waived = {}
    for waiver in payment.waivers.all():
        waived[waiver.installment_id] = waived.get(waiver.installment_id, ZERO) + waiver.amount
    if waived:
        rows = Installment.objects.select_for_update().in_bulk(list(waived))
        for key, inst in rows.items():
            inst.late_fee_waived -= waived[key]
        Installment.objects.bulk_update(rows.values(), ["late_fee_waived"])
    if payment.kind == Payment.Kind.PAYOFF:
        # Only a payoff forgives interest, and nothing can follow it.
        loan.installments.filter(interest_waived__gt=0).update(interest_waived=ZERO)
    restored = None
    if payment.new_terms_id:
        restored = _restore_schedule(payment, authorized_by, today)

    if loan.status == Loan.Status.PAID_OFF:
        loan.status = Loan.Status.ACTIVE
        loan.closed_on = None
        for item in loan.collaterals.select_related("collateral"):
            collateral = item.collateral
            if collateral.status == Collateral.Status.RELEASED:
                collateral.status = Collateral.Status.PLEDGED
                collateral.save(update_fields=["status", "updated_at"])
            elif collateral.status != Collateral.Status.PLEDGED:
                raise PaymentError(
                    f"La garantía «{collateral.description}» ya no está disponible.", "collateral"
                )
    payment.status = Payment.Status.REVERSED
    payment.save(update_fields=["status", "updated_at"])
    session = cash.open_session_of(requested_by)
    reversal = (
        None
        if dry_run
        else PaymentReversal.objects.create(
            company_id=payment.company_id,
            payment=payment,
            reason=reason,
            note=note,
            requested_by=requested_by,
            authorized_by=authorized_by,
            approval=approval,
            reversed_on=today,
            journal_entry=entry,
            cash_session=session if payment.method == Payment.Method.CASH else None,
            restored_terms=restored,
        )
    )
    loan.last_payment_on = (
        Payment.objects.filter(loan=loan, status=Payment.Status.POSTED)
        .order_by("-value_date")
        .values_list("value_date", flat=True)
        .first()
    )
    portfolio.refresh(loan, today)
    from apps.collections.promises import evaluate

    evaluate(loan, today)  # the promise it kept may be pending (or broken) again
    record_event(
        company_id=payment.company_id,
        type="payment.reversed",
        target=loan,
        actor=authorized_by,
        summary=f"Reversado {payment.number} (RD$ {payment.amount:,.2f}): {reason.text}",
        data={"payment": str(payment.id), "requested_by": str(requested_by.pk)},
    )
    if correct_amount is not None:
        replacement = post_payment(
            loan=loan,
            user=requested_by,
            amount=correct_amount,
            method=payment.method,
            idempotency_key=f"correction:{payment.id}",
            received=correct_amount,
            reference=payment.reference or f"Corrige {payment.number}",
            bank_account=payment.financial_account
            if payment.method != Payment.Method.CASH
            else None,
        )
        if reversal is not None:
            reversal.replacement = replacement
            reversal.save(update_fields=["replacement", "updated_at"])
    return reversal


@dataclass(frozen=True)
class Effect:
    """F12 step 2: how the installments, the cash and the balance end up."""

    installments: list[dict]
    cash_out: Decimal
    cash_in: Decimal
    principal_before: Decimal
    principal_after: Decimal


class _Rollback(Exception):
    def __init__(self, effect: Effect) -> None:
        self.effect = effect


def preview(payment: Payment, *, user: User, correct_amount: Decimal | None = None) -> Effect:
    """Run the reversal for real inside a savepoint, read the result and
    roll it back: the preview can never disagree with what will happen."""
    payment = Payment.objects.select_related("loan").get(pk=payment.pk)
    correct_amount = money(correct_amount) if correct_amount is not None else None
    _check_request(payment, user, correct_amount)
    before = payment.loan.principal_outstanding
    reason = Reason.objects.filter(kind=Reason.Kind.REVERSAL).first() or Reason(text="vista previa")
    try:
        with transaction.atomic():
            execute_reversal(
                payment=payment,
                requested_by=user,
                authorized_by=user,
                reason=reason,
                note="vista previa",
                correct_amount=correct_amount,
                dry_run=True,
            )
            loan = Loan.objects.get(pk=payment.loan_id)
            rows = [
                {
                    "number": inst.number,
                    "due_date": inst.due_date.isoformat(),
                    "status": inst.status,
                    "owed": str(
                        inst.principal_outstanding
                        + inst.interest_outstanding
                        + inst.charges_outstanding
                    ),
                }
                for inst in portfolio.current_installments(loan)
            ]
            raise _Rollback(
                Effect(
                    installments=rows,
                    cash_out=payment.amount,
                    cash_in=correct_amount or ZERO,
                    principal_before=before,
                    principal_after=loan.principal_outstanding,
                )
            )
    except _Rollback as done:
        return done.effect


# --- Authorizations (P11) ------------------------------------------------------------------


def request_authorization(
    *, loan: Loan, user: User, kind: str, amount: Decimal, note: str
) -> ApprovalRequest:
    """A waiver or a payoff discount above the user's limit (F5 step 4)."""
    if kind not in (ApprovalRequest.Kind.WAIVE_LATE_FEE, ApprovalRequest.Kind.PAYOFF_DISCOUNT):
        raise PaymentError("Tipo de autorización desconocido.")
    if not authz.has_any_role(user, *REQUEST_ROLES):
        raise PaymentError("Tu rol no pide esta autorización.", "forbidden")
    if not can_serve(user, branch_id=loan.branch_id, customer_id=loan.customer_id):
        raise PaymentError("El préstamo es de otra sucursal.", "out_of_scope")
    amount = money(amount)
    if amount <= 0:
        raise PaymentError("El monto debe ser mayor que cero.")
    if not note.strip():
        raise PaymentError("Explica el motivo.", "note")
    request = ApprovalRequest.objects.create(
        company_id=loan.company_id,
        kind=kind,
        branch_id=loan.branch_id,
        target_type="lending.loan",
        target_id=loan.id,
        target_label=loan.number,
        amount=amount,
        note=note.strip(),
        requested_by=user,
        expires_at=_end_of_day(),
    )
    notify(
        company_id=loan.company_id,
        users=supervisors_of(loan.branch_id, exclude=user),
        kind=Notification.Kind.APPROVAL_REQUESTED,
        text=(
            f"{_person(user)} pide {request.get_kind_display().lower()} de RD$ {amount:,.2f} "
            f"en {loan.number}: {note.strip()}"
        ),
        link="/avisos",
    )
    return request


def can_decide(user: User, request: ApprovalRequest) -> bool:
    return (
        request.requested_by_id != user.pk
        and authz.has_any_role(user, *DECIDE_ROLES)
        and authz.in_scope(user, request.branch_id)
        and authz.within_limit(user, OPERATION[request.kind], request.amount)
    )


@transaction.atomic
def decide(
    *, request: ApprovalRequest, user: User, approve: bool, note: str = ""
) -> ApprovalRequest:
    request = ApprovalRequest.objects.select_for_update().get(pk=request.pk)
    if request.status != ApprovalRequest.Status.PENDING:
        raise PaymentError("Esa solicitud ya fue respondida.", "state")
    if request.expires_at <= timezone.now():
        request.status = ApprovalRequest.Status.EXPIRED
        request.save(update_fields=["status", "updated_at"])
        raise PaymentError("La solicitud venció.", "expired")
    if request.requested_by_id == user.pk:
        raise PaymentError("Nadie autoriza lo que pidió.", "forbidden")
    if not can_decide(user, request):
        raise PaymentError(
            f"No puedes autorizar {request.get_kind_display().lower()} de "
            f"RD$ {request.amount:,.2f} (rol, sucursal o límite).",
            "forbidden",
        )
    if not approve and not note.strip():
        raise PaymentError("Explica por qué la rechazas.", "note")
    request.decided_by = user
    request.decided_at = timezone.now()
    request.decision_note = note.strip()
    request.status = ApprovalRequest.Status.APPROVED if approve else ApprovalRequest.Status.REJECTED
    if approve and request.kind in REVERSAL_KINDS:
        payment = Payment.objects.get(pk=request.target_id)
        correct = request.payload.get("correct_amount")
        execute_reversal(
            payment=payment,
            requested_by=request.requested_by,
            authorized_by=user,
            reason=request.reason,
            note=request.note,
            approval=request,
            correct_amount=Decimal(correct) if correct else None,
        )
        request.status = ApprovalRequest.Status.USED
        request.used_at = timezone.now()
    request.save()
    verdict = "aprobó" if approve else "rechazó"
    notify(
        company_id=request.company_id,
        users=[request.requested_by],
        kind=Notification.Kind.APPROVAL_DECIDED,
        text=(
            f"{_person(user)} {verdict} {request.get_kind_display().lower()} de "
            f"{request.target_label} (RD$ {request.amount:,.2f})"
            + (f": {request.decision_note}" if request.decision_note else ".")
        ),
        link="/avisos",
    )
    return request


def cancel(*, request: ApprovalRequest, user: User) -> ApprovalRequest:
    if request.requested_by_id != user.pk:
        raise PaymentError("Solo quien la pidió la cancela.", "forbidden")
    if request.status not in (ApprovalRequest.Status.PENDING, ApprovalRequest.Status.APPROVED):
        raise PaymentError("Esa solicitud ya no se puede cancelar.", "state")
    request.status = ApprovalRequest.Status.CANCELLED
    request.save(update_fields=["status", "updated_at"])
    return request


def expire_requests() -> int:
    return ApprovalRequest.objects.filter(
        status__in=[ApprovalRequest.Status.PENDING, ApprovalRequest.Status.APPROVED],
        expires_at__lte=timezone.now(),
    ).update(status=ApprovalRequest.Status.EXPIRED)
