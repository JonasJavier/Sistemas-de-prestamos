"""F15 · Expenses and other income (P54, decision 081).

Doc 06 matrix: G and Ct register any amount; the supervisor and the cashier
up to their «Gasto» limit (the cashier only petty cash from his own open
drawer); above it the expense waits for someone else's approval (G, or a
supervisor within his limit) and the money moves only then. Income is
registered directly. Voiding is G only, with the inverse entry dated today
(a closed month is never touched).
"""

import datetime as dt
import re
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import User
from apps.audit.models import record_event
from apps.cash.services import STALE_MESSAGE, is_stale, open_session_of
from apps.core.models import Branch, Sequence
from apps.customers.files import inspect_private_file
from apps.customers.validators import clean_document, validate_cedula
from apps.expenses.models import Expense, ExpenseCategory, ExpenseFile, Kind
from apps.ledger import accounting
from apps.ledger import services as ledger
from apps.ledger.models import FinancialAccount
from apps.notifications.models import Notification
from apps.notifications.services import notify, supervisors_of
from engine.money import money

ZERO = Decimal("0.00")
REGISTER_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.CAJERO, authz.CONTABILIDAD)
UNLIMITED_ROLES = (authz.GERENTE, authz.CONTABILIDAD)
APPROVE_ROLES = (authz.GERENTE, authz.SUPERVISOR)
VOID_ROLES = (authz.GERENTE,)

# NCF (B01-B17, 11 characters) and e-NCF (E31-E47, 13 characters).
NCF_RE = re.compile(r"^(B(0[1-9]|1[0-7])\d{8}|E(3[1-9]|4[0-7])\d{10})$")


class ExpenseError(Exception):
    def __init__(self, message: str, code: str = "invalid") -> None:
        super().__init__(message)
        self.code = code


def clean_ncf(value: str) -> str:
    ncf = value.strip().upper().replace("-", "").replace(" ", "")
    if ncf and not NCF_RE.match(ncf):
        raise ExpenseError(
            "El NCF no es válido: B01…B17 con 8 dígitos o E31…E47 con 10 (e-CF).", "ncf"
        )
    return ncf


def clean_party_document(value: str) -> str:
    digits = clean_document(value)
    if not digits:
        return ""
    if len(digits) == 9:
        return digits  # RNC
    if len(digits) == 11:
        try:
            return validate_cedula(digits)
        except ValidationError as exc:
            raise ExpenseError(exc.messages[0], "party_document") from exc
    raise ExpenseError("El documento es un RNC (9 dígitos) o una cédula (11).", "party_document")


def _only_cashier(user: User) -> bool:
    roles = authz.role_names(user)
    return bool(roles) and roles <= {authz.CAJERO, authz.COBRADOR}


def _may_post_directly(user: User, amount: Decimal) -> bool:
    return authz.has_any_role(user, *UNLIMITED_ROLES) or authz.within_limit(user, "expense", amount)


def _lines(expense: Expense) -> list[ledger.Line]:
    category = expense.category
    dims = {"cash_session_id": expense.cash_session_id} if expense.cash_session_id else {}
    memo = expense.description[:200]
    if expense.kind == Kind.EXPENSE:
        return [
            ledger.debit(category.account, expense.amount, memo=memo),
            ledger.cash_line(expense.account, credit_amount=expense.amount, **dims),
        ]
    return [
        ledger.cash_line(expense.account, debit_amount=expense.amount, **dims),
        ledger.credit(category.account, expense.amount, memo=memo),
    ]


def _post(expense: Expense, user: User) -> None:
    party = f" · {expense.party_name}" if expense.party_name else ""
    expense.entry = ledger.post_entry(
        company_id=expense.company_id,
        branch=expense.branch,
        on=expense.date,
        description=f"{expense.get_kind_display()} {expense.number}: {expense.description}{party}"[
            :300
        ],
        source_type=f"expenses.{expense.kind}",
        source_id=expense.id,
        lines=_lines(expense),
        created_by=user,
    )
    expense.status = Expense.Status.POSTED


