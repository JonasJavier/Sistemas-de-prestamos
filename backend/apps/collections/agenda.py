"""F8 steps 3, 5 and 6: actions with their promise and follow-up, the agenda
(P44), escalation and the collection agent (decisions 076-079).
"""

import datetime as dt
from collections import defaultdict
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Max, Q, QuerySet
from django.utils import timezone

from apps.accounts import authz
from apps.accounts.models import Membership, User
from apps.audit.models import record_event
from apps.collections.models import (
    AgentAssignment,
    CollectionAction,
    CollectionTask,
    DelinquencySnapshot,
    EscalationRule,
    PaymentPromise,
    RouteStop,
)
from apps.collections.promises import (
    MANAGE_ROLES,
    PromiseError,
    agent_of,
    check_can_manage,
    make_promise,
)
from apps.core.text import plural
from apps.lending.models import Loan
from apps.notifications.models import Notification
from apps.notifications.services import notify

FOLLOW_UP_MAX_DAYS = 60
ASSIGN_ROLES = (authz.GERENTE, authz.SUPERVISOR)
AGENT_ROLES = MANAGE_ROLES


# --- Actions (P42) -----------------------------------------------------------------------------


@transaction.atomic
def record_action(
    *,
    loan: Loan,
    user: User,
    kind: str,
    result: str,
    note: str = "",
    promise_on: dt.date | None = None,
    promise_amount: Decimal | None = None,
    follow_up_on: dt.date | None = None,
    latitude: Decimal | None = None,
    longitude: Decimal | None = None,
) -> CollectionAction:
    """A call, visit or message, with its promise or next follow-up (F8 step 3)."""
    check_can_manage(user, loan)
    if result not in CollectionAction.Result.values or result == CollectionAction.Result.PAID:
        raise PromiseError("Elige el resultado de la gestión.", "result")
    if kind not in CollectionAction.Kind.values:
        raise PromiseError("Elige el tipo de gestión.", "kind")
    promised = result == CollectionAction.Result.PROMISED
    if promised and (promise_on is None or promise_amount is None):
        raise PromiseError("Indica la fecha y el monto que promete.", "promise")
    if not promised and (promise_on is not None or promise_amount is not None):
        raise PromiseError("Una promesa va con el resultado «Prometió pagar».", "result")
    if result == CollectionAction.Result.OTHER and not note.strip():
        raise PromiseError("Escribe una nota con el detalle.", "note")
    today = timezone.localdate()
    if follow_up_on is not None and not (
        today <= follow_up_on <= today + dt.timedelta(days=FOLLOW_UP_MAX_DAYS)
    ):
        raise PromiseError(f"El seguimiento va de hoy a {FOLLOW_UP_MAX_DAYS} días.", "follow_up_on")
    action = CollectionAction.objects.create(
        company_id=loan.company_id,
        loan=loan,
        customer_id=loan.customer_id,
        user=user,
        kind=kind,
        result=result,
        note=note.strip(),
        latitude=latitude,
        longitude=longitude,
    )
    if promised:
        make_promise(
            loan=loan, user=user, promised_on=promise_on, amount=promise_amount, action=action
        )
    RouteStop.objects.filter(collector=user, date=today, loan=loan, visited_at__isnull=True).update(
        visited_at=timezone.now(), action=action
    )
    # The action answers this person's pending follow-ups of the loan.
    CollectionTask.objects.filter(
        loan=loan,
        assigned_to=user,
        status=CollectionTask.Status.OPEN,
        due_on__lte=today,
        kind__in=[CollectionTask.Kind.FOLLOW_UP, CollectionTask.Kind.BROKEN_PROMISE],
    ).update(
        status=CollectionTask.Status.DONE,
        done_at=timezone.now(),
        done_by=user,
        done_note=f"{action.get_kind_display()}: {action.get_result_display()}",
        updated_at=timezone.now(),
    )
    if follow_up_on is not None:
        CollectionTask.objects.create(
            company_id=loan.company_id,
            loan=loan,
            kind=CollectionTask.Kind.FOLLOW_UP,
            due_on=follow_up_on,
            assigned_to=user,
            note=note.strip()[:500],
            created_by=user,
        )
    record_event(
        company_id=loan.company_id,
        type="collection.action",
        target=loan,
        actor=user,
        summary=f"{action.get_kind_display()}: {action.get_result_display()}"
        + (f" · {action.note}" if action.note else ""),
    )
    return action


# --- Follow-ups --------------------------------------------------------------------------------


def can_act(user: User, task: CollectionTask) -> bool:
    """The assignee, whoever holds the assigned role in the branch, or the manager."""
    if task.assigned_to_id == user.pk:
        return True
    roles = authz.role_names(user)
    if authz.GERENTE in roles and authz.in_scope(user, task.loan.branch_id):
        return True
    return (
        bool(task.assigned_role)
        and task.assigned_role in roles
        and (authz.in_scope(user, task.loan.branch_id))
    )


