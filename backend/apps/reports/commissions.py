"""P63 «Comisiones» (decision 089): rules by role, the month's calculation
and its approval.

The base comes from what each person did in the month, with the same
netting as the reports: a reversal lowers the collector's base in the
month it is made, and a voided disbursement never counts. Approving the
month (manager or accounting, once the month is over) turns each amount
into a payable to the employee under the personnel expense category, so
the expense lands in the month and is paid like any other obligation.
"""

import datetime as dt
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import Membership, User
from apps.audit.models import record_event
from apps.reports.models import CommissionLine, CommissionRule, CommissionRun

ZERO = Decimal("0.00")
CALCULATORS = (authz.GERENTE, authz.CONTABILIDAD)
MONTHS = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]


class CommissionError(Exception):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.message = message
        self.code = code


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


# --- Rules ------------------------------------------------------------------------------------


def save_rule(*, actor: User, rule: CommissionRule | None = None, **fields) -> CommissionRule:
    if not authz.has_any_role(actor, authz.GERENTE):
        raise CommissionError("Las reglas de comisión las define el gerente.", "forbidden")
    rule = rule or CommissionRule(company_id=actor.company_id)
    for key, value in fields.items():
        setattr(rule, key, value)
    if not rule.name.strip():
        raise CommissionError("Ponle un nombre a la regla.", "name")
    if rule.role not in CommissionRule.Role.values or rule.base not in CommissionRule.Base.values:
        raise CommissionError("Elige el rol y la base.", "role")
    if rule.role == CommissionRule.Role.OFFICER and rule.base != CommissionRule.Base.DISBURSED:
        raise CommissionError("Al oficial se le paga por colocación.", "base")
    if rule.role == CommissionRule.Role.COLLECTOR and rule.base == CommissionRule.Base.DISBURSED:
        raise CommissionError("Al cobrador se le paga por lo que cobra.", "base")
    if not Decimal(0) < Decimal(rule.rate) <= Decimal(1):
        raise CommissionError("El porcentaje va de 0.01 % a 100 %.", "rate")
    if Decimal(rule.goal) < 0:
        raise CommissionError("La meta no puede ser negativa.", "goal")
    if (
        rule.user_id
        and not Membership.objects.filter(user_id=rule.user_id, role__name=rule.role).exists()
    ):
        raise CommissionError(f"Esa persona no tiene el rol {rule.role}.", "user")
    if rule.is_active:
        clash = CommissionRule.objects.filter(
            role=rule.role, user_id=rule.user_id, is_active=True
        ).exclude(pk=rule.pk)
        if clash.exists():
            who = "esa persona" if rule.user_id else f"el rol {rule.role}"
            raise CommissionError(f"Ya hay una regla activa para {who}.", "duplicate")
    rule.save()
    return rule


def _eligible() -> list[tuple[User, CommissionRule]]:
    """Each active person with a commissioned role and the rule that applies:
    their own if they have one, else their role's."""
    rules = list(CommissionRule.objects.filter(is_active=True))
    personal = {(r.role, r.user_id): r for r in rules if r.user_id}
    general = {r.role: r for r in rules if not r.user_id}
    pairs = []
    seen = set()
    for membership in (
        Membership.objects.filter(role__name__in=CommissionRule.Role.values, user__is_active=True)
        .select_related("user", "role")
        .order_by("user__first_name")
    ):
        role, person = membership.role.name, membership.user
        rule = personal.get((role, person.id)) or general.get(role)
        if rule is None or (person.id, rule.id) in seen:
            continue
        seen.add((person.id, rule.id))
        pairs.append((person, rule))
    return pairs


# --- The month's calculation ------------------------------------------------------------------


def base_of(
    person: User, rule: CommissionRule, first: dt.date, last: dt.date
) -> tuple[Decimal, dict]:
    from apps.lending.models import Disbursement
    from apps.payments.models import Payment, PaymentAllocation, PaymentReversal

    if rule.base == CommissionRule.Base.DISBURSED:
        rows = Disbursement.objects.filter(
            loan__officer=person,
            disbursed_on__gte=first,
            disbursed_on__lte=last,
            reversal_entry__isnull=True,
        ).aggregate(total=Sum("gross"), count=Count("id"))
        total = rows["total"] or ZERO
        return total, {"disbursements": rows["count"] or 0}
    payments = (
        Payment.objects.filter(collected_by=person, value_date__gte=first, value_date__lte=last)
        .exclude(kind=Payment.Kind.MIGRATED)
        .exclude(method=Payment.Method.RENEWAL)
    )
    reversed_ids = PaymentReversal.objects.filter(
        payment__collected_by=person, reversed_on__gte=first, reversed_on__lte=last
    ).values("payment_id")
    if rule.base == CommissionRule.Base.TOTAL_COLLECTED:
        got = payments.aggregate(t=Sum("amount"))["t"] or ZERO
        undone = Payment.objects.filter(id__in=reversed_ids).aggregate(t=Sum("amount"))["t"] or ZERO
    else:
        income = [PaymentAllocation.Component.INTEREST, PaymentAllocation.Component.LATE_FEE]
        got = (
            PaymentAllocation.objects.filter(payment__in=payments, component__in=income).aggregate(
                t=Sum("amount")
            )["t"]
            or ZERO
        )
        undone = (
            PaymentAllocation.objects.filter(
                payment_id__in=reversed_ids, component__in=income
            ).aggregate(t=Sum("amount"))["t"]
            or ZERO
        )
    return got - undone, {"payments": payments.count(), "reversed": undone}


