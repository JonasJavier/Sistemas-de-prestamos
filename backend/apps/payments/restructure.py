"""F11 · Reestructuración (decision 093): new conditions on the same loan.

Someone asks with the new term, frequency, rate and first date; another
person who could approve a credit of that size decides (the one approval
mechanism). Approving it writes a new calendar version over the principal
outstanding, from today: what is overdue — interest and, unless the
approver forgives it, the late fee — is spread over the new installments'
interest, and unpaid charges ride on the first one. The loan is marked
«reestructurado» for the reports and the classification. No money moves.
"""

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import ApprovalRequest
from apps.lending.models import Installment, Loan
from apps.notifications.models import Notification
from apps.notifications.services import notify, supervisors_of
from apps.payments import portfolio
from apps.payments.models import LateFeeWaiver
from apps.payments.schedule_changes import non_working
from apps.payments.services import PaymentError, new_version
from engine.money import money
from engine.rates import Frequency, RateUnit, period_rate
from engine.schedule import Method, Rounding, generate_schedule

ZERO = Decimal("0.00")
REQUEST_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL)


@dataclass(frozen=True)
class Row:
    number: int
    due_date: dt.date
    original_due_date: dt.date
    principal: Decimal
    interest: Decimal
    charges: Decimal = ZERO

    @property
    def total(self) -> Decimal:
        return self.principal + self.interest + self.charges


@dataclass
class Proposal:
    principal: Decimal
    carried_interest: Decimal
    carried_late_fee: Decimal
    carried_charges: Decimal
    waived_late_fee: Decimal
    rows: list[Row]
    replaced: list[Installment] = field(default_factory=list)
    late_fees: dict = field(default_factory=dict)  # installment id → its late fee today

    @property
    def total(self) -> Decimal:
        return sum((row.total for row in self.rows), ZERO)

    def as_dict(self) -> dict:
        return {
            "principal": str(self.principal),
            "carried_interest": str(self.carried_interest),
            "carried_late_fee": str(self.carried_late_fee),
            "carried_charges": str(self.carried_charges),
            "waived_late_fee": str(self.waived_late_fee),
            "total": str(self.total),
            "installments": [
                {
                    "number": row.number,
                    "due_date": row.due_date.isoformat(),
                    "principal": str(row.principal),
                    "interest": str(row.interest),
                    "charges": str(row.charges),
                    "total": str(row.total),
                }
                for row in self.rows
            ],
        }


def _spread(amount: Decimal, parts: int) -> list[Decimal]:
    """Even cents, the remainder on the last one."""
    if parts <= 0 or not amount:
        return [ZERO] * max(parts, 0)
    piece = money(amount / parts)
    pieces = [piece] * (parts - 1)
    return [*pieces, amount - sum(pieces, ZERO)]


def propose(
    loan: Loan,
    *,
    installments: int,
    frequency: str,
    rate: Decimal,
    first_due: dt.date | None,
    waive_late_fee: bool,
    today: dt.date,
) -> Proposal:
    if loan.status != Loan.Status.ACTIVE:
        raise PaymentError("Solo se reestructura un préstamo activo.", "state")
    product = loan.product
    if not product.min_term <= installments <= product.max_term:
        raise PaymentError(
            f"Las cuotas deben estar entre {product.min_term} y {product.max_term}.",
            "installments",
        )
    if frequency not in product.allowed_frequencies:
        raise PaymentError("El producto no permite esa frecuencia.", "frequency")
    if not product.min_rate <= rate <= product.max_rate:
        raise PaymentError(
            f"La tasa debe estar entre {product.min_rate} y {product.max_rate}.", "rate"
        )
    if first_due is not None and first_due <= today:
        raise PaymentError("La primera cuota nueva vence después de hoy.", "first_due")
    terms = portfolio.current_terms(loan)
    lines = [line for line in portfolio.position(loan, today) if line.total > 0]
    if not lines:
        raise PaymentError("No queda nada por pagar que reestructurar.", "nothing")
    principal = sum((line.principal for line in lines), ZERO)
    if principal <= 0:
        raise PaymentError("Sin capital pendiente no hay reestructuración: liquídalo.", "nothing")
    overdue = [line for line in lines if line.installment.due_date < today]
    carried_interest = sum((line.interest for line in overdue), ZERO)
    late_fee = sum((line.late_fee for line in lines), ZERO)
    carried_late_fee = ZERO if waive_late_fee else late_fee
    carried_charges = sum((line.charges for line in lines), ZERO)
    freq = Frequency(frequency)
    try:
        schedule = generate_schedule(
            principal=principal,
            periodic_rate=period_rate(rate, RateUnit(terms.rate_unit), freq),
            installments=installments,
            method=Method(terms.method),
            frequency=freq,
            disbursed_on=today,
            first_due=first_due,
            is_non_working=non_working(terms),
            rounding=Rounding(terms.payment_rounding),
        )
    except ValueError as exc:
        raise PaymentError(str(exc), "schedule") from exc
    extra = _spread(carried_interest + carried_late_fee, len(schedule))
    first_number = lines[0].installment.number
    rows = [
        Row(
            number=first_number + index,
            due_date=row.due_date,
            original_due_date=row.original_due_date,
            principal=row.principal,
            interest=row.interest + extra[index],
            charges=carried_charges if index == 0 else ZERO,
        )
        for index, row in enumerate(schedule)
    ]
    return Proposal(
        principal=principal,
        carried_interest=carried_interest,
        carried_late_fee=carried_late_fee,
        carried_charges=carried_charges,
        waived_late_fee=late_fee - carried_late_fee,
        rows=rows,
        replaced=[line.installment for line in lines],
        late_fees={line.installment.id: line.late_fee for line in lines if line.late_fee > 0},
    )


