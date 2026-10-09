"""Resolving cash differences (decision 075, doc 03 §16.1).

- Shortage: the responsible person **repays** it in cash into an open drawer
  (his own, or a supervisor's who receives it), or the manager takes it as a
  **loss**. Never through payroll: art. 201 of the Labour Code does not list
  it among the deductions an employer may make.
- Overage: it may belong to a customer, so it waits as a liability; within
  30 days it is **applied** from an open drawer (returned, or covering a
  payment registered later); after that the nightly job turns it into other
  **income**.
"""

import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.cash.models import CashDifference, CashDifferenceAction
from apps.cash.services import CashError, open_session_of
from apps.ledger import services as ledger
from apps.notifications.models import Notification
from apps.notifications.services import managers, notify
from engine.money import money

ZERO = Decimal("0.00")
CLAIM_DAYS = 30
DRAWER_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.CAJERO)
DECIDE_ROLES = (authz.GERENTE, authz.SUPERVISOR)


def _locked(difference: CashDifference) -> CashDifference:
    difference = (
        CashDifference.objects.select_for_update(of=("self",))
        .select_related("branch", "person")
        .get(pk=difference.pk)
    )
    if difference.status != CashDifference.Status.OPEN:
        raise CashError("Esa diferencia ya está resuelta.", "state")
    return difference


def _amount(difference: CashDifference, amount: Decimal | None) -> Decimal:
    amount = difference.outstanding if amount is None else money(amount)
    if amount <= 0 or amount > difference.outstanding:
        raise CashError(
            f"El monto va de RD$ 0.01 a lo pendiente (RD$ {difference.outstanding:,.2f}).",
            "amount",
        )
    return amount


def _apply(
    difference: CashDifference,
    *,
    action: str,
    amount: Decimal,
    lines: list[ledger.Line],
    description: str,
    user: User | None,
    note: str = "",
) -> CashDifferenceAction:
    entry = ledger.post_entry(
        company_id=difference.company_id,
        branch=difference.branch,
        on=timezone.localdate(),
        description=description[:300],
        source_type="cash.difference_resolution",
        source_id=difference.id,
        lines=lines,
        created_by=user,
    )
    step = CashDifferenceAction.objects.create(
        company_id=difference.company_id,
        difference=difference,
        action=action,
        amount=amount,
        entry=entry,
        user=user,
        note=note.strip()[:300],
    )
    CashDifference.objects.filter(pk=difference.pk).update(resolved=F("resolved") + amount)
    difference.refresh_from_db(fields=["resolved"])
    if difference.resolved == difference.amount:
        difference.status = CashDifference.Status.RESOLVED
        difference.save(update_fields=["status", "updated_at"])
    record_event(
        company_id=difference.company_id,
        type="cash.difference_resolved",
        target=difference,
        actor=user,
        summary=f"{difference.get_kind_display()}: {step.get_action_display()} RD$ {amount:,.2f}",
    )
    return step


def _drawer_session(user: User):
    if not authz.has_any_role(user, *DRAWER_ROLES):
        raise CashError("Solo el cajero, el supervisor o el gerente mueven efectivo.", "forbidden")
    session = open_session_of(user)
    if session is None:
        raise CashError("Abre tu caja: el efectivo entra o sale por ella.", "no_session")
    return session


@transaction.atomic
def repay(
    *, difference: CashDifference, user: User, amount: Decimal | None = None, note: str = ""
) -> CashDifferenceAction:
    """The person hands the missing cash into an open drawer."""
    difference = _locked(difference)
    if difference.kind != CashDifference.Kind.SHORTAGE:
        raise CashError("Solo un faltante se repone.", "kind")
    session = _drawer_session(user)
    if not authz.in_scope(user, difference.branch_id):
        raise CashError("La diferencia es de otra sucursal.", "out_of_scope")
    amount = _amount(difference, amount)
    return _apply(
        difference,
        action=CashDifferenceAction.Action.REPAID,
        amount=amount,
        lines=[
            ledger.cash_line(session.drawer, debit_amount=amount, cash_session_id=session.id),
            ledger.credit(ledger.system_account(difference.company_id, "cash_shortage"), amount),
        ],
        description=f"Reposición de faltante de {difference.person.get_full_name()} "
        f"en la caja {session.number}",
        user=user,
        note=note,
    )