@transaction.atomic
def create_follow_up(
    *, loan: Loan, user: User, due_on: dt.date, note: str, assigned_to: User | None = None
) -> CollectionTask:
    check_can_manage(user, loan)
    today = timezone.localdate()
    if not today <= due_on <= today + dt.timedelta(days=FOLLOW_UP_MAX_DAYS):
        raise PromiseError(f"El seguimiento va de hoy a {FOLLOW_UP_MAX_DAYS} días.", "due_on")
    if not note.strip():
        raise PromiseError("Escribe qué hay que hacer.", "note")
    owner = assigned_to or user
    if owner.pk != user.pk:
        if not authz.has_any_role(user, *ASSIGN_ROLES):
            raise PromiseError("Solo el supervisor o el gerente asignan seguimientos.", "forbidden")
        check_can_manage(owner, loan)
    return CollectionTask.objects.create(
        company_id=loan.company_id,
        loan=loan,
        kind=CollectionTask.Kind.FOLLOW_UP,
        due_on=due_on,
        assigned_to=owner,
        note=note.strip()[:500],
        created_by=user,
    )


def _locked_open(task: CollectionTask, user: User) -> CollectionTask:
    task = CollectionTask.objects.select_for_update().select_related("loan").get(pk=task.pk)
    if task.status != CollectionTask.Status.OPEN:
        raise PromiseError("Ese seguimiento ya se cerró.", "state")
    if not can_act(user, task):
        raise PromiseError("Ese seguimiento es de otra persona.", "forbidden")
    return task


@transaction.atomic
def complete(*, task: CollectionTask, user: User, note: str = "") -> CollectionTask:
    task = _locked_open(task, user)
    if task.kind == CollectionTask.Kind.ESCALATION and not note.strip():
        raise PromiseError("Escribe qué se decidió.", "note")
    task.status = CollectionTask.Status.DONE
    task.done_at = timezone.now()
    task.done_by = user
    task.done_note = note.strip()[:500]
    task.save(update_fields=["status", "done_at", "done_by", "done_note", "updated_at"])
    record_event(
        company_id=task.company_id,
        type="collection.task_done",
        target=task.loan,
        actor=user,
        summary=f"{task.get_kind_display()} hecho"
        + (f": {task.done_note}" if task.done_note else ""),
    )
    return task


@transaction.atomic
def reschedule(*, task: CollectionTask, user: User, due_on: dt.date) -> CollectionTask:
    task = _locked_open(task, user)
    today = timezone.localdate()
    if not today <= due_on <= today + dt.timedelta(days=FOLLOW_UP_MAX_DAYS):
        raise PromiseError(f"El seguimiento va de hoy a {FOLLOW_UP_MAX_DAYS} días.", "due_on")
    task.due_on = due_on
    task.save(update_fields=["due_on", "updated_at"])
    return task


# --- The agenda (P44) --------------------------------------------------------------------------


def _scoped(queryset: QuerySet, user: User, *, mine: bool, field: str = "loan__") -> QuerySet:
    """Loans the user may see; «mine» narrows to those he manages."""
    from apps.customers.access import only_collector

    if mine or only_collector(user):
        return queryset.filter(
            Q(**{f"{field}agent": user})
            | Q(**{f"{field}agent__isnull": True, f"{field}collector": user})
        )
    scope = authz.branch_scope(user)
    if scope is None:
        return queryset
    return queryset.filter(**{f"{field}branch_id__in": scope})


def tasks_for(user: User, *, mine: bool) -> QuerySet:
    """Open follow-ups: mine, my roles' escalations in my branches, or (G/Su)
    the whole branch."""
    roles = authz.role_names(user)
    scope = authz.branch_scope(user)
    in_branch = Q() if scope is None else Q(loan__branch_id__in=scope)
    mine_q = Q(assigned_to=user) | (Q(assigned_role__in=roles) & in_branch)
    base = CollectionTask.objects.filter(status=CollectionTask.Status.OPEN)
    if mine or not authz.has_any_role(user, *ASSIGN_ROLES):
        return base.filter(mine_q)
    return base.filter(in_branch)


def promises_for(user: User, *, mine: bool) -> QuerySet:
    base = PaymentPromise.objects.all()
    scoped = _scoped(base, user, mine=mine)
    if mine:
        scoped = scoped | base.filter(created_by=user)
    return scoped


# --- Escalation (F8 step 5) --------------------------------------------------------------------


def _holders(role: str, branch_id) -> list[User]:
    memberships = Membership.objects.filter(role__name=role, user__is_active=True).select_related(
        "user"
    )
    if role != authz.GERENTE:
        memberships = memberships.filter(branch_id=branch_id)
    return list({m.user_id: m.user for m in memberships}.values())


