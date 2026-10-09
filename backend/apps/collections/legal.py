"""F9 · Vía legal (decision 095): professionals, cases and their costs.

The manager sends a loan in arrears to the legal path with its lawyer (and
the bailiff and notary as the case needs them). A case goes open → in
agreement or in execution → closed with its outcome. Each cost is paid as
an expense («Honorarios de abogados y notarios») and, when the contract
allows it, charged to the customer on the oldest unpaid installment, so it
is collected like any charge. The legal documents come from the case.
"""

import datetime as dt
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.collections.models import LegalCase, LegalCost, LegalProfessional
from apps.core.models import Sequence
from apps.lending.models import Installment, Loan
from engine.money import money

CASE_ROLES = (authz.GERENTE,)
CATALOG_ROLES = (authz.GERENTE, authz.ADMINISTRADOR)
LEGAL_CATEGORY = "Honorarios de abogados y notarios"


class LegalError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


# --- P78 · Professionals ---------------------------------------------------------------------


def save_professional(
    *, user: User, professional: LegalProfessional | None = None, **fields
) -> LegalProfessional:
    if not authz.has_any_role(user, *CATALOG_ROLES):
        raise LegalError("Los profesionales legales los lleva el gerente.", "forbidden")
    professional = professional or LegalProfessional(company_id=user.company_id)
    for key, value in fields.items():
        setattr(professional, key, value.strip() if isinstance(value, str) else value)
    if professional.kind not in LegalProfessional.Kind.values:
        raise LegalError("Elige el tipo de profesional.", "kind")
    if not professional.name:
        raise LegalError("Escribe el nombre.", "name")
    parent = professional.parent
    if professional.kind == LegalProfessional.Kind.WITNESS:
        if parent is None or parent.kind != LegalProfessional.Kind.LAWYER:
            raise LegalError("Un testigo trabaja con un abogado: elígelo.", "parent")
    elif parent is not None:
        raise LegalError("Solo un testigo apunta a un abogado.", "parent")
    if professional.kind in (LegalProfessional.Kind.LAWYER, LegalProfessional.Kind.NOTARY) and not (
        professional.license
    ):
        raise LegalError("Indica la matrícula del colegio de abogados o notarios.", "license")
    professional.save()
    return professional


# --- Cases -----------------------------------------------------------------------------------


def _check_manager(user: User, loan: Loan) -> None:
    if not authz.has_any_role(user, *CASE_ROLES):
        raise LegalError("La vía legal la decide el gerente.", "forbidden")
    if not authz.in_scope(user, loan.branch_id):
        raise LegalError("El préstamo es de otra sucursal.", "out_of_scope")


def _professional(value, kind: str, label: str) -> LegalProfessional | None:
    if value is None:
        return None
    if value.kind != kind or not value.is_active:
        raise LegalError(f"Elige un {label} activo del catálogo.", kind)
    return value


@transaction.atomic
def open_case(
    *,
    loan: Loan,
    user: User,
    lawyer: LegalProfessional,
    bailiff: LegalProfessional | None = None,
    notary: LegalProfessional | None = None,
    note: str = "",
) -> LegalCase:
    loan = Loan.objects.select_for_update().get(pk=loan.pk)
    _check_manager(user, loan)
    if loan.status not in (Loan.Status.ACTIVE, Loan.Status.WRITTEN_OFF):
        raise LegalError("Solo un préstamo activo o castigado va a la vía legal.", "state")
    if loan.status == Loan.Status.ACTIVE and loan.days_past_due <= 0:
        raise LegalError("Un préstamo al día no va a la vía legal.", "not_late")
    if LegalCase.objects.filter(loan=loan).exclude(status=LegalCase.Status.CLOSED).exists():
        raise LegalError("El préstamo ya tiene un caso legal abierto.", "open")
    _professional(lawyer, LegalProfessional.Kind.LAWYER, "abogado")
    _professional(bailiff, LegalProfessional.Kind.BAILIFF, "alguacil")
    _professional(notary, LegalProfessional.Kind.NOTARY, "notario")
    case = LegalCase.objects.create(
        company_id=loan.company_id,
        loan=loan,
        number=Sequence.allocate(loan.branch, Sequence.DocType.LEGAL_CASE),
        lawyer=lawyer,
        bailiff=bailiff,
        notary=notary,
        opened_on=timezone.localdate(),
        opened_by=user,
        note=note.strip(),
    )
    record_event(
        company_id=loan.company_id,
        type="legal.opened",
        target=loan,
        actor=user,
        summary=f"Enviado a la vía legal ({case.number}) con {lawyer.name}. {note.strip()}"[:300],
    )
    return case


