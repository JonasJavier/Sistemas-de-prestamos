"""F16, basic: loans already running in the previous system (doc 03 - 11).

A migrated loan keeps its original calendar and its historical payments,
with their real dates, marked «migrado». Those payments did not happen in
Cobradía's cash, so they move no money; only the principal still owed
enters the books, against «Saldos de apertura». The balance must match
the previous system to the cent, or nothing is loaded (reference #34).

Phase 10 adds the Excel templates, the customers and the rehearsals; this
is the engine they will use, driven today by ``manage.py migrar_prestamos``.
"""

import datetime as dt
import secrets
import uuid
from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Sequence
from apps.customers.models import Customer
from apps.ledger import services as ledger
from apps.lending import simulator
from apps.lending.models import Installment, Loan, LoanProduct, LoanTerms
from apps.payments import portfolio
from apps.payments.models import Payment, PaymentAllocation
from engine.allocation import Due, allocate
from engine.money import money
from engine.rates import Frequency, RateUnit, period_rate

ZERO = Decimal("0.00")
MIGRATOR_ROLES = (authz.GERENTE, authz.ADMINISTRADOR)


class MigrationError(Exception):
    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class LegacyLoan:
    customer: Customer
    product: LoanProduct
    amount: Decimal
    rate: Decimal
    frequency: str
    installments: int
    disbursed_on: dt.date
    principal_balance: Decimal  # what the previous system says is still owed
    payments: tuple[tuple[dt.date, Decimal], ...] = ()
    first_due: dt.date | None = None
    legacy_number: str = ""
    collector: User | None = None


def _historical_payments(loan: Loan, data: LegacyLoan, user: User) -> None:
    """Interest then principal, oldest installment first; no late fees: the
    previous system settled them its own way. No entry: no money moved here."""
    for index, (paid_on, raw_amount) in enumerate(sorted(data.payments), start=1):
        amount = money(raw_amount)
        if amount <= 0:
            raise MigrationError(f"El pago {index} debe ser mayor que cero.", "payment")
        if paid_on < data.disbursed_on or paid_on > timezone.localdate():
            raise MigrationError(f"El pago {index} tiene una fecha fuera del préstamo.", "payment")
        installments = list(
            loan.installments.exclude(status=Installment.Status.SUPERSEDED).order_by("due_date")
        )
        dues = [
            Due(
                key=inst.id,
                interest=inst.interest_outstanding,
                principal=inst.principal_outstanding,
            )
            for inst in installments
        ]
        applied, leftover = allocate(amount, dues)
        if leftover > 0:
            raise MigrationError(f"El pago {index} supera lo que se debía.", "payment")
        payment = Payment.objects.create(
            company_id=loan.company_id,
            number=f"{loan.number}-H{index:03d}",
            branch=loan.branch,
            loan=loan,
            customer_id=loan.customer_id,
            kind=Payment.Kind.MIGRATED,
            paid_at=timezone.make_aware(dt.datetime.combine(paid_on, dt.time(12, 0))),
            value_date=paid_on,
            method=Payment.Method.CASH,
            received=amount,
            amount=amount,
            currency=loan.currency,
            collected_by=user,
            idempotency_key=f"migration:{uuid.uuid4().hex}",
            receipt_token=secrets.token_urlsafe(24),
        )
        PaymentAllocation.objects.bulk_create(
            PaymentAllocation(
                company_id=loan.company_id,
                payment=payment,
                installment_id=piece.key,
                component=component,
                amount=getattr(piece, component),
            )
            for piece in applied
            for component in ("interest", "principal")
            if getattr(piece, component) > 0
        )
        by_id = {inst.id: inst for inst in installments}
        for piece in applied:
            inst = by_id[piece.key]
            inst.interest_paid += piece.interest
            inst.principal_paid += piece.principal
        Installment.objects.bulk_update(installments, ["interest_paid", "principal_paid"])


