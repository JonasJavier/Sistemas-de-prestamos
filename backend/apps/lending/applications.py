"""Flow F3: application, evaluation and decision (doc 04; decision 023).

Every state change goes through this module, inside the caller's
transaction, and leaves a DomainEvent for the timeline. The rules that
cannot be switched off (doc 06 - section 4):
- nobody decides on an application they created (also a DB constraint);
- approving needs the G/Su role, the branch in scope and a limit that
  covers the amount; rejecting or returning needs only the role and scope.
"""

import datetime as dt
from dataclasses import dataclass, field
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q, QuerySet, Sum
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import ApprovalLimit, User
from apps.audit.models import record_event
from apps.core.models import Company, Reason, Sequence
from apps.customers.models import Business, Customer, Employment
from apps.lending import simulator
from apps.lending.models import (
    Application,
    ApplicationBudgetItem,
    ApplicationRequirement,
    Loan,
    LoanProduct,
)
from engine.money import money
from engine.rates import DAYS_PER_PERIOD, Frequency

APPROVE = ApprovalLimit.Operation.APPROVE_APPLICATION
EDITOR_ROLES = (authz.GERENTE, authz.SUPERVISOR, authz.OFICIAL)
DECIDER_ROLES = (authz.GERENTE, authz.SUPERVISOR)


class ApplicationError(Exception):
    """A rule of F3 stops the action; the message is shown to the user."""

    def __init__(self, message: str, *, code: str = "invalid", issues: list | None = None):
        super().__init__(message)
        self.code = code
        self.issues = issues or []


def _event(application: Application, kind: str, actor: User, summary: str, **data) -> None:
    record_event(
        company_id=application.company_id,
        type=f"application.{kind}",
        target=application,
        actor=actor,
        summary=summary,
        data={k: str(v) for k, v in data.items()},
    )


# --- Create and edit -----------------------------------------------------------


def _validated_simulation(
    product: LoanProduct,
    *,
    amount: Decimal,
    installments: int,
    frequency: str,
    rate: Decimal | None,
    first_due: dt.date | None,
) -> simulator.Simulation:
    """The product's ranges are the law (F3 step 1); the engine quotes."""
    if not product.is_active:
        raise ApplicationError("El producto está inactivo.", code="product_inactive")
    try:
        return simulator.simulate(
            product=product,
            amount=amount,
            installments=installments,
            frequency=frequency,
            rate=rate,
            first_due=first_due,
        )
    except ValidationError as exc:
        raise ApplicationError(
            "Las condiciones no cumplen los rangos del producto.",
            code="out_of_range",
            issues=[{"field": k, "message": " ".join(v)} for k, v in exc.message_dict.items()],
        ) from exc


def _prefill_budget(application: Application, customer: Customer) -> None:
    """Start the evaluation from what the customer file already says."""
    items = []
    employment = Employment.objects.filter(customer=customer).first()
    if employment and employment.monthly_salary:
        items.append(
            ("income", "salary", f"Sueldo en {employment.employer}", employment.monthly_salary)
        )
    business = Business.objects.filter(customer=customer).first()
    if business and business.monthly_sales:
        items.append(("income", "business", f"Ventas de {business.name}", business.monthly_sales))
    if business and business.monthly_expenses:
        items.append(
            ("expense", "business", f"Gastos de {business.name}", business.monthly_expenses)
        )
    ApplicationBudgetItem.objects.bulk_create(
        ApplicationBudgetItem(
            company_id=application.company_id,
            application=application,
            kind=kind,
            category=category,
            description=description,
            monthly_amount=amount,
        )
        for kind, category, description, amount in items
    )


def _sync_requirements(application: Application) -> None:
    """Add the product's checklist lines that are missing; keep the rest."""
    existing = set(application.requirements.values_list("name", flat=True))
    ApplicationRequirement.objects.bulk_create(
        ApplicationRequirement(company_id=application.company_id, application=application, name=n)
        for n in application.product.required_documents
        if n not in existing
    )