@transaction.atomic
def register(
    *,
    user: User,
    kind: str,
    date: dt.date,
    branch: Branch,
    category: ExpenseCategory,
    description: str,
    amount: Decimal,
    itbis: Decimal = ZERO,
    method: str = Expense.Method.CASH,
    account: FinancialAccount | None = None,
    from_drawer: bool = False,
    party_name: str = "",
    party_document: str = "",
    ncf: str = "",
    files: list[UploadedFile] | None = None,
) -> Expense:
    if not authz.has_any_role(user, *REGISTER_ROLES):
        raise ExpenseError("Tu rol no registra gastos ni ingresos.", "forbidden")
    if not authz.in_scope(user, branch.id):
        raise ExpenseError("No trabajas en esa sucursal.", "out_of_scope")
    if category.kind != kind or not category.is_active:
        raise ExpenseError("Elige una categoría activa del tipo correcto.", "category")
    amount, itbis = money(amount), money(itbis or ZERO)
    if amount <= 0:
        raise ExpenseError("El monto debe ser mayor que cero.", "amount")
    if itbis < 0 or itbis > amount or (kind == Kind.INCOME and itbis):
        raise ExpenseError("El ITBIS va en los gastos y no supera el monto.", "itbis")
    today = timezone.localdate()
    if date > today:
        raise ExpenseError("La fecha no puede ser futura.", "date")
    try:
        accounting.ensure_open(user.company_id, date)
    except accounting.AccountingError as exc:
        raise ExpenseError(str(exc), "date") from exc
    if not description.strip():
        raise ExpenseError("Describe el gasto o el ingreso.", "description")

    session = None
    if from_drawer or _only_cashier(user):
        session = open_session_of(user)
        if session is None or session.branch_id != branch.id:
            raise ExpenseError(
                "Abre tu caja en esa sucursal para registrarlo desde ella.", "session"
            )
        if is_stale(session):
            raise ExpenseError(STALE_MESSAGE, "stale_session")
        if date != today:
            raise ExpenseError("Lo que sale de tu caja lleva la fecha de hoy.", "date")
        account, method = session.drawer, Expense.Method.CASH
    elif account is None or not account.is_active or account.is_personal:
        raise ExpenseError("Elige la caja general o el banco de donde sale el dinero.", "account")

    direct = kind == Kind.INCOME or _may_post_directly(user, amount)
    if session is not None and not direct:
        raise ExpenseError(
            "Supera tu límite para gastos: pídele al supervisor que lo registre.", "limit"
        )
    expense = Expense.objects.create(
        company_id=user.company_id,
        number=Sequence.allocate(
            branch, Sequence.DocType.EXPENSE if kind == Kind.EXPENSE else Sequence.DocType.INCOME
        ),
        kind=kind,
        date=date,
        branch=branch,
        category=category,
        description=description.strip()[:300],
        amount=amount,
        itbis=itbis,
        method=method,
        account=account,
        cash_session=session,
        party_name=party_name.strip()[:200],
        party_document=clean_party_document(party_document),
        ncf=clean_ncf(ncf),
        created_by=user,
    )
    for upload in files or []:
        attach(expense=expense, user=user, upload=upload)
    if direct:
        _post(expense, user)
        expense.save(update_fields=["entry", "status", "updated_at"])
    else:
        notify(
            company_id=expense.company_id,
            users=[
                u
                for u in supervisors_of(branch.id, exclude=user)
                if authz.has_any_role(u, authz.GERENTE) or authz.within_limit(u, "expense", amount)
            ],
            kind=Notification.Kind.APPROVAL_REQUESTED,
            text=f"Gasto {expense.number} por aprobar: RD$ {amount:,.2f} · {expense.description}",
            link="/gastos",
        )
    record_event(
        company_id=expense.company_id,
        type=f"expense.{'posted' if direct else 'requested'}",
        target=expense,
        actor=user,
        summary=f"{expense.get_kind_display()} {expense.number}: RD$ {amount:,.2f}"
        + ("" if direct else " (por aprobar)"),
    )
    return expense


def attach(*, expense: Expense, user: User, upload: UploadedFile) -> ExpenseFile:
    try:
        content_type, size, sha256 = inspect_private_file(upload)
    except ValidationError as exc:
        raise ExpenseError(exc.messages[0], "file") from exc
    file = ExpenseFile(
        company_id=expense.company_id,
        expense=expense,
        content_type=content_type,
        size=size,
        sha256=sha256,
        uploaded_by=user,
    )
    file.file.save(upload.name, upload, save=False)
    file.save()
    return file


def _locked(expense: Expense) -> Expense:
    return (
        Expense.objects.select_for_update(of=("self",))
        .select_related("category", "account", "branch")
        .get(pk=expense.pk)
    )


