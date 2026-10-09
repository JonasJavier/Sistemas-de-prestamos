"""F5/F6/F10: registering a payment, atomically (doc 03 - section 8).

One transaction locks the loan (two cashiers can never charge the same
installment at once), checks the idempotency key (a double click returns
the receipt already made), computes the breakdown with the engine, posts
the balanced entry to the drawer, the collector's cash or the bank, and
updates the installments and the loan caches. The receipt is exact: what
was received = the breakdown = the cash movement (reference defect #29).

The entry (doc 03 - section 13):
    Dr Caja / efectivo del cobrador / banco      amount
    Cr Cartera de préstamos                      principal
    Cr Ingresos por intereses                    interest
    Cr Ingresos por mora                         late fee
    Cr Ingresos por cargos                       charges
"""

import datetime as dt
import secrets
import uuid
from dataclasses import dataclass, field
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import ApprovalLimit, User
from apps.audit.models import record_event
from apps.cash import services as cash
from apps.cash.models import CashSession, RouteSession
from apps.collections.models import RouteStop
from apps.core.models import ApprovalRequest, Branch, PublicLink, Sequence
from apps.customers.access import can_serve, only_collector
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount
from apps.lending.models import Installment, Loan, LoanTerms
from apps.payments import portfolio
from apps.payments.models import LateFeeWaiver, Payment, PaymentAllocation
from engine import payoff
from engine.allocation import Applied, Due, Order, allocate
from engine.money import money
from engine.schedule import Method, Prepayment, Rounding, reschedule

ZERO = Decimal("0.00")
COLLECT_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.CAJERO, authz.COBRADOR)
COMPONENT_ACCOUNTS = {
    "principal": "loan_portfolio",
    "interest": "interest_income",
    "late_fee": "late_fee_income",
    "charges": "charge_income",
}


class PaymentError(Exception):
    """A rule of F5/F6/F10/F12; the message is user-facing."""

    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


# --- Who and where ---------------------------------------------------------------------


def check_can_collect(user: User, loan: Loan) -> None:
    if not authz.has_any_role(user, *COLLECT_ROLES):
        raise PaymentError("Tu rol no registra cobros.", "forbidden")
    if only_collector(user):
        if loan.collector_id != user.pk:
            raise PaymentError("Solo cobras los préstamos de tu cartera.", "forbidden")
    elif not can_serve(user, branch_id=loan.branch_id, customer_id=loan.customer_id):
        raise PaymentError(
            "El préstamo es de otra sucursal: ábrelo como cliente de otra sucursal.",
            "out_of_scope",
        )


@dataclass(frozen=True)
class Destination:
    account: FinancialAccount | None  # None: a renewal's bridge account (092)
    branch: Branch
    cash_session: CashSession | None = None
    route: RouteSession | None = None

    @property
    def dims(self) -> dict:
        return {
            "cash_session_id": self.cash_session.id if self.cash_session else None,
            "route_session_id": self.route.id if self.route else None,
        }


def destination(
    user: User, loan: Loan, method: str, bank_account: FinancialAccount | None, today: dt.date
) -> Destination:
    """Cash goes to the collector's route or the cashier's open drawer; the
    rest to the bank account it entered, linked to the open session."""
    route = cash.open_route_of(user)
    session = cash.open_session_of(user)
    for day_session, label in ((route, "ruta"), (session, "caja")):
        if day_session is not None and day_session.business_date < today:
            raise PaymentError(
                f"Tu {label} de un día anterior sigue abierta: ciérrala antes de cobrar.",
                "stale_session",
            )
    if method == Payment.Method.CASH:
        if route is not None:
            return Destination(account=route.bag, branch=route.branch, route=route)
        if session is not None:
            return Destination(account=session.drawer, branch=session.branch, cash_session=session)
        raise PaymentError("Abre tu caja (o tu ruta) para cobrar en efectivo.", "no_session")
    if (
        bank_account is None
        or bank_account.kind != FinancialAccount.Kind.BANK
        or not bank_account.is_active
        or bank_account.company_id != loan.company_id
    ):
        raise PaymentError("Elige la cuenta bancaria donde entró el dinero.", "account")
    branch = session.branch if session else route.branch if route else loan.branch
    if bank_account.branch_id not in (None, branch.id, loan.branch_id):
        raise PaymentError("Esa cuenta bancaria es de otra sucursal.", "account")
    return Destination(account=bank_account, branch=branch, cash_session=session, route=route)


