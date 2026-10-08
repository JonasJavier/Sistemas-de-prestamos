"""F7 (a cashier's day) and the collector's settlement of F6.

Every peso that enters or leaves a drawer is a journal line carrying the
session, so «esperado» is always the books' figure (doc 05 - 4.6). The
rules of decision 025 hold in the database too: one open session per
cashier and per collector, and nobody approves their own closing.
"""

import datetime as dt
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import ApprovalLimit, User
from apps.audit.models import record_event
from apps.cash.models import DENOMINATIONS, CashCount, CashSession, RouteSession
from apps.core.models import Branch, Reason, Sequence
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount, JournalLine
from apps.notifications.models import Notification
from apps.notifications.services import notify, supervisors_of
from engine.money import money

ZERO = Decimal("0.00")
CASHIER_ROLES = (authz.CAJERO, authz.SUPERVISOR)  # «Abrir y cerrar su caja»
APPROVER_ROLES = (authz.GERENTE, authz.SUPERVISOR)  # «Aprobar un cierre»


class CashError(Exception):
    """A rule of F6/F7; the message is user-facing."""

    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


def _person(user: User) -> str:
    return user.get_full_name() or user.email


def _personal_account(user: User, branch: Branch, kind: str) -> FinancialAccount:
    """The cashier's drawer or the collector's cash at a branch, created on first use."""
    account = FinancialAccount.objects.filter(holder=user, branch=branch, kind=kind).first()
    if account is not None:
        return account
    label = "Caja de" if kind == FinancialAccount.Kind.DRAWER else "Efectivo de"
    name = f"{label} {_person(user)} · {branch.code}"
    if FinancialAccount.objects.filter(name=name).exists():
        name = f"{name} ({user.email})"
    return ledger.create_financial_account(
        company_id=branch.company_id, name=name[:100], kind=kind, branch=branch, holder=user
    )


def _check_general_account(account: FinancialAccount, branch: Branch, label: str) -> None:
    if (
        account.company_id != branch.company_id
        or not account.is_active
        or account.is_personal
        or account.branch_id not in (None, branch.id)
    ):
        raise CashError(f"La cuenta de {label} no está disponible para esta sucursal.", "account")


