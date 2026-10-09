"""Flow F4: the atomic disbursement, and F14: voiding a loan without payments.

One transaction creates the loan with its number and terms version 1,
the schedule, the charges, the guarantees, the balanced journal entry and
the application's final state. A repeated idempotency key returns the
loan already created: a double click never pays twice (doc 03 - 6).

The journal entry (doc 03 - section 13, E7):
    Dr Cartera                  principal (amount + financed charges)
    Cr Caja o banco             net (amount - discounted charges)
    Cr Ingresos por cargos      discounted + financed charges
    Dr Caja (cargo en caja)     cash-mode charges, paid apart
    Cr Ingresos por cargos      cash-mode charges
"""

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.core.models import Reason, Sequence
from apps.customers.models import Collateral, Customer
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount
from apps.lending import simulator
from apps.lending.applications import ApplicationError
from apps.lending.models import (
    Application,
    Disbursement,
    Installment,
    Loan,
    LoanCharge,
    LoanCollateral,
    LoanGuarantor,
    LoanProduct,
    LoanTerms,
    ProductCharge,
)
from engine.money import money
from engine.rates import Frequency, RateUnit, period_rate

ZERO = Decimal("0.00")
DISBURSER_ROLES = (authz.GERENTE, authz.CAJERO, authz.CONTABILIDAD)
VOIDER_ROLES = (authz.GERENTE, authz.SUPERVISOR)
PLEDGEABLE = (Collateral.Status.REGISTERED, Collateral.Status.RELEASED)


class DisbursementError(ApplicationError):
    pass


@dataclass(frozen=True)
class Preview:
    simulation: simulator.Simulation
    discounted: Decimal
    financed: Decimal
    cash: Decimal


def _sum(lines: list[simulator.ChargeLine], mode: str) -> Decimal:
    return sum((line.amount for line in lines if line.mode == mode), ZERO)


def preview(application: Application, *, on: dt.date | None = None) -> Preview:
    """What the cashier sees before confirming (F4 step 3)."""
    if application.approved_amount is None:
        raise DisbursementError("La solicitud no está aprobada.", code="state")
    sim = simulator.simulate(
        product=application.product,
        amount=application.approved_amount,
        installments=application.approved_installments,
        frequency=application.approved_frequency,
        rate=application.approved_rate,
        disbursed_on=on or timezone.localdate(),
        first_due=application.approved_first_due,
    )
    return Preview(
        simulation=sim,
        discounted=_sum(sim.charges, ProductCharge.Mode.DISCOUNTED),
        financed=_sum(sim.charges, ProductCharge.Mode.FINANCED),
        cash=_sum(sim.charges, ProductCharge.Mode.CASH),
    )


def _check_disburser(user: User, application: Application) -> None:
    if not authz.has_any_role(user, *DISBURSER_ROLES):
        raise DisbursementError(
            "Solo el cajero, contabilidad o el gerente desembolsan.", code="forbidden"
        )
    if user.pk == application.decided_by_id:
        raise DisbursementError(
            "Quien aprobó la solicitud no la desembolsa (separación de funciones).",
            code="forbidden",
        )
    if not authz.in_scope(user, application.branch_id):
        raise DisbursementError("La solicitud es de otra sucursal.", code="out_of_scope")


def _check_account(account: FinancialAccount, application: Application, label: str) -> None:
    if account.company_id != application.company_id or not account.is_active:
        raise DisbursementError(f"La cuenta de {label} no está disponible.", code="account")
    if account.branch_id not in (None, application.branch_id):
        raise DisbursementError(f"La cuenta de {label} pertenece a otra sucursal.", code="account")


def _freeze_terms(
    loan: Loan, application: Application, sim: simulator.Simulation, user: User, on: dt.date
) -> LoanTerms:
    product: LoanProduct = application.product
    policy = product.late_fee_policy
    rate = application.approved_rate
    frequency = Frequency(application.approved_frequency)
    return LoanTerms.objects.create(
        company_id=loan.company_id,
        loan=loan,
        version=1,
        effective_from=on,
        reason="Desembolso",
        principal=sim.principal,
        method=product.method,
        frequency=frequency,
        rate=rate,
        rate_unit=application.rate_unit,
        periodic_rate=period_rate(rate, RateUnit(application.rate_unit), frequency),
        installments=application.approved_installments,
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
        approved_by=application.decided_by,
    )