def run_escalation(today: dt.date) -> int:
    """Nightly, after the portfolio refresh: one task per rule and delinquency
    episode; a summary notice to whoever must act. Returns the tasks created."""
    rules = list(EscalationRule.objects.filter(is_active=True).order_by("min_days"))
    if not rules:
        return 0
    lowest = rules[0].min_days
    loans = list(
        Loan.objects.filter(status=Loan.Status.ACTIVE, days_past_due__gte=lowest).only(
            "id", "company_id", "branch_id", "number", "days_past_due", "disbursed_on"
        )
    )
    if not loans:
        return 0
    # The episode starts the day after the loan was last current.
    last_current = dict(
        DelinquencySnapshot.objects.filter(loan__in=loans, days_past_due=0)
        .values("loan_id")
        .annotate(last=Max("date"))
        .values_list("loan_id", "last")
    )
    created = 0
    summary: dict[tuple[str, object], list[str]] = defaultdict(list)
    for loan in loans:
        start = last_current.get(loan.id) or loan.disbursed_on
        episode = start + dt.timedelta(days=1)
        for rule in rules:
            if loan.days_past_due < rule.min_days:
                break
            try:
                with transaction.atomic():
                    CollectionTask.objects.create(
                        company_id=loan.company_id,
                        loan=loan,
                        kind=CollectionTask.Kind.ESCALATION,
                        due_on=today,
                        assigned_role=rule.role,
                        rule=rule,
                        episode_start=episode,
                        note=f"{rule.get_action_display()}: {loan.days_past_due} días de atraso.",
                    )
            except IntegrityError:  # already escalated in this episode
                continue
            created += 1
            summary[(rule.role, loan.branch_id)].append(loan.number)
    for (role, branch_id), numbers in summary.items():
        notify(
            company_id=loans[0].company_id,
            users=_holders(role, branch_id),
            kind=Notification.Kind.ESCALATION,
            text=(
                plural(len(numbers), "préstamo escalado", "préstamos escalados")
                + f" a {role.lower()}: "
                + ", ".join(numbers[:5])
                + ("…" if len(numbers) > 5 else "")
            ),
            link="/cobranza",
        )
    return created


def close_cured(today: dt.date) -> int:
    """Escalations of loans that got current or closed are no longer due."""
    now = timezone.now()
    cured = CollectionTask.objects.filter(status=CollectionTask.Status.OPEN).filter(
        Q(loan__status__in=[s for s in Loan.Status.values if s != Loan.Status.ACTIVE])
        | Q(kind=CollectionTask.Kind.ESCALATION, loan__days_past_due=0)
    )
    return cured.update(
        status=CollectionTask.Status.CANCELLED,
        done_at=now,
        done_note="El préstamo se puso al día o se cerró",
        updated_at=now,
    )


# --- The collection agent (F8 step 6) ----------------------------------------------------------


def agents_of(branch_id) -> list[User]:
    return list(
        {
            m.user_id: m.user
            for m in Membership.objects.filter(
                role__name__in=AGENT_ROLES, branch_id=branch_id, user__is_active=True
            ).select_related("user")
        }.values()
    )


@transaction.atomic
def assign_agent(*, loans: list[Loan], agent: User | None, user: User, note: str = "") -> int:
    """«Asignar la cartera a gestores» (G, Su), kept in the history."""
    if not authz.has_any_role(user, *ASSIGN_ROLES):
        raise PromiseError("Solo el supervisor o el gerente asignan gestores.", "forbidden")
    today = timezone.localdate()
    changed = 0
    for loan in Loan.objects.select_for_update().filter(pk__in=[loan.pk for loan in loans]):
        if not authz.in_scope(user, loan.branch_id):
            raise PromiseError(f"{loan.number} es de otra sucursal.", "out_of_scope")
        if loan.status != Loan.Status.ACTIVE:
            raise PromiseError(f"{loan.number} no está activo.", "state")
        if (
            agent is not None
            and not Membership.objects.filter(
                user=agent, role__name__in=AGENT_ROLES, branch_id=loan.branch_id
            ).exists()
            and not Membership.objects.filter(user=agent, role__name=authz.GERENTE).exists()
        ):
            raise PromiseError("Ese usuario no gestiona cobros en la sucursal del préstamo.")
        if loan.agent_id == (agent.pk if agent else None):
            continue
        AgentAssignment.objects.filter(loan=loan, until__isnull=True).update(until=today)
        AgentAssignment.objects.create(
            company_id=loan.company_id,
            loan=loan,
            agent=agent,
            since=today,
            note=note[:300],
            assigned_by=user,
        )
        loan.agent = agent
        loan.save(update_fields=["agent", "updated_at"])
        record_event(
            company_id=loan.company_id,
            type="loan.agent_changed",
            target=loan,
            actor=user,
            summary=f"Gestor: {agent.get_full_name() or agent.email}"
            if agent
            else "Gestor: el cobrador",
        )
        changed += 1
    return changed


__all__ = [
    "agent_of",
    "agents_of",
    "assign_agent",
    "close_cured",
    "complete",
    "create_follow_up",
    "promises_for",
    "record_action",
    "reschedule",
    "run_escalation",
    "tasks_for",
]