def authorize(
    *,
    user: User,
    loan: Loan,
    operation: str,
    kind: str,
    amount: Decimal,
    approval: ApprovalRequest | None,
    label: str,
) -> ApprovalRequest | None:
    """Within the user's limit, or covered by an approved request of theirs."""
    if amount <= 0:
        return None
    if only_collector(user):
        raise PaymentError(f"El cobrador no puede aplicar {label}.", "forbidden")
    if approval is not None:
        if (
            approval.kind != kind
            or approval.status != ApprovalRequest.Status.APPROVED
            or approval.target_id != loan.id
            or approval.requested_by_id != user.pk
            or approval.expires_at <= timezone.now()
        ):
            raise PaymentError("Esa autorización no sirve para este cobro.", "approval")
        if amount > approval.amount:
            raise PaymentError(
                f"La autorización cubre hasta RD$ {approval.amount:,.2f}.", "approval"
            )
        return approval
    if authz.within_limit(user, operation, amount):
        return None
    raise PaymentError(
        f"{label.capitalize()} de RD$ {amount:,.2f} supera tu límite: pide autorización.",
        "needs_approval",
    )


# --- The breakdown -----------------------------------------------------------------------


@dataclass
class Plan:
    """Everything a payment will do, computed before anything is written."""

    applied: list[Applied]
    waived_fee: dict[uuid.UUID, Decimal] = field(default_factory=dict)
    waived_interest: dict[uuid.UUID, Decimal] = field(default_factory=dict)
    discount: Decimal = ZERO
    interest_forgiven: Decimal = ZERO  # future interest the product does not charge
    reschedule_rows: list = field(default_factory=list)
    replaced: list[Installment] = field(default_factory=list)


def _spread(amount: Decimal, owed: list[tuple[uuid.UUID, Decimal]]) -> dict[uuid.UUID, Decimal]:
    """Take ``amount`` from the owed amounts in order."""
    taken: dict[uuid.UUID, Decimal] = {}
    for key, value in owed:
        if amount <= 0:
            break
        part = min(amount, value)
        if part > 0:
            taken[key] = part
            amount -= part
    if amount > 0:
        raise PaymentError("No hay tanto que condonar.", "waiver")
    return taken


def _without_fees(lines: list[portfolio.Line], waived: dict) -> list[portfolio.Line]:
    for line in lines:
        line.late_fee -= waived.get(line.installment.id, ZERO)
    return lines


def plan_regular(lines: list[portfolio.Line], amount: Decimal, terms: LoanTerms) -> Plan:
    dues = [
        Due(
            key=line.installment.id,
            charges=line.charges,
            late_fee=line.late_fee,
            interest=line.interest,
            principal=line.principal,
        )
        for line in lines
        if line.total > 0
    ]
    applied, leftover = allocate(amount, dues, order=Order(terms.allocation_order))
    if leftover > 0:
        owed = sum((due.total for due in dues), ZERO)
        raise PaymentError(
            f"El monto supera lo que se debe (RD$ {owed:,.2f}). Para saldar con descuento de "
            "intereses usa Liquidar.",
            "too_much",
        )
    return Plan(applied=applied)


def payoff_rows(loan: Loan, lines: list[portfolio.Line]) -> list[payoff.Row]:
    rows = []
    start = loan.disbursed_on
    for line in lines:
        inst = line.installment
        if line.total > 0:
            rows.append(
                payoff.Row(
                    key=inst.id,
                    due_date=inst.due_date,
                    period_start=start,
                    principal=line.principal,
                    interest_due=inst.interest_due - inst.interest_waived,
                    interest_paid=inst.interest_paid,
                    charges=line.charges,
                    late_fee=line.late_fee,
                )
            )
        start = inst.due_date
    return rows


