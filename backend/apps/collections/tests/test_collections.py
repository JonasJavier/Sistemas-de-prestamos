"""Phase 5 · F8 steps 3-6: actions, promises, the agenda, escalation and the
collection agent (decisions 076-079)."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.collections.models import CollectionTask, EscalationRule, PaymentPromise, RouteStop
from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.lending.models import Loan
from apps.notifications.models import Notification
from apps.payments.reversals import execute_reversal
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import books_square, make_loan, pay

D = Decimal


def today() -> dt.date:
    return timezone.localdate()


def gestion(tenant, loan, role="oficial", **data):
    body = {"kind": "call", "result": "promised", "note": "", **data}
    for key, value in list(body.items()):
        if isinstance(value, dt.date):
            body[key] = value.isoformat()
    return tenant.client(role).post(
        f"/api/v1/prestamos/{loan.number}/gestiones/", body, format="json"
    )


def nightly(tenant, day=None):
    with company_context(tenant.company.id):
        return run_nightly(tenant.company.id, day or today())


def test_a_promise_is_kept_by_the_payments_that_reach_it(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    response = gestion(
        tenant, loan, promise_on=today() + dt.timedelta(days=2), promise_amount="500"
    )
    assert response.status_code == 201, response.content
    with company_context(tenant.company.id):
        promise = PaymentPromise.objects.get(loan=loan)
        assert promise.status == PaymentPromise.Status.PENDING
    pay(tenant, loan, "300")
    with company_context(tenant.company.id):
        promise.refresh_from_db()
        assert promise.status == PaymentPromise.Status.PENDING  # 300 of 500
    second = pay(tenant, loan, "200")
    with company_context(tenant.company.id):
        promise.refresh_from_db()
        assert (promise.status, promise.paid) == (PaymentPromise.Status.KEPT, D("500.00"))
        # Reversing the payment that kept it makes it pending again: its day has not come.
        reason = Reason.objects.filter(kind=Reason.Kind.REVERSAL).first()
        execute_reversal(
            payment=second,
            requested_by=tenant.users["cajero"],
            authorized_by=tenant.users["supervisor"],
            reason=reason,
            note="Error de digitación",
        )
        promise.refresh_from_db()
        assert promise.status == PaymentPromise.Status.PENDING
    books_square(tenant)


def test_a_promise_not_kept_by_its_day_is_broken_and_followed_up(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=loan.pk).update(collector=tenant.users["cobrador"])
    gestion(tenant, loan, promise_on=today(), promise_amount="350")
    pay(tenant, loan, "100")
    with company_context(tenant.company.id):  # its day was yesterday
        PaymentPromise.objects.filter(loan=loan).update(promised_on=today() - dt.timedelta(days=1))
    nightly(tenant)
    with company_context(tenant.company.id):
        promise = PaymentPromise.objects.get(loan=loan)
        # The 100 came after the (moved) promised day, so it does not count.
        assert (promise.status, promise.paid) == (PaymentPromise.Status.BROKEN, D("0.00"))
        task = CollectionTask.objects.get(kind=CollectionTask.Kind.BROKEN_PROMISE)
        assert task.assigned_to == tenant.users["cobrador"]  # the agent: here, the collector
        assert Notification.objects.filter(
            kind="promises_broken", user=tenant.users["cobrador"]
        ).exists()
    # The collector's next call answers the follow-up of the broken promise.
    response = gestion(tenant, loan, role="cobrador", result="no_answer")
    assert response.status_code == 201, response.content
    with company_context(tenant.company.id):
        task.refresh_from_db()
        assert task.status == CollectionTask.Status.DONE


def test_a_new_promise_replaces_the_pending_one_and_bad_ones_are_refused(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    assert gestion(tenant, loan, promise_on=today(), promise_amount="100").status_code == 201
    assert (
        gestion(
            tenant, loan, promise_on=today() + dt.timedelta(days=3), promise_amount="200"
        ).status_code
        == 201
    )
    with company_context(tenant.company.id):
        statuses = sorted(PaymentPromise.objects.values_list("status", flat=True))
        assert statuses == ["cancelled", "pending"]
    past = gestion(tenant, loan, promise_on=today() - dt.timedelta(days=1), promise_amount="10")
    assert past.status_code == 400
    far = gestion(tenant, loan, promise_on=today() + dt.timedelta(days=31), promise_amount="10")
    assert "30 días" in far.json()["detail"]
    too_much = gestion(tenant, loan, promise_on=today(), promise_amount="99999")
    assert "más de lo que debe" in too_much.json()["detail"]
    missing = gestion(tenant, loan)
    assert missing.status_code == 400
    # The cashier does not manage collections; a collector, only his portfolio.
    assert gestion(tenant, loan, role="cajero", result="no_answer").status_code == 403
    assert gestion(tenant, loan, role="cobrador", result="no_answer").status_code in (403, 404)


def test_follow_ups_fill_the_agenda_and_only_their_owner_closes_them(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    response = gestion(
        tenant,
        loan,
        result="contacted",
        note="Pide que llamemos el viernes",
        follow_up_on=today(),
    )
    assert response.status_code == 201, response.content
    agenda = tenant.client("oficial").get("/api/v1/agenda/").json()
    assert [t["loan"]["number"] for t in agenda["tasks"]] == [loan.number]
    task_id = agenda["tasks"][0]["id"]
    # Another officer cannot close it; the supervisor sees the branch's agenda.
    other = tenant.client("supervisor").post(f"/api/v1/seguimientos/{task_id}/hecho/", {})
    assert other.status_code == 403
    branch = tenant.client("supervisor").get("/api/v1/agenda/?alcance=sucursal").json()
    assert branch["scope"] == "branch" and len(branch["tasks"]) == 1
    later = (today() + dt.timedelta(days=2)).isoformat()
    moved = tenant.client("oficial").post(
        f"/api/v1/seguimientos/{task_id}/reprogramar/", {"due_on": later}, format="json"
    )
    assert moved.json()["due_on"] == later
    assert tenant.client("oficial").get("/api/v1/agenda/").json()["tasks"] == []
    done = tenant.client("oficial").post(
        f"/api/v1/seguimientos/{task_id}/hecho/", {"note": "Llamado"}, format="json"
    )
    assert done.json()["status"] == "done"
    assert tenant.client("cajero").get("/api/v1/agenda/").status_code == 403


def test_escalation_fires_once_per_episode_and_closes_when_cured(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-62)  # 62 days late: review and intimation
    nightly(tenant)
    with company_context(tenant.company.id):
        tasks = CollectionTask.objects.filter(kind=CollectionTask.Kind.ESCALATION)
        assert sorted(tasks.values_list("rule__action", flat=True)) == ["intimation", "review"]
        assert set(tasks.values_list("assigned_role", flat=True)) == {"Supervisor", "Gerente"}
        assert Notification.objects.filter(
            kind="escalation", user=tenant.users["supervisor"]
        ).exists()
    nightly(tenant)  # the next night does not repeat them
    with company_context(tenant.company.id):
        assert CollectionTask.objects.filter(kind=CollectionTask.Kind.ESCALATION).count() == 2
    # The supervisor acts on the review; the intimation is the manager's.
    supervisor_agenda = tenant.client("supervisor").get("/api/v1/agenda/").json()
    review = next(t for t in supervisor_agenda["tasks"] if t["action_label"] == "Revisar el caso")
    assert review["can_act"] is True
    refused = tenant.client("supervisor").post(f"/api/v1/seguimientos/{review['id']}/hecho/", {})
    assert refused.status_code == 400  # an escalation needs the decision written
    done = tenant.client("supervisor").post(
        f"/api/v1/seguimientos/{review['id']}/hecho/",
        {"note": "Llamé al garante"},
        format="json",
    )
    assert done.status_code == 200
    # Paying everything due closes the loan: the open escalation is cancelled.
    with company_context(tenant.company.id):
        from apps.payments import portfolio

        owed = portfolio.summarize(portfolio.position(loan, today()), today()).total_owed
    pay(tenant, loan, str(owed))
    nightly(tenant)
    with company_context(tenant.company.id):
        assert not CollectionTask.objects.filter(status=CollectionTask.Status.OPEN).exists()


def test_the_rules_are_edited_in_order_by_the_manager(tenant) -> None:
    rules = tenant.client("gerente").get("/api/v1/reglas-escalamiento/").json()
    assert [r["min_days"] for r in rules] == [31, 61, 91]
    by_action = {r["action"]: r["id"] for r in rules}
    ok = tenant.client("gerente").patch(
        "/api/v1/reglas-escalamiento/",
        [
            {"id": by_action["review"], "min_days": 15},
            {"id": by_action["legal"], "is_active": False},
        ],
        format="json",
    )
    assert ok.status_code == 200, ok.content
    assert [r["min_days"] for r in ok.json()] == [15, 61, 91]
    wrong = tenant.client("gerente").patch(
        "/api/v1/reglas-escalamiento/",
        [{"id": by_action["intimation"], "min_days": 120}],
        format="json",
    )
    assert wrong.status_code == 400
    assert tenant.client("supervisor").get("/api/v1/reglas-escalamiento/").status_code == 200
    assert (
        tenant.client("supervisor")
        .patch("/api/v1/reglas-escalamiento/", [], format="json")
        .status_code
        == 403
    )
    with company_context(tenant.company.id):
        assert EscalationRule.objects.get(action="legal").is_active is False


def test_the_agent_gets_the_tray_and_the_history_keeps_the_change(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    nightly(tenant)  # the tray reads the refreshed days past due
    agents = tenant.client("supervisor").get("/api/v1/gestores/").json()
    officer = next(a for a in agents if "Oficial de crédito" in a["roles"])
    refused = tenant.client("oficial").post(
        "/api/v1/gestores/asignar/", {"loans": [loan.number], "agent": officer["id"]}, format="json"
    )
    assert refused.status_code == 403
    assigned = tenant.client("supervisor").post(
        "/api/v1/gestores/asignar/",
        {"loans": [loan.number], "agent": officer["id"], "note": "Telecobranza"},
        format="json",
    )
    assert assigned.json() == {"changed": 1}
    tray = tenant.client("oficial").get("/api/v1/atrasos/?tramo=8_30&gestor=mios").json()
    assert [row["number"] for row in tray["results"]] == [loan.number]
    assert tray["results"][0]["agent_name"]
    with company_context(tenant.company.id):
        loan.refresh_from_db()
        assert loan.agent == tenant.users["oficial"]
        assert loan.agent_history.get().note == "Telecobranza"
    # A promise shows in the tray and filters it.
    gestion(tenant, loan, promise_on=today() + dt.timedelta(days=1), promise_amount="100")
    with_promise = tenant.client("oficial").get("/api/v1/atrasos/?tramo=8_30&promesa=con").json()
    assert with_promise["results"][0]["promise"]["amount"] == "100.00"
    assert (
        tenant.client("oficial").get("/api/v1/atrasos/?tramo=8_30&promesa=sin").json()["results"]
        == []
    )


def test_a_promise_for_today_puts_the_loan_on_the_route(tenant) -> None:
    loan = make_loan(tenant, first_due_in=5)  # nothing overdue nor due today
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=loan.pk).update(collector=tenant.users["cobrador"])
    gestion(tenant, loan, promise_on=today(), promise_amount="150")
    with company_context(tenant.company.id):
        from apps.collections.services import build_route

        stops = build_route(tenant.users["cobrador"], today())
        assert [(s.loan_id, s.reason, s.amount_due) for s in stops] == [
            (loan.id, RouteStop.Reason.PROMISE, D("150.00"))
        ]


def test_collections_never_cross_companies(tenant, other_tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    gestion(tenant, loan, promise_on=today(), promise_amount="100")
    with company_context(tenant.company.id):
        promise = PaymentPromise.objects.get(loan=loan)
    outsider = other_tenant.client("gerente")
    assert outsider.get(f"/api/v1/prestamos/{loan.number}/cobranza/").status_code == 404
    assert (
        outsider.post(
            f"/api/v1/promesas/{promise.id}/cancelar/", {"note": "x"}, format="json"
        ).status_code
        == 404
    )
    assert outsider.get("/api/v1/agenda/?alcance=sucursal").json()["promises_today"] == []
    timeline = tenant.client("gerente").get(f"/api/v1/prestamos/{loan.number}/cobranza/").json()
    assert timeline["pending_promise"]["amount"] == "100.00"
    customer = tenant.client("gerente").get(f"/api/v1/clientes/{loan.customer_id}/cobranza/").json()
    assert customer["promises"][0]["loan_number"] == loan.number
    cancelled = tenant.client("oficial").post(
        f"/api/v1/promesas/{promise.id}/cancelar/", {"note": "Se equivocó de fecha"}, format="json"
    )
    assert cancelled.json()["status"] == "cancelled"