def calculate(*, year: int, month: int, user: User) -> CommissionRun:
    from apps.ledger.accounting import month_bounds

    if not authz.has_any_role(user, *CALCULATORS):
        raise CommissionError("Las comisiones las calculan el gerente y contabilidad.", "forbidden")
    first, last = month_bounds(year, month)
    if first > timezone.localdate():
        raise CommissionError("Ese mes todavía no empieza.", "month")
    with transaction.atomic():
        run, _ = CommissionRun.objects.select_for_update().get_or_create(
            company_id=user.company_id,
            year=year,
            month=month,
            defaults={"computed_at": timezone.now(), "computed_by": user},
        )
        if run.status == CommissionRun.Status.APPROVED:
            raise CommissionError("Ese mes ya está aprobado.", "approved")
        run.lines.all().delete()
        total = ZERO
        for person, rule in _eligible():
            base, detail = base_of(person, rule, first, last)
            reached = base >= rule.goal
            amount = _money(base * rule.rate) if reached and base > 0 else ZERO
            detail = {
                **{k: str(v) if isinstance(v, Decimal) else v for k, v in detail.items()},
                "reached_goal": reached,
            }
            CommissionLine.objects.create(
                company_id=run.company_id,
                run=run,
                user=person,
                rule=rule,
                base_amount=base,
                rate=rule.rate,
                goal=rule.goal,
                amount=amount,
                detail=detail,
            )
            total += amount
        run.total = total
        run.computed_at = timezone.now()
        run.computed_by = user
        run.save(update_fields=["total", "computed_at", "computed_by", "updated_at"])
    return run


def _personnel_category():
    from apps.expenses.models import ExpenseCategory, Kind

    categories = ExpenseCategory.objects.filter(
        kind=Kind.EXPENSE,
        is_active=True,
        nature=ExpenseCategory.Nature.OPERATING,
        dgii_type="01",
    ).select_related("account")
    return min(categories, key=lambda c: c.account.code, default=None)


def approve(*, run: CommissionRun, user: User) -> CommissionRun:
    """The month is over and the figures are final: one payable per person."""
    from apps.expenses import payables
    from apps.expenses.services import ExpenseError
    from apps.ledger.accounting import month_bounds

    if not authz.has_any_role(user, *CALCULATORS):
        raise CommissionError("Las comisiones las aprueban el gerente y contabilidad.", "forbidden")
    _, last = month_bounds(run.year, run.month)
    if last >= timezone.localdate():
        raise CommissionError("Se aprueban cuando el mes termina.", "month")
    category = _personnel_category()
    with transaction.atomic():
        run = CommissionRun.objects.select_for_update().get(pk=run.pk)
        if run.status != CommissionRun.Status.DRAFT:
            raise CommissionError("Ese mes ya está aprobado.", "approved")
        lines = list(run.lines.filter(amount__gt=0).select_related("user"))
        if lines and category is None:
            raise CommissionError(
                "Falta una categoría de gasto de personal (tipo 01) para registrar las comisiones.",
                "category",
            )
        label = f"{MONTHS[run.month - 1]} {run.year}"
        for line in lines:
            membership = Membership.objects.filter(user=line.user).first()
            try:
                created = payables.create(
                    user=user,
                    branch=membership.branch,
                    category=category,
                    party_name=line.user.get_full_name() or line.user.email,
                    description=f"Comisión de {label}",
                    amount=line.amount,
                    invoice_on=last,
                    due_on=max(last, timezone.localdate()),
                )
            except ExpenseError as exc:
                raise CommissionError(str(exc), exc.code) from exc
            line.payable = created[0]
            line.save(update_fields=["payable", "updated_at"])
        run.status = CommissionRun.Status.APPROVED
        run.approved_at = timezone.now()
        run.approved_by = user
        run.save(update_fields=["status", "approved_at", "approved_by", "updated_at"])
        record_event(
            company_id=run.company_id,
            type="commissions.approved",
            target=run,
            actor=user,
            summary=f"Comisiones de {label} aprobadas: RD$ {run.total:,.2f}",
        )
    return run


def is_settled(year: int, month: int) -> tuple[bool, str]:
    """Month-end checklist: with active rules, the month's run is approved."""
    if not CommissionRule.objects.filter(is_active=True).exists():
        return True, "Sin reglas de comisión activas."
    run = CommissionRun.objects.filter(year=year, month=month).first()
    if run is None:
        return False, "Calcula y aprueba las comisiones del mes."
    if run.status != CommissionRun.Status.APPROVED:
        return False, "Las comisiones del mes están en borrador: apruébalas."
    return True, f"Aprobadas: RD$ {run.total:,.2f}."