@transaction.atomic
def migrate_loan(*, data: LegacyLoan, user: User) -> Loan:
    if not authz.has_any_role(user, *MIGRATOR_ROLES):
        raise MigrationError("Solo el gerente o el administrador migran préstamos.", "forbidden")
    if data.disbursed_on >= timezone.localdate():
        raise MigrationError("Un préstamo migrado empezó antes de hoy.", "disbursed_on")
    if data.legacy_number and Loan.objects.filter(legacy_number=data.legacy_number).exists():
        raise MigrationError(f"El préstamo {data.legacy_number} ya se migró.", "duplicate")
    try:
        sim = simulator.simulate(
            product=data.product,
            amount=data.amount,
            installments=data.installments,
            frequency=data.frequency,
            rate=data.rate,
            disbursed_on=data.disbursed_on,
            first_due=data.first_due,
        )
    except Exception as exc:  # noqa: BLE001 - every engine/product refusal reads the same
        raise MigrationError(f"Las condiciones no cumplen el producto: {exc}", "terms") from exc
    customer = data.customer
    branch = customer.home_branch
    product = data.product
    policy = product.late_fee_policy
    frequency = Frequency(data.frequency)
    loan = Loan.objects.create(
        company_id=customer.company_id,
        number=Sequence.allocate(branch, Sequence.DocType.LOAN),
        branch=branch,
        customer=customer,
        product=product,
        principal=sim.principal,
        disbursed_on=data.disbursed_on,
        officer=user,
        collector=data.collector,
        is_migrated=True,
        legacy_number=data.legacy_number,
        principal_outstanding=sim.principal,
        interest_outstanding=sim.total_interest,
        next_due_date=sim.schedule[0].due_date,
    )
    terms = LoanTerms.objects.create(
        company_id=loan.company_id,
        loan=loan,
        version=1,
        effective_from=data.disbursed_on,
        reason="Migración del sistema anterior",
        principal=sim.principal,
        method=product.method,
        frequency=frequency,
        rate=data.rate,
        rate_unit=product.rate_unit,
        periodic_rate=period_rate(data.rate, RateUnit(product.rate_unit), frequency),
        installments=data.installments,
        first_due=sim.schedule[0].due_date,
        payment_rounding=product.payment_rounding,
        allocation_order=product.allocation_order,
        collect_saturdays=product.collect_saturdays,
        collect_sundays=product.collect_sundays,
        collect_holidays=product.collect_holidays,
        payoff_full_current_period=product.payoff_full_current_period,
        payoff_future_interest_pct=product.payoff_future_interest_pct,
        late_fee_grace_days=policy.grace_days,
        late_fee_method=policy.fee_method,
        late_fee_monthly_rate=policy.monthly_rate,
        late_fee_fixed_amount=policy.fixed_amount,
        late_fee_cap_pct=policy.cap_pct,
        created_by=user,
    )
    Installment.objects.bulk_create(
        Installment(
            company_id=loan.company_id,
            loan=loan,
            terms=terms,
            number=row.number,
            due_date=row.due_date,
            original_due_date=row.original_due_date,
            principal_due=row.principal,
            interest_due=row.interest,
        )
        for row in sim.schedule
    )
    _historical_payments(loan, data, user)
    today = timezone.localdate()
    if data.payments:
        loan.last_payment_on = max(day for day, _amount in data.payments)
    portfolio.refresh(loan, today)
    if loan.status != Loan.Status.ACTIVE:
        raise MigrationError("Ese préstamo ya está saldado: no se migra.", "paid_off")
    expected = money(data.principal_balance)
    if loan.principal_outstanding != expected:
        raise MigrationError(
            f"No cuadra: el sistema anterior dice {expected:,.2f} de capital y aquí da "
            f"{loan.principal_outstanding:,.2f}.",
            "balance",
        )
    company_id = loan.company_id
    dims = {"loan_id": loan.id, "customer_id": customer.id}
    ledger.post_entry(
        company_id=company_id,
        branch=branch,
        on=today,
        description=f"Migración del préstamo {data.legacy_number or loan.number} ({loan.number})",
        source_type="lending.migration",
        source_id=loan.id,
        lines=[
            ledger.debit(
                ledger.system_account(company_id, "loan_portfolio"),
                loan.principal_outstanding,
                **dims,
            ),
            ledger.credit(
                ledger.system_account(company_id, "opening_balance"),
                loan.principal_outstanding,
                **dims,
            ),
        ],
        created_by=user,
    )
    record_event(
        company_id=company_id,
        type="loan.migrated",
        target=loan,
        actor=user,
        summary=f"Migrado del sistema anterior ({data.legacy_number or 'sin número'}) con "
        f"{len(data.payments)} pago(s) histórico(s); capital {loan.principal_outstanding:,.2f}",
    )
    return loan