def _session_cash(session: CashSession) -> Decimal:
    totals = JournalLine.objects.filter(
        cash_session=session, financial_account_id=session.drawer_id
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    return (totals["debit"] or ZERO) - (totals["credit"] or ZERO)


def expected_cash(session: CashSession) -> Decimal:
    """What should be in the drawer: what was left last time plus the
    session's own lines on it (doc 05: «el esperado sale del libro»)."""
    return session.carried_over + _session_cash(session)


def open_session_of(user: User) -> CashSession | None:
    return CashSession.objects.filter(cashier=user, status=CashSession.Status.OPEN).first()


def open_route_of(user: User) -> RouteSession | None:
    return RouteSession.objects.filter(collector=user, status=RouteSession.Status.OPEN).first()


# --- Opening ------------------------------------------------------------------------


@transaction.atomic
def open_session(
    *,
    user: User,
    branch: Branch,
    amount: Decimal = ZERO,
    fund_from: FinancialAccount | None = None,
) -> CashSession:
    """F7 step 1: the drawer keeps what was left; the fund tops it up."""
    if not authz.has_any_role(user, *CASHIER_ROLES):
        raise CashError("Solo el cajero o el supervisor abren una caja.", "forbidden")
    if not authz.in_scope(user, branch.id):
        raise CashError("No trabajas en esa sucursal.", "out_of_scope")
    current = open_session_of(user)
    if current is not None:
        raise CashError(
            f"Ya tienes la caja {current.number} abierta: ciérrala antes de abrir otra.", "open"
        )
    amount = money(amount)
    if amount < 0:
        raise CashError("El fondo no puede ser negativo.")
    if amount and fund_from is None:
        raise CashError("Indica de qué caja sale el fondo.", "account")
    if fund_from is not None and amount:
        _check_general_account(fund_from, branch, "origen del fondo")

    drawer = _personal_account(user, branch, FinancialAccount.Kind.DRAWER)
    today = timezone.localdate()
    try:
        with transaction.atomic():
            session = CashSession.objects.create(
                company_id=branch.company_id,
                number=Sequence.allocate(branch, Sequence.DocType.CASH_SESSION),
                branch=branch,
                cashier=user,
                drawer=drawer,
                business_date=today,
                carried_over=ledger.balance_of(drawer.ledger_account),
                funded_amount=amount,
                funded_from=fund_from if amount else None,
            )
    except IntegrityError as exc:  # a concurrent opening won the race
        raise CashError("Ya tienes una caja abierta.", "open") from exc
    if amount:
        try:
            ledger.post_entry(
                company_id=branch.company_id,
                branch=branch,
                on=today,
                description=f"Fondo de apertura de la caja {session.number}",
                source_type="cash.funding",
                source_id=session.id,
                lines=[
                    ledger.Line(
                        account=drawer.ledger_account,
                        debit=amount,
                        financial_account=drawer,
                        cash_session_id=session.id,
                    ),
                    ledger.cash_line(fund_from, credit_amount=amount),
                ],
                created_by=user,
            )
        except ledger.InsufficientFunds as exc:
            raise CashError(str(exc), "insufficient_funds") from exc
    record_event(
        company_id=branch.company_id,
        type="cash.opened",
        target=session,
        actor=user,
        summary=f"Caja {session.number} abierta con RD$ {session.carried_over + amount:,.2f}",
    )
    return session


# --- During the day --------------------------------------------------------------------


@transaction.atomic
def move(
    *,
    session: CashSession,
    user: User,
    account: FinancialAccount,
    amount: Decimal,
    incoming: bool,
    note: str = "",
) -> CashSession:
    """More fund from the general cash, or a deposit / transfer out (F7 step 2)."""
    session = CashSession.objects.select_for_update().get(pk=session.pk)
    if session.cashier_id != user.pk:
        raise CashError("Solo el cajero mueve el efectivo de su caja.", "forbidden")
    if session.status != CashSession.Status.OPEN:
        raise CashError("La caja ya está cerrada.", "state")
    _check_general_account(account, session.branch, "destino" if not incoming else "origen")
    amount = money(amount)
    if amount <= 0:
        raise CashError("El monto debe ser mayor que cero.")
    drawer_line = ledger.Line(
        account=session.drawer.ledger_account,
        debit=amount if incoming else ZERO,
        credit=ZERO if incoming else amount,
        financial_account=session.drawer,
        cash_session_id=session.id,
    )
    other = (
        ledger.cash_line(account, credit_amount=amount)
        if incoming
        else ledger.cash_line(account, debit_amount=amount)
    )
    verb = f"Fondo desde {account.name}" if incoming else f"Traslado a {account.name}"
    try:
        ledger.post_entry(
            company_id=session.company_id,
            branch=session.branch,
            on=timezone.localdate(),
            description=f"{verb} · caja {session.number}" + (f": {note}" if note else ""),
            source_type="cash.transfer",
            source_id=session.id,
            lines=[drawer_line, other],
            created_by=user,
        )
    except ledger.InsufficientFunds as exc:
        raise CashError(str(exc), "insufficient_funds") from exc
    return session


# --- Closing (F7 steps 3-5) ---------------------------------------------------------


def _count_total(counts: dict[str, int]) -> Decimal:
    total = ZERO
    for denomination, quantity in counts.items():
        if denomination not in DENOMINATIONS:
            raise CashError(f"Denominación desconocida: {denomination}.")
        if quantity < 0:
            raise CashError("Las cantidades no pueden ser negativas.")
        total += Decimal(denomination) * quantity
    return money(total)


def _difference_lines(
    *, session_dims: dict, account: FinancialAccount, difference: Decimal
) -> list[ledger.Line]:
    """Shortage: owed by the person (asset); overage: extraordinary income."""
    company_id = account.company_id
    if difference < 0:
        return [
            ledger.debit(ledger.system_account(company_id, "cash_shortage"), -difference),
            ledger.Line(
                account=account.ledger_account,
                credit=-difference,
                financial_account=account,
                **session_dims,
            ),
        ]
    return [
        ledger.Line(
            account=account.ledger_account,
            debit=difference,
            financial_account=account,
            **session_dims,
        ),
        ledger.credit(ledger.system_account(company_id, "cash_overage"), difference),
    ]


def _check_difference_reason(difference: Decimal, reason: Reason | None, note: str) -> None:
    if difference == 0:
        return
    if reason is None or reason.kind != Reason.Kind.CASH_DIFFERENCE:
        raise CashError("Hay diferencia: elige el motivo del catálogo.", "reason")
    if not note.strip():
        raise CashError("Hay diferencia: explica qué pasó en la nota.", "note")


@transaction.atomic
def close_session(
    *,
    session: CashSession,
    user: User,
    counts: dict[str, int],
    reason: Reason | None = None,
    note: str = "",
    return_to: FinancialAccount | None = None,
    return_amount: Decimal = ZERO,
) -> CashSession:
    session = (
        CashSession.objects.select_for_update()
        .select_related("drawer", "branch")
        .get(pk=session.pk)
    )
    if session.cashier_id != user.pk:
        raise CashError("Cada cajero cierra su propia caja.", "forbidden")
    if session.status != CashSession.Status.OPEN:
        raise CashError("La caja ya está cerrada.", "state")
    counted = _count_total(counts)
    expected = expected_cash(session)
    difference = counted - expected
    _check_difference_reason(difference, reason, note)
    return_amount = money(return_amount)
    if return_amount < 0 or return_amount > counted:
        raise CashError("Lo que se traslada no puede superar lo contado.")
    if return_amount and return_to is None:
        raise CashError("Indica a qué caja o banco se traslada el efectivo.", "account")
    if return_to is not None and return_amount:
        _check_general_account(return_to, session.branch, "destino")

    today = timezone.localdate()
    dims = {"cash_session_id": session.id}
    if difference:
        session.difference_entry = ledger.post_entry(
            company_id=session.company_id,
            branch=session.branch,
            on=today,
            description=(
                f"{'Faltante' if difference < 0 else 'Sobrante'} de la caja {session.number}"
            ),
            source_type="cash.difference",
            source_id=session.id,
            lines=_difference_lines(
                session_dims=dims, account=session.drawer, difference=difference
            ),
            created_by=user,
        )
    if return_amount:
        ledger.post_entry(
            company_id=session.company_id,
            branch=session.branch,
            on=today,
            description=f"Cierre de la caja {session.number}: traslado a {return_to.name}",
            source_type="cash.transfer",
            source_id=session.id,
            lines=[
                ledger.cash_line(return_to, debit_amount=return_amount),
                ledger.Line(
                    account=session.drawer.ledger_account,
                    credit=return_amount,
                    financial_account=session.drawer,
                    **dims,
                ),
            ],
            created_by=user,
        )
    CashCount.objects.bulk_create(
        CashCount(
            company_id=session.company_id,
            session=session,
            denomination=Decimal(denomination),
            quantity=quantity,
            subtotal=Decimal(denomination) * quantity,
        )
        for denomination, quantity in counts.items()
        if quantity
    )
    session.status = CashSession.Status.CLOSED
    session.closed_at = timezone.now()
    session.expected = expected
    session.counted = counted
    session.difference = difference
    session.difference_reason = reason if difference else None
    session.difference_note = note if difference else ""
    session.returned_amount = return_amount
    session.returned_to = return_to if return_amount else None
    session.save()

    summary = f"Caja {session.number} cerrada: contado RD$ {counted:,.2f}"
    if difference:
        summary += f", {'faltante' if difference < 0 else 'sobrante'} RD$ {abs(difference):,.2f}"
    record_event(
        company_id=session.company_id,
        type="cash.closed",
        target=session,
        actor=user,
        summary=summary,
    )
    notify(
        company_id=session.company_id,
        users=supervisors_of(session.branch_id, exclude=user),
        kind=Notification.Kind.CASH_DIFFERENCE
        if difference
        else Notification.Kind.CLOSING_TO_APPROVE,
        text=f"{_person(user)}: {summary[0].lower()}{summary[1:]}. Pendiente de aprobación.",
        link="/cajas",
    )
    return session


@transaction.atomic
def approve_session(*, session: CashSession, user: User, note: str = "") -> CashSession:
    """F7 step 5: never one's own (also a CHECK in the database)."""
    session = CashSession.objects.select_for_update().get(pk=session.pk)
    if not authz.has_any_role(user, *APPROVER_ROLES):
        raise CashError("Solo el supervisor o el gerente aprueban un cierre.", "forbidden")
    if session.cashier_id == user.pk:
        raise CashError("Nadie aprueba el cierre de su propia caja.", "forbidden")
    if not authz.in_scope(user, session.branch_id):
        raise CashError("La caja es de otra sucursal.", "out_of_scope")
    if session.status != CashSession.Status.CLOSED:
        raise CashError("Solo se aprueba una caja cerrada.", "state")
    if session.difference and not authz.within_limit(
        user, ApprovalLimit.Operation.CASH_DIFFERENCE, abs(session.difference)
    ):
        raise CashError(
            f"La diferencia de RD$ {abs(session.difference):,.2f} supera tu límite: "
            "la aprueba el gerente.",
            "limit",
        )
    session.status = CashSession.Status.APPROVED
    session.approved_by = user
    session.approved_at = timezone.now()
    session.approval_note = note
    session.save()
    record_event(
        company_id=session.company_id,
        type="cash.approved",
        target=session,
        actor=user,
        summary=f"Cierre de la caja {session.number} aprobado",
    )
    from apps.documents.services import issue_cash_close  # documents import cash

    transaction.on_commit(lambda: issue_cash_close(session, issued_by=user))
    return session


# --- Routes (F6) ----------------------------------------------------------------------


LOCATION_CONSENT_TEXT = (
    "Acepto que, mientras tenga mi ruta abierta en horario laboral, Cobradía registre la "
    "ubicación de mi celular cada pocos minutos y en cada cobro o gestión, para la "
    "supervisión de la cobranza. Solo la ven el supervisor y el gerente, y se borra a los "
    "90 días (decisión 031)."
)


@transaction.atomic
def open_route(*, user: User, branch: Branch) -> RouteSession:
    if not authz.has_any_role(user, authz.COBRADOR):
        raise CashError("Solo un cobrador abre una ruta.", "forbidden")
    if not authz.in_scope(user, branch.id):
        raise CashError("No trabajas en esa sucursal.", "out_of_scope")
    if user.location_consent_at is None:
        raise CashError("Primero acepta el registro de ubicación de la ruta.", "consent")
    current = open_route_of(user)
    if current is not None:
        if current.business_date < timezone.localdate():
            raise CashError(
                "Tu ruta del día anterior no se ha rendido: entrégala al cajero primero.",
                "unsettled",
            )
        return current
    bag = _personal_account(user, branch, FinancialAccount.Kind.ROUTE)
    try:
        with transaction.atomic():
            route = RouteSession.objects.create(
                company_id=branch.company_id,
                collector=user,
                branch=branch,
                bag=bag,
                business_date=timezone.localdate(),
            )
    except IntegrityError as exc:
        raise CashError("Ya tienes una ruta abierta.", "open") from exc
    record_event(
        company_id=branch.company_id,
        type="route.opened",
        target=route,
        actor=user,
        summary=f"Ruta de {_person(user)} abierta",
    )
    return route


def route_cash(route: RouteSession) -> Decimal:
    totals = JournalLine.objects.filter(
        route_session=route, financial_account_id=route.bag_id
    ).aggregate(debit=Sum("debit"), credit=Sum("credit"))
    return (totals["debit"] or ZERO) - (totals["credit"] or ZERO)


@transaction.atomic
def settle_route(
    *,
    route: RouteSession,
    user: User,
    delivered: Decimal,
    reason: Reason | None = None,
    note: str = "",
) -> RouteSession:
    """F6 step 5: the cashier counts what the collector hands over."""
    route = (
        RouteSession.objects.select_for_update().select_related("bag", "branch").get(pk=route.pk)
    )
    if route.status != RouteSession.Status.OPEN:
        raise CashError("Esa ruta ya se rindió.", "state")
    if route.collector_id == user.pk:
        raise CashError("La rendición la recibe un cajero, no el propio cobrador.", "forbidden")
    if not authz.has_any_role(user, *CASHIER_ROLES):
        raise CashError("Solo el cajero o el supervisor reciben una rendición.", "forbidden")
    session = open_session_of(user)
    if session is None:
        raise CashError("Abre tu caja para recibir la rendición.", "no_session")
    if not authz.in_scope(user, route.branch_id):
        raise CashError("La ruta es de otra sucursal.", "out_of_scope")
    delivered = money(delivered)
    if delivered < 0:
        raise CashError("Lo entregado no puede ser negativo.")
    expected = route_cash(route)
    difference = delivered - expected
    _check_difference_reason(difference, reason, note)

    lines: list[ledger.Line] = []
    if delivered:
        lines.append(
            ledger.Line(
                account=session.drawer.ledger_account,
                debit=delivered,
                financial_account=session.drawer,
                cash_session_id=session.id,
            )
        )
    if expected:
        lines.append(
            ledger.Line(
                account=route.bag.ledger_account,
                credit=expected,
                financial_account=route.bag,
                route_session_id=route.id,
            )
        )
    company_id = route.company_id
    if difference < 0:
        lines.append(ledger.debit(ledger.system_account(company_id, "cash_shortage"), -difference))
    elif difference > 0:
        lines.append(ledger.credit(ledger.system_account(company_id, "cash_overage"), difference))
    if lines:
        route.settlement_entry = ledger.post_entry(
            company_id=company_id,
            branch=route.branch,
            on=timezone.localdate(),
            description=f"Rendición de {_person(route.collector)} en la caja {session.number}",
            source_type="cash.settlement",
            source_id=route.id,
            lines=lines,
            created_by=user,
        )
    route.status = RouteSession.Status.SETTLED
    route.settled_at = timezone.now()
    route.expected = expected
    route.delivered = delivered
    route.difference = difference
    route.difference_reason = reason if difference else None
    route.difference_note = note if difference else ""
    route.received_by = user
    route.cash_session = session
    route.save()

    summary = f"Rendición de {_person(route.collector)}: entregó RD$ {delivered:,.2f}"
    if difference:
        summary += f" ({'faltan' if difference < 0 else 'sobran'} RD$ {abs(difference):,.2f})"
        notify(
            company_id=company_id,
            users=supervisors_of(route.branch_id, exclude=user),
            kind=Notification.Kind.CASH_DIFFERENCE,
            text=summary,
            link="/rutas",
        )
    record_event(
        company_id=company_id, type="route.settled", target=route, actor=user, summary=summary
    )
    from apps.documents.services import issue_route_settlement

    transaction.on_commit(lambda: issue_route_settlement(route, issued_by=user))
    return route


def check_cash_limit(route: RouteSession) -> None:
    """Warn the supervisor once when a collector carries too much (F6 controls)."""
    if route.limit_alerted_at is not None:
        return
    from apps.core.models import Company

    limit = (
        Company.objects.only("collector_cash_limit").get(pk=route.company_id).collector_cash_limit
    )
    cash = route_cash(route)
    if cash <= limit:
        return
    route.limit_alerted_at = timezone.now()
    route.save(update_fields=["limit_alerted_at", "updated_at"])
    notify(
        company_id=route.company_id,
        users=supervisors_of(route.branch_id),
        kind=Notification.Kind.CASH_LIMIT,
        text=(
            f"{_person(route.collector)} lleva RD$ {cash:,.2f} en efectivo: supera el límite "
            f"de RD$ {limit:,.2f}."
        ),
        link="/rutas",
    )


def stale_sessions(today: dt.date) -> tuple[list[CashSession], list[RouteSession]]:
    """Open from a previous day: decision 025 says they close the same day."""
    cash = list(CashSession.objects.filter(status=CashSession.Status.OPEN, business_date__lt=today))
    routes = list(
        RouteSession.objects.filter(Q(status=RouteSession.Status.OPEN) & Q(business_date__lt=today))
    )
    return cash, routes