def payoff_quote(loan: Loan, lines: list[portfolio.Line], terms: LoanTerms, on: dt.date):
    return payoff.quote(
        payoff_rows(loan, lines),
        as_of=on,
        full_current_period=terms.payoff_full_current_period,
        future_interest_pct=terms.payoff_future_interest_pct,
    )


def plan_payoff(
    loan: Loan, lines: list[portfolio.Line], terms: LoanTerms, on: dt.date, discount: Decimal
) -> tuple[Plan, Decimal]:
    quote = payoff_quote(loan, lines, terms, on)
    discountable = quote.total - quote.principal - quote.charges
    if discount > discountable:
        raise PaymentError(
            f"El descuento no puede superar los intereses y la mora (RD$ {discountable:,.2f}).",
            "discount",
        )
    # The discount forgives interest from the latest installment back, then late fees.
    interest = {part.key: part.interest for part in quote.parts}
    fees = {part.key: part.late_fee for part in quote.parts}
    left = discount
    extra_interest: dict = {}
    for part in reversed(quote.parts):
        take = min(left, interest[part.key])
        if take:
            extra_interest[part.key] = take
            interest[part.key] -= take
            left -= take
    waived_fee = _spread(left, [(part.key, fees[part.key]) for part in quote.parts]) if left else {}
    applied = []
    waived_interest = {}
    for part in quote.parts:
        fee = fees[part.key] - waived_fee.get(part.key, ZERO)
        piece = Applied(
            key=part.key,
            charges=part.charges,
            late_fee=fee,
            interest=interest[part.key],
            principal=part.principal,
        )
        if piece.total > 0:
            applied.append(piece)
        forgiven = part.interest_waived + extra_interest.get(part.key, ZERO)
        if forgiven:
            waived_interest[part.key] = forgiven
    plan = Plan(
        applied=applied,
        waived_fee=waived_fee,
        waived_interest=waived_interest,
        discount=discount,
        interest_forgiven=quote.interest_waived,
    )
    return plan, quote.total - discount


def _untouched(inst: Installment) -> bool:
    return not (
        inst.principal_paid or inst.interest_paid or inst.charges_paid or inst.late_fee_paid
    )


def plan_prepayment(
    lines: list[portfolio.Line], amount: Decimal, terms: LoanTerms, on: dt.date, mode: str
) -> Plan:
    method = Method(terms.method)
    if method == Method.FLAT:
        raise PaymentError(
            "En el método plano no hay abono a capital: el pago extra adelanta cuotas y, para "
            "ahorrar interés, se liquida.",
            "method",
        )
    if any(line.installment.due_date < on and line.total > 0 for line in lines):
        raise PaymentError("Primero cobra lo vencido; después se abona a capital.", "overdue")
    untouched = [
        line.installment
        for line in lines
        if line.installment.due_date >= on and _untouched(line.installment)
    ]
    principal = sum((inst.principal_due for inst in untouched), ZERO)
    if not untouched or amount >= principal:
        raise PaymentError(
            f"El abono debe ser menor que el capital de las cuotas futuras (RD$ {principal:,.2f}). "
            "Para saldar el préstamo usa Liquidar.",
            "too_much",
        )
    keep = (
        max(inst.principal_due + inst.interest_due for inst in untouched)
        if method == Method.FIXED_PAYMENT
        else untouched[0].principal_due
    )
    try:
        rows = reschedule(
            balance=principal - amount,
            periodic_rate=terms.periodic_rate,
            method=method,
            dates=[(inst.due_date, inst.original_due_date) for inst in untouched],
            mode=Prepayment(mode or Prepayment.REDUCE_TERM),
            keep=keep,
            rounding=Rounding(terms.payment_rounding),
        )
    except ValueError as exc:
        raise PaymentError(str(exc), "method") from exc
    taken = _spread(amount, [(inst.id, inst.principal_due) for inst in untouched])
    applied = [Applied(key=key, principal=part) for key, part in taken.items()]
    return Plan(applied=applied, reschedule_rows=rows, replaced=untouched)