def _require_editor(user: User, application_branch_id) -> None:
    if not authz.has_any_role(user, *EDITOR_ROLES):
        raise ApplicationError("Tu rol no permite crear ni editar solicitudes.", code="forbidden")
    if not authz.in_scope(user, application_branch_id):
        raise ApplicationError("La solicitud es de otra sucursal.", code="out_of_scope")


@transaction.atomic
def create_application(
    *,
    user: User,
    customer: Customer,
    product: LoanProduct,
    amount: Decimal,
    frequency: str,
    installments: int,
    rate: Decimal | None = None,
    first_due: dt.date | None = None,
    purpose: str = "",
    notes: str = "",
) -> Application:
    # The application lives in the customer's branch (decision 033 scope).
    branch = customer.home_branch
    _require_editor(user, branch.id)
    rate = rate if rate is not None else product.default_rate
    _validated_simulation(
        product,
        amount=amount,
        installments=installments,
        frequency=frequency,
        rate=rate,
        first_due=first_due,
    )
    application = Application.objects.create(
        company_id=customer.company_id,
        number=Sequence.allocate(branch, Sequence.DocType.APPLICATION),
        branch=branch,
        customer=customer,
        product=product,
        amount=money(amount),
        frequency=frequency,
        installments=installments,
        rate=rate,
        rate_unit=product.rate_unit,
        first_due=first_due,
        purpose=purpose,
        notes=notes,
        created_by=user,
    )
    _sync_requirements(application)
    _prefill_budget(application, customer)
    _event(application, "created", user, f"Solicitud {application.number} creada")
    return application


@transaction.atomic
def update_application(application: Application, *, user: User, **changes) -> Application:
    application = Application.objects.select_for_update().get(pk=application.pk)
    _require_editor(user, application.branch_id)
    if application.status not in Application.EDITABLE:
        raise ApplicationError(
            "Solo se editan borradores y solicitudes devueltas.", code="not_editable"
        )
    product = changes.get("product", application.product)
    for name in ("amount", "frequency", "installments", "rate", "first_due", "purpose", "notes"):
        if name in changes:
            setattr(application, name, changes[name])
    if product.pk != application.product_id:
        application.product = product
        application.rate_unit = product.rate_unit
    _validated_simulation(
        application.product,
        amount=application.amount,
        installments=application.installments,
        frequency=application.frequency,
        rate=application.rate,
        first_due=application.first_due,
    )
    for name in ("bureau_provider", "bureau_score", "bureau_date"):
        if name in changes:
            setattr(application, name, changes[name])
    application.save()
    _sync_requirements(application)
    return application


# --- Evaluation (F3 step 2) ------------------------------------------------------


@dataclass
class Evaluation:
    simulation: simulator.Simulation
    monthly_income: Decimal
    monthly_expenses: Decimal
    available: Decimal
    monthly_payment: Decimal
    capacity_ratio: Decimal | None
    capacity_alert_ratio: Decimal
    coverage: Decimal | None
    min_coverage: Decimal | None
    requirements_total: int
    requirements_verified: int
    references_total: int
    references_verified: int
    previous_applications: dict[str, int]
    loans_total: int
    loans_active: int
    customer_blocked: bool
    has_bureau: bool
    guarantors: int
    collaterals: int
    alerts: list[dict[str, str]] = field(default_factory=list)

    def blocking(self, *codes: str) -> list[dict[str, str]]:
        return [alert for alert in self.alerts if alert["code"] in codes]


SUBMIT_BLOCKERS = ("guarantee_missing", "coverage_insufficient")
APPROVE_BLOCKERS = (
    "customer_blocked",
    "guarantee_missing",
    "coverage_insufficient",
    "requirements_pending",
)


def _conditions(application: Application, use_approved: bool) -> dict:
    if use_approved and application.approved_amount is not None:
        return {
            "amount": application.approved_amount,
            "installments": application.approved_installments,
            "frequency": application.approved_frequency,
            "rate": application.approved_rate,
            "first_due": application.approved_first_due,
        }
    return {
        "amount": application.amount,
        "installments": application.installments,
        "frequency": application.frequency,
        "rate": application.rate,
        "first_due": application.first_due,
    }