def _cash_session(user: User, today: dt.date):
    from apps.cash.services import open_session_of  # cash builds on the ledger and lending

    session = open_session_of(user)
    if session is None:
        raise DisbursementError("Abre tu caja para desembolsar en efectivo.", code="no_session")
    if session.business_date < today:
        raise DisbursementError(
            "Tu caja de un día anterior sigue abierta: ciérrala y abre la de hoy.",
            code="stale_session",
        )
    return session


ITBIS_RATE = Decimal("0.18")


def itbis_in(charges, modes) -> Decimal:
    """The ITBIS inside the taxed charges of those modes (decision 075)."""
    total = Decimal("0.00")
    for line in charges:
        if line.taxed and line.mode in modes:
            total += line.amount - money(line.amount / (1 + ITBIS_RATE))
    return total


@transaction.atomic
def disburse(
    *,
    application: Application,
    user: User,
    source_account: FinancialAccount | None,
    method: str,
    idempotency_key: str,
    reference: str = "",
    charge_account: FinancialAccount | None = None,
) -> Loan:
    # Lock first, then look for the key: a concurrent double click waits
    # here and, once the first request commits, gets the same loan back
    # instead of a «not approved» error.
    application = (
        Application.objects.select_for_update(of=("self",))
        .select_related("product__late_fee_policy", "customer", "branch")
        .get(pk=application.pk)
    )
    existing = (
        Disbursement.objects.filter(idempotency_key=idempotency_key).select_related("loan").first()
    )
    if existing is not None:
        if existing.loan.application_id != application.pk:
            raise DisbursementError("La clave de idempotencia ya se usó.", code="idempotency")
        return existing.loan
    today = timezone.localdate()
    if application.status != Application.Status.APPROVED:
        raise DisbursementError("Solo se desembolsa una solicitud aprobada.", code="state")
    if application.valid_until and application.valid_until < today:
        raise DisbursementError(
            "La aprobación venció; la solicitud debe reevaluarse.", code="expired"
        )
    _check_disburser(user, application)
    customer: Customer = application.customer
    if customer.status == Customer.Status.BLOCKED:
        raise DisbursementError("El cliente está bloqueado.", code="customer_blocked")
    session = None
    if method == Disbursement.Method.CASH:
        session = _cash_session(user, today)
        source_account = session.drawer
        if session.branch_id != application.branch_id:
            raise DisbursementError("Tu caja abierta es de otra sucursal.", code="account")
    elif source_account is None or source_account.kind != FinancialAccount.Kind.BANK:
        raise DisbursementError(
            "La transferencia o el cheque salen de una cuenta bancaria.", code="account"
        )
    else:
        _check_account(source_account, application, "origen")

    # Lock the assets too: two loans can never pledge the same one.
    collaterals = list(
        application.collaterals.select_related("collateral").select_for_update(
            of=("self", "collateral")
        )
    )
    for item in collaterals:
        if item.collateral.status not in PLEDGEABLE:
            raise DisbursementError(
                f"La garantía «{item.collateral.description}» no está disponible "
                f"({item.collateral.get_status_display().lower()}).",
                code="collateral",
            )
    if application.product.guarantee == LoanProduct.GuaranteeRequirement.ASSET and not collaterals:
        raise DisbursementError("El producto exige un bien en garantía.", code="collateral")

    try:
        quote = preview(application, on=today)
    except Exception as exc:  # out of range after a product change, etc.
        raise DisbursementError(
            "Las condiciones aprobadas ya no cumplen el producto; reevalúa la solicitud.",
            code="out_of_range",
        ) from exc
    sim = quote.simulation
    if sim.net_disbursed <= 0:
        raise DisbursementError("Los cargos descontados superan el monto.", code="charges")
    charge_account = charge_account or source_account
    if quote.cash and charge_account != source_account:
        _check_account(charge_account, application, "cargos")
        if charge_account.is_personal:
            raise DisbursementError("Los cargos en caja entran en tu caja abierta.", code="account")

    branch = application.branch
    loan = Loan.objects.create(
        company_id=application.company_id,
        number=Sequence.allocate(branch, Sequence.DocType.LOAN),
        branch=branch,
        customer=customer,
        application=application,
        product=application.product,
        principal=sim.principal,
        currency=application.currency,
        disbursed_on=today,
        officer_id=application.created_by_id,
        principal_outstanding=sim.principal,
        interest_outstanding=sim.total_interest,
        next_due_date=sim.schedule[0].due_date,
    )
    terms = _freeze_terms(loan, application, sim, user, today)
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
    LoanCharge.objects.bulk_create(
        LoanCharge(
            company_id=loan.company_id,
            loan=loan,
            product_charge_id=line.charge_id,
            name=line.name,
            basis=line.basis,
            value=line.value,
            mode=line.mode,
            amount=line.amount,
            taxed=line.taxed,
        )
        for line in sim.charges
    )
    LoanGuarantor.objects.bulk_create(
        LoanGuarantor(company_id=loan.company_id, loan=loan, customer_id=g.customer_id)
        for g in application.guarantors.all()
    )
    for item in collaterals:
        LoanCollateral.objects.create(
            company_id=loan.company_id,
            loan=loan,
            collateral=item.collateral,
            considered_value=item.considered_value,
        )
        item.collateral.status = Collateral.Status.PLEDGED
        item.collateral.save(update_fields=["status", "updated_at"])

    company_id = loan.company_id
    dims = {"loan_id": loan.id, "customer_id": customer.id}
    drawer_dims = {"cash_session_id": session.id} if session else {}
    charge_income = ledger.system_account(company_id, "charge_income")
    itbis_payable = ledger.system_account(company_id, "itbis_payable")
    # Decision 075: a taxed charge carries 18 % ITBIS inside its amount.
    itbis_withheld = itbis_in(
        sim.charges, (ProductCharge.Mode.DISCOUNTED, ProductCharge.Mode.FINANCED)
    )
    itbis_cash = itbis_in(sim.charges, (ProductCharge.Mode.CASH,))
    lines = [
        ledger.debit(ledger.system_account(company_id, "loan_portfolio"), sim.principal, **dims),
        ledger.cash_line(source_account, credit_amount=sim.net_disbursed, **dims, **drawer_dims),
        ledger.credit(charge_income, quote.discounted + quote.financed - itbis_withheld, **dims),
        ledger.credit(itbis_payable, itbis_withheld, **dims),
    ]
    if quote.cash:
        same = charge_account == source_account
        lines += [
            ledger.cash_line(
                charge_account, debit_amount=quote.cash, **dims, **(drawer_dims if same else {})
            ),
            ledger.credit(charge_income, quote.cash - itbis_cash, **dims),
            ledger.credit(itbis_payable, itbis_cash, **dims),
        ]
    try:
        entry = ledger.post_entry(
            company_id=company_id,
            branch=branch,
            on=today,
            description=f"Desembolso del préstamo {loan.number} a {customer.display_name}",
            source_type="lending.disbursement",
            source_id=loan.id,
            lines=lines,
            created_by=user,
        )
    except ledger.InsufficientFunds as exc:
        raise DisbursementError(str(exc), code="insufficient_funds") from exc
    from apps.ledger import fiscal

    fiscal.for_disbursement(loan, loan.charges.all(), today)  # its e-CF (decision 085)

    try:
        with transaction.atomic():
            Disbursement.objects.create(
                company_id=company_id,
                loan=loan,
                disbursed_on=today,
                source_account=source_account,
                cash_session=session,
                method=method,
                reference=reference,
                gross=sim.requested_amount,
                discounted_charges=quote.discounted,
                financed_charges=quote.financed,
                cash_charges=quote.cash,
                net=sim.net_disbursed,
                charge_account=charge_account if quote.cash else None,
                idempotency_key=idempotency_key,
                journal_entry=entry,
                disbursed_by=user,
            )
    except IntegrityError as exc:  # a concurrent request won the same key
        raise DisbursementError("Este desembolso ya se registró.", code="idempotency") from exc

    application.status = Application.Status.DISBURSED
    application.save(update_fields=["status", "updated_at"])
    record_event(
        company_id=company_id,
        type="loan.disbursed",
        target=loan,
        actor=user,
        summary=(
            f"Desembolsado {loan.number}: RD$ {sim.requested_amount:,.2f} "
            f"(neto RD$ {sim.net_disbursed:,.2f}) desde {source_account}"
        ),
        data={"application": application.number, "entry": entry.number},
    )
    record_event(
        company_id=company_id,
        type="application.disbursed",
        target=application,
        actor=user,
        summary=f"Desembolsada como préstamo {loan.number}",
    )
    return loan