# --- Writing ---------------------------------------------------------------------------------


def new_version(
    *,
    loan: Loan,
    base: LoanTerms,
    reason: str,
    user: User,
    on: dt.date,
    rows: list,
    first_number: int,
    replaced: list[Installment],
    principal: Decimal,
) -> LoanTerms:
    """A new immutable terms version with its installments; the replaced ones
    are marked superseded (doc 05 - section 2: never modified, replaced)."""
    terms = LoanTerms.objects.get(pk=base.pk)
    terms.pk = None
    terms.id = uuid.uuid7()
    terms._state.adding = True
    terms.version = loan.terms.order_by("-version").values_list("version", flat=True)[0] + 1
    terms.effective_from = on
    terms.reason = reason[:200]
    terms.principal = principal
    terms.installments = len(rows)
    terms.first_due = rows[0].due_date
    terms.created_by = user
    terms.approved_by = None
    terms.replaced_installments = [str(inst.id) for inst in replaced]
    terms.save(force_insert=True)
    Installment.objects.bulk_create(
        Installment(
            company_id=loan.company_id,
            loan=loan,
            terms=terms,
            number=first_number + index,
            due_date=row.due_date,
            original_due_date=row.original_due_date,
            principal_due=row.principal,
            interest_due=row.interest,
            charges_due=getattr(row, "charges", ZERO),
        )
        for index, row in enumerate(rows)
    )
    Installment.objects.filter(pk__in=[inst.pk for inst in replaced]).update(
        status=Installment.Status.SUPERSEDED
    )
    return terms


def _ledger_lines(payment_amount: Decimal, applied: list[Applied], dest: Destination, loan: Loan):
    company_id = loan.company_id
    dims = {"loan_id": loan.id, "customer_id": loan.customer_id}
    if dest.account is None:  # renewal: the new loan's disbursement funds it
        lines = [
            ledger.debit(
                ledger.system_account(company_id, "renewal_clearing"), payment_amount, **dims
            )
        ]
    else:
        lines = [
            ledger.Line(
                account=dest.account.ledger_account,
                debit=payment_amount,
                financial_account=dest.account,
                **dims,
                **dest.dims,
            )
        ]
    for component, key in COMPONENT_ACCOUNTS.items():
        total = sum((getattr(piece, component) for piece in applied), ZERO)
        if total:
            lines.append(ledger.credit(ledger.system_account(company_id, key), total, **dims))
    return lines


def _apply_to_installments(applied: list[Applied], sign: int = 1) -> None:
    by_id = Installment.objects.select_for_update().in_bulk([piece.key for piece in applied])
    for piece in applied:
        inst = by_id[piece.key]
        inst.charges_paid += sign * piece.charges
        inst.late_fee_paid += sign * piece.late_fee
        inst.interest_paid += sign * piece.interest
        inst.principal_paid += sign * piece.principal
    Installment.objects.bulk_update(
        by_id.values(), ["charges_paid", "late_fee_paid", "interest_paid", "principal_paid"]
    )


def _mark_route_stop(payment: Payment, dest: Destination, today: dt.date) -> None:
    if dest.route is None:
        return
    stop = RouteStop.objects.filter(
        collector_id=dest.route.collector_id, date=today, loan_id=payment.loan_id
    ).first()
    if stop is None:
        payment.off_route = True
        payment.save(update_fields=["off_route", "updated_at"])
        return
    stop.visited_at = payment.paid_at
    stop.payment = payment
    stop.save(update_fields=["visited_at", "payment", "updated_at"])