def evaluate(
    application: Application, *, conditions: dict | None = None, use_approved: bool = True
) -> Evaluation:
    conditions = conditions or _conditions(application, use_approved)
    sim = _validated_simulation(application.product, **conditions)
    amount = conditions["amount"]

    budget = application.budget_items.values("kind").annotate(total=Sum("monthly_amount"))
    totals = {row["kind"]: row["total"] for row in budget}
    income = money(totals.get("income") or 0)
    expenses = money(totals.get("expense") or 0)
    available = income - expenses

    # The regular installment as a monthly burden (30-day commercial month).
    days = DAYS_PER_PERIOD[Frequency(conditions["frequency"])]
    monthly_payment = money(sim.schedule[0].total * 30 / days)
    ratio = (monthly_payment / available).quantize(Decimal("0.0001")) if available > 0 else None

    considered = application.collaterals.aggregate(total=Sum("considered_value"))["total"]
    coverage = (Decimal(considered) / amount).quantize(Decimal("0.01")) if considered else None

    requirements = application.requirements.aggregate(
        total=Count("id"), verified=Count("id", filter=Q(verified_at__isnull=False))
    )
    customer = application.customer
    references = customer.references.aggregate(
        total=Count("id"), verified=Count("id", filter=Q(verified_at__isnull=False))
    )
    previous = dict(
        Application.objects.filter(customer=customer)
        .exclude(pk=application.pk)
        .values_list("status")
        .annotate(n=Count("id"))
    )
    loans = Loan.objects.filter(customer=customer)
    company = Company.objects.only("capacity_alert_ratio").get(pk=application.company_id)
    product = application.product

    evaluation = Evaluation(
        simulation=sim,
        monthly_income=income,
        monthly_expenses=expenses,
        available=available,
        monthly_payment=monthly_payment,
        capacity_ratio=ratio,
        capacity_alert_ratio=company.capacity_alert_ratio,
        coverage=coverage,
        min_coverage=product.min_coverage,
        requirements_total=requirements["total"],
        requirements_verified=requirements["verified"],
        references_total=references["total"],
        references_verified=references["verified"],
        previous_applications=previous,
        loans_total=loans.count(),
        loans_active=loans.filter(status=Loan.Status.ACTIVE).count(),
        customer_blocked=customer.status == Customer.Status.BLOCKED,
        has_bureau=bool(application.bureau_provider and application.bureau_score is not None),
        guarantors=application.guarantors.count(),
        collaterals=application.collaterals.count(),
    )
    alerts = evaluation.alerts
    if ratio is None:
        alerts.append(
            {"code": "capacity_unknown", "message": "Sin ingresos disponibles para evaluar."}
        )
    elif ratio > company.capacity_alert_ratio:
        alerts.append(
            {
                "code": "capacity_high",
                "message": (
                    f"La cuota usa el {ratio:.0%} de lo disponible "
                    f"(alerta desde el {company.capacity_alert_ratio:.0%})."
                ),
            }
        )
    if evaluation.customer_blocked:
        alerts.append(
            {
                "code": "customer_blocked",
                "message": f"Cliente bloqueado: {customer.block_reason or 'no prestar'}.",
            }
        )
    if (
        product.guarantee == LoanProduct.GuaranteeRequirement.GUARANTOR
        and not evaluation.guarantors
    ):
        alerts.append({"code": "guarantee_missing", "message": "El producto exige un garante."})
    if product.guarantee == LoanProduct.GuaranteeRequirement.ASSET and not evaluation.collaterals:
        alerts.append(
            {"code": "guarantee_missing", "message": "El producto exige un bien en garantía."}
        )
    if product.min_coverage and (coverage or 0) < product.min_coverage:
        alerts.append(
            {
                "code": "coverage_insufficient",
                "message": (
                    f"Cobertura {coverage or 0}× por debajo del mínimo {product.min_coverage}×."
                ),
            }
        )
    if evaluation.requirements_verified < evaluation.requirements_total:
        pending = evaluation.requirements_total - evaluation.requirements_verified
        alerts.append(
            {"code": "requirements_pending", "message": f"{pending} documento(s) sin verificar."}
        )
    if not evaluation.has_bureau:
        alerts.append({"code": "bureau_missing", "message": "Falta la consulta al buró."})
    return evaluation