@transaction.atomic
def update_case(*, case: LegalCase, user: User, **fields) -> LegalCase:
    case = LegalCase.objects.select_for_update().select_related("loan").get(pk=case.pk)
    _check_manager(user, case.loan)
    if case.status == LegalCase.Status.CLOSED:
        raise LegalError("El caso está cerrado.", "closed")
    if "status" in fields:
        if fields["status"] not in (
            LegalCase.Status.OPEN,
            LegalCase.Status.AGREEMENT,
            LegalCase.Status.EXECUTION,
        ):
            raise LegalError("Para cerrar el caso usa «Cerrar».", "status")
        case.status = fields["status"]
    for key, kind, label in (
        ("lawyer", LegalProfessional.Kind.LAWYER, "abogado"),
        ("bailiff", LegalProfessional.Kind.BAILIFF, "alguacil"),
        ("notary", LegalProfessional.Kind.NOTARY, "notario"),
    ):
        if key in fields:
            setattr(case, key, _professional(fields[key], kind, label))
    if case.lawyer_id is None:
        raise LegalError("El caso necesita su abogado.", "lawyer")
    if "note" in fields:
        case.note = fields["note"].strip()
    case.save()
    return case


@transaction.atomic
def close_case(*, case: LegalCase, user: User, outcome: str, note: str) -> LegalCase:
    case = LegalCase.objects.select_for_update().select_related("loan").get(pk=case.pk)
    _check_manager(user, case.loan)
    if case.status == LegalCase.Status.CLOSED:
        raise LegalError("El caso ya está cerrado.", "closed")
    if outcome not in LegalCase.Outcome.values:
        raise LegalError("Elige cómo termina el caso.", "outcome")
    if not note.strip():
        raise LegalError("Escribe la nota del cierre.", "note")
    if outcome == LegalCase.Outcome.WRITTEN_OFF and case.loan.status != Loan.Status.WRITTEN_OFF:
        raise LegalError("Primero castiga el préstamo; después cierra el caso.", "outcome")
    case.status = LegalCase.Status.CLOSED
    case.outcome = outcome
    case.closed_on = timezone.localdate()
    case.closed_by = user
    case.close_note = note.strip()
    case.save()
    record_event(
        company_id=case.company_id,
        type="legal.closed",
        target=case.loan,
        actor=user,
        summary=f"Caso {case.number} cerrado: {case.get_outcome_display()}. {note.strip()}"[:300],
    )
    return case


# --- Costs -----------------------------------------------------------------------------------


def _oldest_unpaid(loan: Loan) -> Installment | None:
    from apps.payments import portfolio

    for line in portfolio.position(loan, timezone.localdate()):
        if line.total > 0:
            return line.installment
    return None


@transaction.atomic
def add_cost(
    *,
    case: LegalCase,
    user: User,
    description: str,
    amount: Decimal,
    date: dt.date | None = None,
    account=None,
    party_name: str = "",
    party_document: str = "",
    ncf: str = "",
    charge_customer: bool = False,
) -> LegalCost:
    """A legal cost: paid now as an expense from ``account`` (or recorded
    when paid elsewhere) and, if the contract allows it, owed by the customer."""
    from apps.expenses import services as expenses
    from apps.expenses.models import ExpenseCategory, Kind
    from apps.payments import portfolio

    case = LegalCase.objects.select_for_update().select_related("loan__branch").get(pk=case.pk)
    loan = case.loan
    _check_manager(user, loan)
    if case.status == LegalCase.Status.CLOSED:
        raise LegalError("El caso está cerrado.", "closed")
    amount = money(amount)
    if amount <= 0:
        raise LegalError("El monto debe ser mayor que cero.", "amount")
    if not description.strip():
        raise LegalError("Describe la costa o el gasto.", "description")
    date = date or timezone.localdate()
    expense = None
    if account is not None:
        category = ExpenseCategory.objects.filter(
            kind=Kind.EXPENSE, name=LEGAL_CATEGORY, is_active=True
        ).first()
        if category is None:
            raise LegalError(f"Falta la categoría de gasto «{LEGAL_CATEGORY}».", "category")
        try:
            expense = expenses.register(
                user=user,
                kind=Kind.EXPENSE,
                date=date,
                branch=loan.branch,
                category=category,
                description=f"{description.strip()} · caso {case.number} ({loan.number})"[:300],
                amount=amount,
                account=account,
                party_name=party_name or case.lawyer.name,
                party_document=party_document,
                ncf=ncf,
                method="transfer" if account.kind == "bank" else "cash",
            )
        except expenses.ExpenseError as exc:
            raise LegalError(str(exc), getattr(exc, "code", "expense")) from exc
    installment = None
    if charge_customer:
        installment = _oldest_unpaid(loan)
        if installment is None:
            raise LegalError("El préstamo no tiene cuotas pendientes a las que cargarla.", "charge")
        Installment.objects.filter(pk=installment.pk).update(
            charges_due=installment.charges_due + amount
        )
        if loan.status == Loan.Status.ACTIVE:
            portfolio.refresh(Loan.objects.get(pk=loan.pk), timezone.localdate())
    cost = LegalCost.objects.create(
        company_id=case.company_id,
        case=case,
        date=date,
        description=description.strip(),
        amount=amount,
        expense=expense,
        charged=charge_customer,
        installment=installment,
        created_by=user,
    )
    record_event(
        company_id=case.company_id,
        type="legal.cost",
        target=loan,
        actor=user,
        summary=f"Costa del caso {case.number}: {description.strip()} RD$ {amount:,.2f}"
        + (" (cargada al cliente)" if charge_customer else ""),
    )
    return cost