@transaction.atomic
def approve(*, expense: Expense, user: User, note: str = "") -> Expense:
    expense = _locked(expense)
    if expense.status != Expense.Status.PENDING:
        raise ExpenseError("Ese gasto ya se decidió.", "state")
    if expense.created_by_id == user.pk:
        raise ExpenseError("Nadie aprueba su propio gasto.", "forbidden")
    if not authz.has_any_role(user, *APPROVE_ROLES) or not (
        authz.has_any_role(user, authz.GERENTE)
        or authz.within_limit(user, "expense", expense.amount)
    ):
        raise ExpenseError("Ese gasto supera tu límite de aprobación.", "forbidden")
    if not authz.in_scope(user, expense.branch_id):
        raise ExpenseError("El gasto es de otra sucursal.", "out_of_scope")
    try:
        _post(expense, user)
    except accounting.AccountingError as exc:
        raise ExpenseError(str(exc), "closed") from exc
    expense.decided_by, expense.decided_at = user, timezone.now()
    expense.decision_note = note.strip()[:300]
    expense.save(
        update_fields=["entry", "status", "decided_by", "decided_at", "decision_note", "updated_at"]
    )
    notify(
        company_id=expense.company_id,
        users=[expense.created_by],
        kind=Notification.Kind.APPROVAL_DECIDED,
        text=f"Gasto {expense.number} aprobado y registrado.",
        link="/gastos",
    )
    record_event(
        company_id=expense.company_id,
        type="expense.approved",
        target=expense,
        actor=user,
        summary=f"Gasto {expense.number} aprobado",
    )
    return expense


@transaction.atomic
def reject(*, expense: Expense, user: User, note: str) -> Expense:
    expense = _locked(expense)
    if expense.status != Expense.Status.PENDING:
        raise ExpenseError("Ese gasto ya se decidió.", "state")
    if expense.created_by_id == user.pk or not authz.has_any_role(user, *APPROVE_ROLES):
        raise ExpenseError("No puedes decidir este gasto.", "forbidden")
    if not note.strip():
        raise ExpenseError("Escribe por qué se rechaza.", "note")
    expense.status = Expense.Status.REJECTED
    expense.decided_by, expense.decided_at = user, timezone.now()
    expense.decision_note = note.strip()[:300]
    expense.save(
        update_fields=["status", "decided_by", "decided_at", "decision_note", "updated_at"]
    )
    notify(
        company_id=expense.company_id,
        users=[expense.created_by],
        kind=Notification.Kind.APPROVAL_DECIDED,
        text=f"Gasto {expense.number} rechazado: {expense.decision_note}",
        link="/gastos",
    )
    return expense


@transaction.atomic
def void(*, expense: Expense, user: User, reason: str) -> Expense:
    """The inverse entry, today; petty cash returns through an open drawer."""
    expense = _locked(expense)
    if not authz.has_any_role(user, *VOID_ROLES):
        raise ExpenseError("Solo el gerente anula gastos e ingresos.", "forbidden")
    if expense.status != Expense.Status.POSTED:
        raise ExpenseError("Solo se anula lo registrado.", "state")
    if not reason.strip():
        raise ExpenseError("Escribe el motivo de la anulación.", "reason")
    redirect = None
    if expense.cash_session_id:
        session = expense.cash_session
        if session.status != session.Status.OPEN:
            current = open_session_of(user)
            if current is None:
                raise ExpenseError(
                    "La caja de ese gasto ya cerró: abre la tuya para que el efectivo vuelva.",
                    "session",
                )
            redirect = {expense.account_id: (current.drawer, {"cash_session_id": current.id})}
    expense.void_entry = ledger.reverse_entry(
        expense.entry,
        on=timezone.localdate(),
        description=f"Anulación de {expense.number}: {reason.strip()}"[:300],
        created_by=user,
        redirect=redirect,
    )
    expense.status = Expense.Status.VOIDED
    expense.voided_by, expense.voided_at = user, timezone.now()
    expense.void_reason = reason.strip()[:300]
    expense.save(
        update_fields=[
            "void_entry",
            "status",
            "voided_by",
            "voided_at",
            "void_reason",
            "updated_at",
        ]
    )
    record_event(
        company_id=expense.company_id,
        type="expense.voided",
        target=expense,
        actor=user,
        summary=f"{expense.get_kind_display()} {expense.number} anulado: {expense.void_reason}",
    )
    return expense


EDITABLE = ("description", "party_name", "party_document", "ncf")


@transaction.atomic
def update_details(*, expense: Expense, user: User, **changes) -> Expense:
    """Descriptive fields change with history (#18); money never does."""
    expense = _locked(expense)
    if expense.status in (Expense.Status.VOIDED, Expense.Status.REJECTED):
        raise ExpenseError("Lo anulado o rechazado ya no se edita.", "state")
    if not (
        authz.has_any_role(user, *UNLIMITED_ROLES)
        or (expense.created_by_id == user.pk and expense.status == Expense.Status.PENDING)
    ):
        raise ExpenseError("No puedes editar este registro.", "forbidden")
    if "ncf" in changes:
        changes["ncf"] = clean_ncf(changes["ncf"])
    if "party_document" in changes:
        changes["party_document"] = clean_party_document(changes["party_document"])
    for key, value in changes.items():
        if key in EDITABLE:
            setattr(expense, key, value.strip() if isinstance(value, str) else value)
    if not expense.description:
        raise ExpenseError("Describe el gasto o el ingreso.", "description")
    expense.save()
    return expense