@transaction.atomic
def post_payment(
    *,
    loan: Loan,
    user: User,
    amount: Decimal,
    method: str,
    idempotency_key: str,
    received: Decimal | None = None,
    kind: str = Payment.Kind.REGULAR,
    reference: str = "",
    bank_account: FinancialAccount | None = None,
    waive: Decimal = ZERO,
    waive_note: str = "",
    waiver_approval: ApprovalRequest | None = None,
    discount: Decimal = ZERO,
    discount_approval: ApprovalRequest | None = None,
    prepayment_mode: str = "",
    latitude: Decimal | None = None,
    longitude: Decimal | None = None,
    renewal: bool = False,
) -> Payment:
    """``renewal`` is internal (decision 092): the payoff of a loan by the
    disbursement of its renewal, through the bridge account, no cash."""
    loan = Loan.objects.select_for_update().select_related("branch").get(pk=loan.pk)
    existing = Payment.objects.filter(idempotency_key=idempotency_key).first()
    if existing is not None:
        if existing.loan_id != loan.pk:
            raise PaymentError("La clave de idempotencia ya se usó.", "idempotency")
        return existing
    if loan.status != Loan.Status.ACTIVE:
        raise PaymentError("Solo se cobra un préstamo activo.", "state")
    if (method == Payment.Method.RENEWAL) != renewal:
        raise PaymentError("La renovación liquida el préstamo al desembolsarse.", "method")
    if not renewal:
        check_can_collect(user, loan)
    today = timezone.localdate()
    amount = money(amount)
    if amount <= 0:
        raise PaymentError("El monto debe ser mayor que cero.")
    if method not in Payment.Method.values:
        raise PaymentError("Medio de pago desconocido.")
    received = money(received if received is not None else amount)
    if method != Payment.Method.CASH:
        received = amount
    if received < amount:
        raise PaymentError("Lo recibido no alcanza para el monto a pagar.", "received")
    if method != Payment.Method.CASH and not reference.strip():
        raise PaymentError("Escribe el número de referencia del pago.", "reference")
    dest = (
        Destination(account=None, branch=loan.branch)
        if renewal
        else destination(user, loan, method, bank_account, today)
    )

    terms = portfolio.current_terms(loan)
    lines = portfolio.position(loan, today)
    waive = money(waive)
    if waive < 0 or (waive and not waive_note.strip()):
        raise PaymentError("Toda condonación lleva un motivo.", "waiver")
    waiver_approval = authorize(
        user=user,
        loan=loan,
        operation=ApprovalLimit.Operation.WAIVE_LATE_FEE,
        kind=ApprovalRequest.Kind.WAIVE_LATE_FEE,
        amount=waive,
        approval=waiver_approval,
        label="la condonación de mora",
    )
    waived_fee = (
        _spread(waive, [(line.installment.id, line.late_fee) for line in lines]) if waive else {}
    )
    lines = _without_fees(lines, waived_fee)

    if kind == Payment.Kind.REGULAR:
        plan = plan_regular(lines, amount, terms)
    elif kind == Payment.Kind.PAYOFF:
        discount = money(discount)
        discount_approval = authorize(
            user=user,
            loan=loan,
            operation=ApprovalLimit.Operation.PAYOFF_DISCOUNT,
            kind=ApprovalRequest.Kind.PAYOFF_DISCOUNT,
            amount=discount,
            approval=discount_approval,
            label="el descuento",
        )
        plan, expected = plan_payoff(loan, lines, terms, today, discount)
        if amount != expected:
            raise PaymentError(
                f"Para liquidar se cobran exactamente RD$ {expected:,.2f}.", "payoff_amount"
            )
    elif kind == Payment.Kind.PREPAYMENT:
        plan = plan_prepayment(lines, amount, terms, today, prepayment_mode)
    else:
        raise PaymentError("Tipo de cobro desconocido.")
    for key, value in plan.waived_fee.items():
        waived_fee[key] = waived_fee.get(key, ZERO) + value

    payment_id = uuid.uuid7()
    number = Sequence.allocate(dest.branch, Sequence.DocType.RECEIPT)
    try:
        entry = ledger.post_entry(
            company_id=loan.company_id,
            branch=dest.branch,
            on=today,
            description=f"Cobro {number} del préstamo {loan.number}",
            source_type="payments.payment",
            source_id=payment_id,
            lines=_ledger_lines(amount, plan.applied, dest, loan),
            created_by=user,
        )
    except ledger.LedgerError as exc:
        raise PaymentError(str(exc), "ledger") from exc
    try:
        with transaction.atomic():
            payment = Payment.objects.create(
                id=payment_id,
                company_id=loan.company_id,
                number=number,
                branch=dest.branch,
                loan=loan,
                customer_id=loan.customer_id,
                kind=kind,
                paid_at=timezone.now(),
                value_date=today,
                method=method,
                reference=reference.strip(),
                received=received,
                change=received - amount,
                amount=amount,
                currency=loan.currency,
                late_fee_waived=waive,
                interest_waived=plan.interest_forgiven,
                discount=plan.discount,
                financial_account=dest.account,
                cash_session=dest.cash_session,
                route_session=dest.route,
                latitude=latitude,
                longitude=longitude,
                prepayment_mode=prepayment_mode if kind == Payment.Kind.PREPAYMENT else "",
                collected_by=user,
                idempotency_key=idempotency_key,
                journal_entry=entry,
                receipt_token=secrets.token_urlsafe(24),
            )
    except IntegrityError as exc:  # a concurrent request won the same key
        raise PaymentError("Este cobro ya se registró.", "idempotency") from exc

    PaymentAllocation.objects.bulk_create(
        PaymentAllocation(
            company_id=loan.company_id,
            payment=payment,
            installment_id=piece.key,
            component=component,
            amount=getattr(piece, component),
        )
        for piece in plan.applied
        for component in ("charges", "late_fee", "interest", "principal")
        if getattr(piece, component) > 0
    )
    _apply_to_installments(plan.applied)

    note = waive_note.strip() or "Descuento en liquidación autorizado"
    authorizer = waiver_approval or discount_approval
    for key, value in waived_fee.items():
        LateFeeWaiver.objects.create(
            company_id=loan.company_id,
            installment_id=key,
            payment=payment,
            amount=value,
            note=note[:300],
            authorized_by=authorizer.decided_by if authorizer else user,
            approval=authorizer,
            created_by=user,
        )
    touched = set(waived_fee) | set(plan.waived_interest)
    if touched:
        by_id = Installment.objects.select_for_update().in_bulk(list(touched))
        for key, inst in by_id.items():
            inst.late_fee_waived += waived_fee.get(key, ZERO)
            inst.interest_waived += plan.waived_interest.get(key, ZERO)
        Installment.objects.bulk_update(by_id.values(), ["late_fee_waived", "interest_waived"])

    if plan.reschedule_rows:
        payment.new_terms = new_version(
            loan=loan,
            base=terms,
            reason=f"Abono a capital {number}",
            user=user,
            on=today,
            rows=plan.reschedule_rows,
            first_number=plan.replaced[0].number,
            replaced=plan.replaced,
            principal=sum((row.principal for row in plan.reschedule_rows), ZERO),
        )
        payment.save(update_fields=["new_terms", "updated_at"])

    for approval in (waiver_approval, discount_approval):
        if approval is not None:
            approval.status = ApprovalRequest.Status.USED
            approval.used_at = timezone.now()
            approval.save(update_fields=["status", "used_at", "updated_at"])

    loan.last_payment_on = today
    lines = portfolio.refresh(loan, today)
    payment.principal_after = loan.principal_outstanding
    payment.owed_after = sum((line.total for line in lines), ZERO)
    payment.save(update_fields=["principal_after", "owed_after", "updated_at"])
    PublicLink.objects.create(
        token=payment.receipt_token,
        tenant=loan.company_id,
        kind=PublicLink.Kind.RECEIPT,
        object_id=payment.id,
    )
    _mark_route_stop(payment, dest, today)
    from apps.collections.promises import evaluate

    evaluate(loan, today)  # a payment may keep the loan's promise (F8 step 4)
    from apps.ledger import fiscal

    fiscal.for_payment(payment)  # its e-CF waits «por emitir» (decision 085)
    if dest.route is not None and method == Payment.Method.CASH:
        cash.check_cash_limit(dest.route)
    record_event(
        company_id=loan.company_id,
        type="payment.posted",
        target=loan,
        actor=user,
        summary=f"{payment.get_kind_display()} {number}: RD$ {amount:,.2f} "
        f"({payment.get_method_display().lower()})",
        data={"payment": str(payment.id), "receipt": number},
    )
    return payment