# --- Approver assignment and decision -------------------------------------------


def _decider_problem(application: Application, user: User, amount: Decimal | None) -> str | None:
    if user.pk == application.created_by_id:
        return "Nadie decide sobre una solicitud que creó (decisión 023)."
    if not authz.has_any_role(user, *DECIDER_ROLES):
        return "Solo el supervisor o el gerente deciden solicitudes."
    if not authz.in_scope(user, application.branch_id):
        return "La solicitud es de otra sucursal."
    if amount is not None and not authz.within_limit(user, APPROVE, amount):
        return "El monto supera tu límite de aprobación."
    return None


def eligible_approvers(application: Application, amount: Decimal) -> list[User]:
    """Deciders who could approve ``amount``, smallest sufficient limit first."""
    candidates = (
        User.objects.filter(
            company_id=application.company_id,
            is_active=True,
            memberships__role__name__in=DECIDER_ROLES,
        )
        .exclude(pk=application.created_by_id)
        .distinct()
    )
    eligible = [u for u in candidates if _decider_problem(application, u, amount) is None]
    pending = dict(
        Application.objects.filter(
            status=Application.Status.IN_REVIEW, assigned_approver__in=eligible
        )
        .values_list("assigned_approver")
        .annotate(n=Count("id"))
    )

    def sort_key(user: User) -> tuple:
        limit = authz.approval_limit(user, APPROVE)
        unlimited = limit is None
        return (unlimited, limit or Decimal(0), pending.get(user.pk, 0), user.date_joined)

    return sorted(eligible, key=sort_key)


@transaction.atomic
def submit(application: Application, *, user: User) -> Application:
    application = Application.objects.select_for_update().get(pk=application.pk)
    _require_editor(user, application.branch_id)
    if application.status not in Application.SUBMITTABLE:
        raise ApplicationError("Esta solicitud no se puede enviar a aprobación.", code="state")
    evaluation = evaluate(application, use_approved=False)
    blockers = evaluation.blocking(*SUBMIT_BLOCKERS)
    if blockers:
        raise ApplicationError(
            "Corrige lo siguiente antes de enviar.", code="blocked", issues=blockers
        )
    approvers = eligible_approvers(application, application.amount)
    if not approvers:
        raise ApplicationError(
            "No hay un aprobador con límite suficiente que no sea quien creó la solicitud. "
            "Invita a un supervisor o gerente, o ajusta los límites.",
            code="no_approver",
        )
    application.status = Application.Status.IN_REVIEW
    application.submitted_at = timezone.now()
    application.assigned_approver = approvers[0]
    application.capacity_ratio = evaluation.capacity_ratio
    # A resubmission starts a fresh decision.
    application.decided_by = None
    application.decided_at = None
    application.decision_reason = None
    application.decision_note = ""
    application.approved_amount = None
    application.approved_installments = None
    application.approved_rate = None
    application.approved_frequency = ""
    application.approved_first_due = None
    application.valid_until = None
    application.save()
    _event(
        application,
        "submitted",
        user,
        f"Enviada a aprobación; asignada a {approvers[0].get_full_name() or approvers[0].email}",
    )
    return application


def _lock_for_decision(application: Application) -> Application:
    application = Application.objects.select_for_update().get(pk=application.pk)
    if application.status != Application.Status.IN_REVIEW:
        raise ApplicationError("La solicitud no está en evaluación.", code="state")
    return application


