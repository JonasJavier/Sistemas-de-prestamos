"""Phase 5 (F8 steps 3-6): the agenda (P44), promises, follow-ups, the
collection agent and the escalation rules (decisions 076-079)."""

import datetime as dt

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import authz
from apps.accounts.api.permissions import role_required
from apps.accounts.models import User
from apps.collections import agenda, promises
from apps.collections.models import (
    CollectionAction,
    CollectionTask,
    EscalationRule,
    PaymentPromise,
)
from apps.collections.services import CollectionsError
from apps.core.api.errors import fail, person
from apps.core.api.permissions import CompanyNotSuspendedOrReadOnly
from apps.customers.access import scope_customers, scope_loans
from apps.customers.models import Customer
from apps.lending.models import Loan

G, A, SU, OF, CO = (
    authz.GERENTE,
    authz.ADMINISTRADOR,
    authz.SUPERVISOR,
    authz.OFICIAL,
    authz.COBRADOR,
)
CanManage = role_required(G, SU, OF, CO, read_any=False)
CanAssign = role_required(G, SU, read_any=False)
CanEditRules = role_required(G, A, read_any=False, read_roles=(SU,))
UPCOMING_DAYS = 7
BROKEN_DAYS = 7


def _loan_brief(loan: Loan) -> dict:
    customer = loan.customer
    return {
        "number": loan.number,
        "customer_id": str(customer.id),
        "customer_name": customer.display_name,
        "phone": customer.phone,
        "branch_name": loan.branch.name,
        "days_past_due": loan.days_past_due,
        "principal_outstanding": str(loan.principal_outstanding),
        "agent_name": person(loan.agent or loan.collector),
    }


def _promise_payload(promise: PaymentPromise, *, with_loan: bool = False) -> dict:
    data = {
        "id": str(promise.id),
        "promised_on": promise.promised_on,
        "amount": str(promise.amount),
        "status": promise.status,
        "status_label": promise.get_status_display(),
        "paid": str(promise.paid),
        "note": promise.note,
        "created_at": promise.created_at,
        "created_by_name": person(promise.created_by),
        "resolved_at": promise.resolved_at,
    }
    if with_loan:
        data["loan"] = _loan_brief(promise.loan)
    return data


def _task_payload(task: CollectionTask, user: User, *, with_loan: bool = False) -> dict:
    data = {
        "id": str(task.id),
        "kind": task.kind,
        "kind_label": task.get_kind_display(),
        "action_label": task.rule.get_action_display() if task.rule_id else None,
        "status": task.status,
        "due_on": task.due_on,
        "note": task.note,
        "assigned_name": person(task.assigned_to) if task.assigned_to_id else task.assigned_role,
        "done_at": task.done_at,
        "done_by_name": person(task.done_by) if task.done_by_id else None,
        "done_note": task.done_note,
        "can_act": task.status == CollectionTask.Status.OPEN and agenda.can_act(user, task),
    }
    if with_loan:
        data["loan"] = _loan_brief(task.loan)
    return data


def _action_payload(action: CollectionAction) -> dict:
    return {
        "id": str(action.id),
        "kind": action.kind,
        "kind_label": action.get_kind_display(),
        "result": action.result,
        "result_label": action.get_result_display(),
        "note": action.note,
        "user_name": person(action.user),
        "created_at": action.created_at,
        "loan_number": action.loan.number,
    }


LOAN_RELATED = (
    "loan__customer",
    "loan__branch",
    "loan__agent",
    "loan__collector",
)


class AgendaView(APIView):
    """P44: today's promises and follow-ups, the broken ones and what comes."""

    permission_classes = [CanManage]

    def get(self, request: Request) -> Response:
        user = request.user
        today = timezone.localdate()
        supervises = authz.has_any_role(user, G, SU)
        mine = request.query_params.get("alcance") != "sucursal" or not supervises
        promises_qs = agenda.promises_for(user, mine=mine).select_related(
            *LOAN_RELATED, "created_by"
        )
        tasks_qs = agenda.tasks_for(user, mine=mine).select_related(
            *LOAN_RELATED, "assigned_to", "rule", "done_by"
        )
        horizon = today + dt.timedelta(days=UPCOMING_DAYS)
        pending = promises_qs.filter(status=PaymentPromise.Status.PENDING)
        today_promises = pending.filter(promised_on__lte=today).order_by("promised_on")
        broken = promises_qs.filter(
            status=PaymentPromise.Status.BROKEN,
            resolved_at__date__gte=today - dt.timedelta(days=BROKEN_DAYS),
        ).order_by("-resolved_at")
        month_start = today.replace(day=1)
        resolved = promises_qs.filter(resolved_at__date__gte=month_start)
        kept = resolved.filter(status=PaymentPromise.Status.KEPT).count()
        failed = resolved.filter(status=PaymentPromise.Status.BROKEN).count()
        return Response(
            {
                "today": today,
                "scope": "mine" if mine else "branch",
                "can_switch": supervises,
                "promises_today": [
                    _promise_payload(p, with_loan=True) for p in today_promises[:200]
                ],
                "tasks": [
                    _task_payload(t, user, with_loan=True)
                    for t in tasks_qs.filter(due_on__lte=today).order_by("due_on", "created_at")[
                        :200
                    ]
                ],
                "broken": [_promise_payload(p, with_loan=True) for p in broken[:100]],
                "upcoming": {
                    "promises": [
                        _promise_payload(p, with_loan=True)
                        for p in pending.filter(
                            promised_on__gt=today, promised_on__lte=horizon
                        ).order_by("promised_on")[:200]
                    ],
                    "tasks": [
                        _task_payload(t, user, with_loan=True)
                        for t in tasks_qs.filter(due_on__gt=today, due_on__lte=horizon).order_by(
                            "due_on"
                        )[:200]
                    ],
                },
                "month": {
                    "kept": kept,
                    "broken": failed,
                    "rate": None if kept + failed == 0 else round(kept / (kept + failed), 4),
                },
            }
        )


class CancelPromiseSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=300)


class CancelPromiseView(APIView):
    permission_classes = [CanManage, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request, pk) -> Response:
        promise = get_object_or_404(
            PaymentPromise.objects.filter(
                loan__in=scope_loans(Loan.objects.all(), request.user)
            ).select_related("loan"),
            pk=pk,
        )
        serializer = CancelPromiseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            promise = promises.cancel(
                promise=promise, user=request.user, note=serializer.validated_data["note"]
            )
        except CollectionsError as exc:
            return fail(exc)
        return Response(_promise_payload(promise))


class FollowUpSerializer(serializers.Serializer):
    loan = serializers.CharField(max_length=30)
    due_on = serializers.DateField()
    note = serializers.CharField(max_length=500)
    assigned_to = serializers.UUIDField(required=False, allow_null=True)


class FollowUpView(APIView):
    """Schedule a follow-up for myself or (G/Su) for someone of the branch."""

    permission_classes = [CanManage, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        serializer = FollowUpSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        loan = get_object_or_404(scope_loans(Loan.objects.all(), request.user), number=data["loan"])
        owner = None
        if data.get("assigned_to"):
            owner = get_object_or_404(User, pk=data["assigned_to"], company_id=loan.company_id)
        try:
            task = agenda.create_follow_up(
                loan=loan,
                user=request.user,
                due_on=data["due_on"],
                note=data["note"],
                assigned_to=owner,
            )
        except CollectionsError as exc:
            return fail(exc)
        return Response(_task_payload(task, request.user), status=status.HTTP_201_CREATED)


class TaskActionSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")
    due_on = serializers.DateField(required=False)


class TaskActionView(APIView):
    """Close (hecho) or reschedule (reprogramar) a follow-up."""

    permission_classes = [CanManage, CompanyNotSuspendedOrReadOnly]
    verb = "hecho"

    def post(self, request: Request, pk) -> Response:
        task = get_object_or_404(CollectionTask.objects.select_related("loan"), pk=pk)
        serializer = TaskActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            if self.verb == "reprogramar":
                if "due_on" not in data:
                    raise CollectionsError("Indica la nueva fecha.", "due_on")
                task = agenda.reschedule(task=task, user=request.user, due_on=data["due_on"])
            else:
                task = agenda.complete(task=task, user=request.user, note=data["note"])
        except CollectionsError as exc:
            return fail(exc)
        return Response(_task_payload(task, request.user))


class LoanTimelineView(APIView):
    """Everything collections did on a loan: actions, promises and follow-ups."""

    permission_classes = [
        role_required(G, SU, OF, CO, read_any=False, read_roles=(authz.AUDITORIA,))
    ]

    def get(self, request: Request, number: str) -> Response:
        loan = get_object_or_404(scope_loans(Loan.objects.all(), request.user), number=number)
        return Response(_timeline(Q(loan=loan), request.user))


class CustomerTimelineView(APIView):
    """The customer file shows the history of collection (F8 step 3)."""

    permission_classes = [
        role_required(G, SU, OF, CO, read_any=False, read_roles=(authz.AUDITORIA,))
    ]

    def get(self, request: Request, pk) -> Response:
        customer = get_object_or_404(scope_customers(Customer.objects.all(), request.user), pk=pk)
        loans = scope_loans(Loan.objects.filter(customer=customer), request.user)
        return Response(_timeline(Q(loan__in=loans), request.user))


def _timeline(where: Q, user: User) -> dict:
    actions = CollectionAction.objects.filter(where).select_related("user", "loan")
    promises_qs = PaymentPromise.objects.filter(where).select_related("created_by", "loan")
    tasks = CollectionTask.objects.filter(where).select_related(
        "assigned_to", "rule", "done_by", "loan"
    )
    pending = promises_qs.filter(status=PaymentPromise.Status.PENDING).first()
    return {
        "pending_promise": None if pending is None else _promise_payload(pending),
        "actions": [_action_payload(a) for a in actions.order_by("-created_at")[:100]],
        "promises": [
            {**_promise_payload(p), "loan_number": p.loan.number}
            for p in promises_qs.order_by("-created_at")[:50]
        ],
        "tasks": [
            {**_task_payload(t, user), "loan_number": t.loan.number}
            for t in tasks.order_by("status", "due_on")[:50]
        ],
    }


class AgentsView(APIView):
    """Who can manage collections in my branches (the assignment selector)."""

    permission_classes = [CanAssign]

    def get(self, request: Request) -> Response:
        scope = authz.branch_scope(request.user)
        from apps.accounts.models import Membership

        memberships = Membership.objects.filter(
            role__name__in=agenda.AGENT_ROLES, user__is_active=True
        ).select_related("user", "role")
        if scope is not None:
            memberships = memberships.filter(branch_id__in=scope)
        people: dict = {}
        for m in memberships:
            entry = people.setdefault(
                m.user_id, {"id": str(m.user_id), "name": person(m.user), "roles": set()}
            )
            entry["roles"].add(m.role.name)
        return Response(
            sorted(
                ({**p, "roles": sorted(p["roles"])} for p in people.values()),
                key=lambda p: p["name"] or "",
            )
        )


class AssignAgentSerializer(serializers.Serializer):
    loans = serializers.ListField(child=serializers.CharField(max_length=30), min_length=1)
    agent = serializers.UUIDField(allow_null=True)
    note = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class AssignAgentView(APIView):
    permission_classes = [CanAssign, CompanyNotSuspendedOrReadOnly]

    def post(self, request: Request) -> Response:
        serializer = AssignAgentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        loans = list(scope_loans(Loan.objects.filter(number__in=data["loans"]), request.user))
        if len(loans) != len(set(data["loans"])):
            return fail(CollectionsError("Algún préstamo no existe o es de otra sucursal."))
        agent = None
        if data["agent"]:
            agent = get_object_or_404(User, pk=data["agent"], company_id=request.user.company_id)
        try:
            changed = agenda.assign_agent(
                loans=loans, agent=agent, user=request.user, note=data["note"]
            )
        except CollectionsError as exc:
            return fail(exc)
        return Response({"changed": changed})


class EscalationRuleSerializer(serializers.ModelSerializer):
    action_label = serializers.CharField(source="get_action_display", read_only=True)

    class Meta:
        model = EscalationRule
        fields = ["id", "action", "action_label", "min_days", "role", "is_active"]
        read_only_fields = ["id", "action", "role"]

    def validate_min_days(self, value: int) -> int:
        if not 1 <= value <= 365:
            raise serializers.ValidationError("Entre 1 y 365 días de atraso.")
        return value


class EscalationRulesView(APIView):
    """The three rules of F8 step 5: their days and whether they are on."""

    permission_classes = [CanEditRules, CompanyNotSuspendedOrReadOnly]

    def get(self, request: Request) -> Response:
        rules = EscalationRule.objects.order_by("min_days")
        return Response(EscalationRuleSerializer(rules, many=True).data)

    def patch(self, request: Request) -> Response:
        rows = request.data if isinstance(request.data, list) else []
        rules = {str(r.id): r for r in EscalationRule.objects.all()}
        updated = []
        for row in rows:
            rule = rules.get(str(row.get("id")))
            if rule is None:
                return fail(CollectionsError("Esa regla no existe."))
            serializer = EscalationRuleSerializer(rule, data=row, partial=True)
            serializer.is_valid(raise_exception=True)
            updated.append(serializer)
        days = {
            s.instance.pk: s.validated_data.get("min_days", s.instance.min_days) for s in updated
        }
        ordered = [days.get(r.pk, r.min_days) for r in sorted(rules.values(), key=_order)]
        if ordered != sorted(ordered) or len(set(ordered)) != len(ordered):
            return fail(
                CollectionsError(
                    "Cada paso va con más días que el anterior: revisar, intimar, legal."
                )
            )
        for serializer in updated:
            serializer.save()
        return self.get(request)


ACTION_ORDER = [
    EscalationRule.Action.REVIEW,
    EscalationRule.Action.INTIMATION,
    EscalationRule.Action.LEGAL,
]


def _order(rule: EscalationRule) -> int:
    return ACTION_ORDER.index(rule.action)