@transaction.atomic
def take_loss(*, difference: CashDifference, user: User, note: str) -> CashDifferenceAction:
    """The manager decides the company bears it (an expense)."""
    difference = _locked(difference)
    if difference.kind != CashDifference.Kind.SHORTAGE:
        raise CashError("Solo un faltante se asume como pérdida.", "kind")
    if not authz.has_any_role(user, authz.GERENTE):
        raise CashError("Solo el gerente asume un faltante como pérdida.", "forbidden")
    if not note.strip():
        raise CashError("Escribe por qué la empresa asume el faltante.", "note")
    amount = difference.outstanding
    company_id = difference.company_id
    return _apply(
        difference,
        action=CashDifferenceAction.Action.LOSS,
        amount=amount,
        lines=[
            ledger.debit(ledger.system_account(company_id, "cash_shortage_loss"), amount),
            ledger.credit(ledger.system_account(company_id, "cash_shortage"), amount),
        ],
        description=f"Faltante de {difference.person.get_full_name()} asumido como pérdida",
        user=user,
        note=note,
    )


@transaction.atomic
def apply_overage(
    *, difference: CashDifference, user: User, amount: Decimal | None = None, note: str
) -> CashDifferenceAction:
    """The overage leaves an open drawer: returned to its owner, or covering a
    payment that was registered after the count."""
    difference = _locked(difference)
    if difference.kind != CashDifference.Kind.OVERAGE:
        raise CashError("Solo un sobrante se aplica.", "kind")
    if not authz.has_any_role(user, *DECIDE_ROLES) and user.pk != difference.person_id:
        raise CashError("Lo aplica el supervisor o quien tuvo el sobrante.", "forbidden")
    if not note.strip():
        raise CashError("Escribe a quién se devolvió o qué pago cubre.", "note")
    session = _drawer_session(user)
    amount = _amount(difference, amount)
    try:
        return _apply(
            difference,
            action=CashDifferenceAction.Action.APPLIED,
            amount=amount,
            lines=[
                ledger.debit(
                    ledger.system_account(difference.company_id, "cash_overage_pending"), amount
                ),
                ledger.cash_line(session.drawer, credit_amount=amount, cash_session_id=session.id),
            ],
            description=f"Sobrante aplicado desde la caja {session.number}: {note.strip()}",
            user=user,
            note=note,
        )
    except ledger.InsufficientFunds as exc:
        raise CashError(str(exc), "insufficient_funds") from exc


def _to_income(difference: CashDifference, user: User | None, note: str) -> CashDifferenceAction:
    amount = difference.outstanding
    company_id = difference.company_id
    return _apply(
        difference,
        action=CashDifferenceAction.Action.INCOME,
        amount=amount,
        lines=[
            ledger.debit(ledger.system_account(company_id, "cash_overage_pending"), amount),
            ledger.credit(ledger.system_account(company_id, "cash_overage"), amount),
        ],
        description="Sobrante de caja sin reclamar pasado a otros ingresos",
        user=user,
        note=note,
    )


@transaction.atomic
def overage_to_income(
    *, difference: CashDifference, user: User, note: str = ""
) -> CashDifferenceAction:
    difference = _locked(difference)
    if difference.kind != CashDifference.Kind.OVERAGE:
        raise CashError("Solo un sobrante pasa a ingresos.", "kind")
    if not authz.has_any_role(user, *DECIDE_ROLES):
        raise CashError("Lo decide el supervisor o el gerente.", "forbidden")
    return _to_income(difference, user, note or "Nadie lo reclamó")


def nightly(today: dt.date) -> dict:
    """Unclaimed overages become income after 30 days; shortages open for 30
    days warn the managers once."""
    limit = today - dt.timedelta(days=CLAIM_DAYS)
    moved = 0
    for difference in CashDifference.objects.filter(
        kind=CashDifference.Kind.OVERAGE,
        status=CashDifference.Status.OPEN,
        occurred_on__lte=limit,
    ):
        with transaction.atomic():
            _to_income(_locked(difference), None, f"Sin reclamar en {CLAIM_DAYS} días")
            moved += 1
    stale = list(
        CashDifference.objects.filter(
            kind=CashDifference.Kind.SHORTAGE,
            status=CashDifference.Status.OPEN,
            occurred_on__lte=limit,
            warned_at__isnull=True,
        ).select_related("person")
    )
    if stale:
        total = sum((d.outstanding for d in stale), ZERO)
        notify(
            company_id=stale[0].company_id,
            users=managers(),
            kind=Notification.Kind.CASH_DIFFERENCE,
            text=f"{len(stale)} faltante(s) de caja llevan más de {CLAIM_DAYS} días sin resolver "
            f"(RD$ {total:,.2f}).",
            link="/cajas",
        )
        CashDifference.objects.filter(pk__in=[d.pk for d in stale]).update(warned_at=timezone.now())
    return {"overages_to_income": moved, "shortages_warned": len(stale)}