@transaction.atomic
def approve(
    application: Application,
    *,
    user: User,
    adjustments: dict | None = None,
    note: str = "",
) -> Application:
    """Approve, optionally with adjusted conditions (F3 step 4)."""
    application = _lock_for_decision(application)
    conditions = _conditions(application, use_approved=False)
    adjusted = {k: v for k, v in (adjustments or {}).items() if v is not None and k in conditions}
    changes = {k: (conditions[k], v) for k, v in adjusted.items() if conditions[k] != v}
    conditions.update(adjusted)

    problem = _decider_problem(application, user, conditions["amount"])
    if problem:
        raise ApplicationError(problem, code="forbidden")
    evaluation = evaluate(application, conditions=conditions)
    blockers = evaluation.blocking(*APPROVE_BLOCKERS)
    if blockers:
        raise ApplicationError("No se puede aprobar todavía.", code="blocked", issues=blockers)

    today = timezone.localdate()
    company = Company.objects.only("application_validity_days").get(pk=application.company_id)
    application.approved_amount = money(conditions["amount"])
    application.approved_installments = conditions["installments"]
    application.approved_frequency = conditions["frequency"]
    application.approved_rate = conditions["rate"]
    application.approved_first_due = conditions["first_due"]
    application.valid_until = today + dt.timedelta(days=company.application_validity_days)
    application.status = Application.Status.APPROVED
    application.decided_by = user
    application.decided_at = timezone.now()
    application.decision_note = note
    application.save()
    summary = "Aprobada con ajustes" if changes else "Aprobada"
    _event(
        application,
        "approved",
        user,
        f"{summary}; vigente hasta {application.valid_until:%d/%m/%Y}",
        **{f"{k}_from": old for k, (old, _new) in changes.items()},
        **{f"{k}_to": new for k, (_old, new) in changes.items()},
    )
    return application


@transaction.atomic
def reject(application: Application, *, user: User, reason: Reason, note: str) -> Application:
    application = _lock_for_decision(application)
    problem = _decider_problem(application, user, amount=None)
    if problem:
        raise ApplicationError(problem, code="forbidden")
    if reason.kind != Reason.Kind.REJECTION:
        raise ApplicationError("Elige un motivo de rechazo del catálogo.", code="reason")
    if not note.strip():
        raise ApplicationError("Escribe una nota para el rechazo.", code="note")
    application.status = Application.Status.REJECTED
    application.decided_by = user
    application.decided_at = timezone.now()
    application.decision_reason = reason
    application.decision_note = note
    application.save()
    _event(application, "rejected", user, f"Rechazada: {reason.text}")
    return application


@transaction.atomic
def return_to_officer(application: Application, *, user: User, note: str) -> Application:
    application = _lock_for_decision(application)
    problem = _decider_problem(application, user, amount=None)
    if problem:
        raise ApplicationError(problem, code="forbidden")
    if not note.strip():
        raise ApplicationError("Indica qué debe corregir el oficial.", code="note")
    application.status = Application.Status.RETURNED
    application.decision_note = note
    application.save()
    _event(application, "returned", user, f"Devuelta para corregir: {note[:200]}")
    return application


@transaction.atomic
def withdraw(application: Application, *, user: User, note: str) -> Application:
    application = Application.objects.select_for_update().get(pk=application.pk)
    _require_editor(user, application.branch_id)
    if application.status not in Application.WITHDRAWABLE:
        raise ApplicationError("Esta solicitud ya no se puede desistir.", code="state")
    application.status = Application.Status.WITHDRAWN
    application.decision_note = note
    application.save()
    _event(application, "withdrawn", user, "El cliente desistió" + (f": {note}" if note else ""))
    return application


def expire_overdue(today: dt.date | None = None) -> int:
    """Approved applications past their validity become expired (F3 step 5)."""
    today = today or timezone.localdate()
    count = 0
    for application in Application.objects.filter(
        status=Application.Status.APPROVED, valid_until__lt=today
    ):
        application.status = Application.Status.EXPIRED
        application.save(update_fields=["status", "updated_at"])
        _event(application, "expired", None, "Venció sin desembolsar; se reevalúa")
        count += 1
    return count


def pending_for(user: User) -> QuerySet[Application]:
    """«Por aprobar»: what this user may decide right now."""
    queryset = Application.objects.filter(status=Application.Status.IN_REVIEW).exclude(
        created_by=user
    )
    if not authz.has_any_role(user, *DECIDER_ROLES):
        return queryset.none()
    scope = authz.branch_scope(user)
    if scope is not None:
        queryset = queryset.filter(branch_id__in=scope)
    limit = authz.approval_limit(user, APPROVE)
    if isinstance(limit, authz.NoLimit):
        return queryset.none()
    if limit is not None:
        queryset = queryset.filter(amount__lte=limit)
    return queryset
