"""Phase 7 · P79: the access log, the nightly fraud review and the rules
the manager tunes (doc 06 §9, decision 090)."""

from allauth.account.models import EmailAddress
from rest_framework.test import APIClient

from apps.audit import fraud
from apps.audit.models import FraudAlert, FraudKind, LoginEvent
from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.notifications.models import Notification
from apps.payments.reversals import execute_reversal
from apps.payments.tests.test_payments import make_loan, pay

LOGIN = "/api/v1/auth/browser/v1/auth/login"
LAPTOP = "Mozilla/5.0 (Windows NT 10.0) Edge/141"
PHONE = "Mozilla/5.0 (Linux; Android 15) Chrome/141 Mobile"


def sign_in(user, agent: str) -> None:
    response = APIClient().post(
        LOGIN,
        {"email": user.email, "password": "una-clave-larga-123"},
        format="json",
        HTTP_USER_AGENT=agent,
    )
    assert response.status_code == 200, response.content


def test_sign_ins_record_new_devices_and_off_hours(tenant) -> None:
    manager = tenant.users["gerente2"]
    EmailAddress.objects.create(user=manager, email=manager.email, primary=True, verified=True)
    sign_in(manager, LAPTOP)  # the first ever: nothing to compare with
    sign_in(manager, LAPTOP)
    with company_context(tenant.company.id):
        tenant.branch.workdays = []  # no working day: every sign-in is off hours
        tenant.branch.save()
    sign_in(manager, PHONE)
    with company_context(tenant.company.id):
        events = list(LoginEvent.objects.filter(user=manager).order_by("at"))
        assert [e.new_device for e in events] == [False, False, True]
        assert events[2].outside_hours  # the first two depend on the clock
        alerts = fraud.review(tenant.company.id)
        kinds = {(a.kind, a.subject_id) for a in alerts}
        assert (FraudKind.NEW_DEVICE, manager.id) in kinds


def reverse(tenant, payment) -> None:
    with company_context(tenant.company.id):
        execute_reversal(
            payment=payment,
            requested_by=tenant.users["cajero"],
            authorized_by=tenant.users["supervisor"],
            reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
            note="Error de digitación",
        )


def test_repeated_reversals_alert_once_and_notify_the_managers(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    for _ in range(3):
        reverse(tenant, pay(tenant, loan, "100"))
    with company_context(tenant.company.id):
        alerts = [a for a in fraud.review(tenant.company.id) if a.kind == FraudKind.REVERSALS]
        assert len(alerts) == 1
        assert alerts[0].subject == tenant.users["cajero"] and alerts[0].count == 3
        assert "3 reverso(s) pedidos en 7 día(s)" in alerts[0].detail
        assert Notification.objects.filter(
            user=tenant.users["gerente"], kind=Notification.Kind.FRAUD_ALERT
        ).exists()
        # The same pattern does not alert again within its window.
        assert not [a for a in fraud.review(tenant.company.id) if a.kind == FraudKind.REVERSALS]


def test_permission_changes_alert_the_company(tenant) -> None:
    # The fixture just created memberships: that is a permission change.
    with company_context(tenant.company.id):
        alerts = fraud.review(tenant.company.id)
    company_wide = [a for a in alerts if a.kind == FraudKind.PERMISSIONS]
    assert company_wide and company_wide[0].subject is None
    assert company_wide[0].detail.startswith("La empresa:")


def test_the_manager_tunes_rules_and_reviews_alerts(tenant) -> None:
    manager = tenant.client("gerente")
    rules = manager.get("/api/v1/alertas/reglas/").json()
    assert len(rules) == 8 and {r["kind"] for r in rules} >= {"reversals", "off_route"}
    reversals = next(r for r in rules if r["kind"] == "reversals")
    changed = manager.patch(
        f"/api/v1/alertas/reglas/{reversals['id']}/", {"threshold": 10}, format="json"
    )
    assert changed.json()["threshold"] == 10
    too_long = manager.patch(
        f"/api/v1/alertas/reglas/{reversals['id']}/", {"window_days": 365}, format="json"
    )
    assert too_long.status_code == 400
    audit = tenant.client("auditoria")
    assert audit.get("/api/v1/alertas/reglas/").status_code == 200
    assert (
        audit.patch(
            f"/api/v1/alertas/reglas/{reversals['id']}/", {"threshold": 1}, format="json"
        ).status_code
        == 403
    )
    assert tenant.client("supervisor").get("/api/v1/alertas/").status_code == 403

    with company_context(tenant.company.id):
        fraud.review(tenant.company.id)
    listed = manager.get("/api/v1/alertas/").json()
    assert listed["open"] >= 1
    alert = listed["results"][0]
    empty = manager.post(f"/api/v1/alertas/{alert['id']}/revisar/", {"note": ""}, format="json")
    assert empty.status_code == 400
    done = manager.post(
        f"/api/v1/alertas/{alert['id']}/revisar/",
        {"note": "Altas de usuarios del arranque."},
        format="json",
    )
    assert done.json()["status"] == "reviewed"
    assert manager.get("/api/v1/alertas/?estado=reviewed").json()["count"] == 1
    board = manager.get("/api/v1/tablero/").json()
    assert board["operations"]["fraud_alerts_open"] == listed["open"] - 1
    assert (
        tenant.client("supervisor")
        .get("/api/v1/tablero/")
        .json()["operations"]["fraud_alerts_open"]
        is None
    )


def test_alerts_never_cross_companies(tenant, other_tenant) -> None:
    with company_context(tenant.company.id):
        fraud.review(tenant.company.id)
        alert = FraudAlert.objects.first()
    theirs = other_tenant.client("gerente")
    assert theirs.get("/api/v1/alertas/").json()["count"] == 0
    response = theirs.post(f"/api/v1/alertas/{alert.id}/revisar/", {"note": "x"}, format="json")
    assert response.status_code == 404