def _void_redirect(disbursement: Disbursement, user: User) -> dict:
    """Cash handed out from a drawer that already closed comes back through
    the voider's open drawer, or else the branch's general cash."""
    from apps.cash.models import CashSession
    from apps.cash.services import open_session_of

    session = disbursement.cash_session
    if session is None or session.status == CashSession.Status.OPEN:
        return {}
    current = open_session_of(user)
    if current is not None:
        return {
            disbursement.source_account_id: (
                current.drawer,
                {"cash_session_id": current.id, "route_session_id": None},
            )
        }
    general = (
        FinancialAccount.objects.filter(
            kind=FinancialAccount.Kind.CASH, is_active=True, branch_id=disbursement.loan.branch_id
        ).first()
        or FinancialAccount.objects.filter(
            kind=FinancialAccount.Kind.CASH, is_active=True, branch__isnull=True
        ).first()
    )
    if general is None:
        raise DisbursementError("No hay una caja que reciba el efectivo.", code="account")
    return {
        disbursement.source_account_id: (
            general,
            {"cash_session_id": None, "route_session_id": None},
        )
    }


@transaction.atomic
def void_loan(loan: Loan, *, user: User, reason: Reason, note: str) -> Loan:
    """F14: only without payments; reverses money and charges (defect #31)."""
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    if not authz.has_any_role(user, *VOIDER_ROLES):
        raise DisbursementError("Solo el supervisor o el gerente anulan.", code="forbidden")
    if not authz.in_scope(user, loan.branch_id):
        raise DisbursementError("El préstamo es de otra sucursal.", code="out_of_scope")
    if loan.status != Loan.Status.ACTIVE:
        raise DisbursementError("Solo se anula un préstamo activo.", code="state")
    if reason.kind != Reason.Kind.VOID:
        raise DisbursementError("Elige un motivo de anulación del catálogo.", code="reason")
    if not note.strip():
        raise DisbursementError("Escribe una nota para la anulación.", code="note")
    paid = loan.installments.exclude(
        principal_paid=0, interest_paid=0, charges_paid=0, late_fee_paid=0
    )
    if paid.exists():
        raise DisbursementError("El préstamo tiene pagos: no se puede anular.", code="has_payments")

    today = timezone.localdate()
    disbursement = loan.disbursement
    try:
        reversal = ledger.reverse_entry(
            disbursement.journal_entry,
            on=today,
            description=f"Anulación del préstamo {loan.number}: {reason.text}",
            created_by=user,
            redirect=_void_redirect(disbursement, user),
        )
    except ledger.InsufficientFunds as exc:
        raise DisbursementError(str(exc), code="insufficient_funds") from exc
    disbursement.reversal_entry = reversal
    disbursement.save(update_fields=["reversal_entry", "updated_at"])
    from apps.ledger import fiscal

    fiscal.on_reversal("lending.disbursement", loan.id, today)
    loan.charges.update(status=LoanCharge.Status.REVERSED)
    for item in loan.collaterals.select_related("collateral"):
        item.collateral.status = Collateral.Status.RELEASED
        item.collateral.save(update_fields=["status", "updated_at"])
    loan.status = Loan.Status.VOIDED
    loan.voided_on = today
    loan.void_reason = reason
    loan.void_note = note
    loan.principal_outstanding = ZERO
    loan.interest_outstanding = ZERO
    loan.next_due_date = None
    loan.save()
    record_event(
        company_id=loan.company_id,
        type="loan.voided",
        target=loan,
        actor=user,
        summary=f"Anulado: {reason.text}",
        data={"entry": reversal.number},
    )
    return loan