def _conditions(data: dict) -> dict:
    first_due = data.get("first_due")
    waive = data.get("waive_late_fee")
    return {
        "installments": int(data["installments"]),
        "frequency": str(data["frequency"]),
        "rate": Decimal(str(data["rate"])),
        "first_due": dt.date.fromisoformat(first_due) if first_due else None,
        "waive_late_fee": waive in (True, "true", "True", "1", 1),
    }


def conditions_from(data) -> dict:
    """The request's conditions, validated in shape (the rules in ``propose``)."""
    try:
        return _conditions(dict(data))
    except (KeyError, TypeError, ValueError, ArithmeticError) as exc:
        raise PaymentError(
            "Indica cuotas, frecuencia, tasa y, si quieres, la primera fecha.", "conditions"
        ) from exc


@transaction.atomic
def request(*, loan: Loan, user: User, conditions: dict, note: str) -> ApprovalRequest:
    """Ask for the new conditions; someone else decides (doc 06 §4)."""
    from apps.payments.reversals import _end_of_day

    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    if not authz.has_any_role(user, *REQUEST_ROLES):
        raise PaymentError("Tu rol no pide reestructuraciones.", "forbidden")
    if not authz.in_scope(user, loan.branch_id):
        raise PaymentError("El préstamo es de otra sucursal.", "out_of_scope")
    if not note.strip():
        raise PaymentError("Explica por qué se reestructura.", "note")
    if ApprovalRequest.objects.filter(
        target_id=loan.id,
        kind=ApprovalRequest.Kind.RESTRUCTURE,
        status=ApprovalRequest.Status.PENDING,
    ).exists():
        raise PaymentError("Ya hay una reestructuración pendiente para este préstamo.", "pending")
    proposal = propose(loan, **conditions, today=timezone.localdate())
    approval = ApprovalRequest.objects.create(
        company_id=loan.company_id,
        kind=ApprovalRequest.Kind.RESTRUCTURE,
        branch_id=loan.branch_id,
        target_type="lending.loan",
        target_id=loan.id,
        target_label=loan.number,
        amount=proposal.principal + proposal.carried_interest + proposal.carried_late_fee,
        note=note.strip(),
        payload={
            key: (value.isoformat() if isinstance(value, dt.date) else value)
            if not isinstance(value, Decimal)
            else str(value)
            for key, value in conditions.items()
        },
        requested_by=user,
        expires_at=_end_of_day(days=3),
    )
    notify(
        company_id=loan.company_id,
        users=supervisors_of(loan.branch_id, exclude=user),
        kind=Notification.Kind.APPROVAL_REQUESTED,
        text=f"{user.get_full_name() or user.email} pide reestructurar {loan.number} "
        f"({len(proposal.rows)} cuotas): {note.strip()}"[:300],
        link="/avisos",
    )
    record_event(
        company_id=loan.company_id,
        type="loan.restructure_requested",
        target=loan,
        actor=user,
        summary=f"Pedida la reestructuración: {len(proposal.rows)} cuotas. {note.strip()}"[:300],
    )
    return approval


def execute(approval: ApprovalRequest, *, user: User) -> Loan:
    """The approved conditions become the loan's new calendar version."""
    loan = Loan.objects.select_for_update().get(pk=approval.target_id)
    today = timezone.localdate()
    conditions = _conditions(approval.payload)
    proposal = propose(loan, **conditions, today=today)
    terms = portfolio.current_terms(loan)
    freq = Frequency(conditions["frequency"])
    version = new_version(
        loan=loan,
        base=terms,
        reason=f"Reestructuración: {approval.note}",
        user=approval.requested_by,
        on=today,
        rows=proposal.rows,
        first_number=proposal.rows[0].number,
        replaced=proposal.replaced,
        principal=proposal.principal,
        changes={
            "frequency": freq.value,
            "rate": conditions["rate"],
            "periodic_rate": period_rate(conditions["rate"], RateUnit(terms.rate_unit), freq),
            "approved_by": user,
        },
    )
    if proposal.waived_late_fee:
        for installment_id, amount in proposal.late_fees.items():
            LateFeeWaiver.objects.create(
                company_id=loan.company_id,
                installment_id=installment_id,
                amount=amount,
                note=f"Condonada en la reestructuración: {approval.note}"[:300],
                authorized_by=user,
                approval=approval,
                created_by=approval.requested_by,
            )
    Loan.objects.filter(pk=loan.pk).update(is_restructured=True)
    loan.refresh_from_db()
    portfolio.refresh(loan, today)
    record_event(
        company_id=loan.company_id,
        type="loan.restructured",
        target=loan,
        actor=user,
        summary=(
            f"Reestructurado (versión {version.version}): {len(proposal.rows)} cuotas desde el "
            f"{proposal.rows[0].due_date:%d/%m/%Y}; capital RD$ {proposal.principal:,.2f}"
            + (
                f", arrastra RD$ {proposal.carried_interest + proposal.carried_late_fee:,.2f}"
                if proposal.carried_interest + proposal.carried_late_fee
                else ""
            )
            + (
                f", condona mora RD$ {proposal.waived_late_fee:,.2f}"
                if proposal.waived_late_fee
                else ""
            )
        )[:300],
    )
    return loan
