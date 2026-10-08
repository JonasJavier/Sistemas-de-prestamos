"""Phase 4 API: roles of doc 06, isolation between companies, the public
receipt, the reversal with its second factor, cash, routes and the tray."""

import datetime as dt
import uuid
from decimal import Decimal

import pytest
from django.test import override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.conftest import make_customer, open_cash
from apps.core.models import Branch, Reason
from apps.core.tenancy import company_context
from apps.lending.models import Loan
from apps.payments.tests.test_payments import books_square, make_loan, pay

D = Decimal


def _collect(api, number, amount, **extra):
    body = {"amount": amount, "method": "cash", "idempotency_key": uuid.uuid4().hex, **extra}
    return api.post(f"/api/v1/prestamos/{number}/cobrar/", body, format="json")


def test_payment_screen_preview_and_collect(tenant, other_tenant) -> None:
    loan = make_loan(tenant, first_due_in=-11)
    cashier = tenant.client("cajero")
    screen = cashier.get(f"/api/v1/prestamos/{loan.number}/cobro/").json()
    assert screen["summary"]["overdue"] == "708.75"  # E10: 356.42 + 352.33
    assert screen["summary"]["days_past_due"] == 11
    assert screen["destination"]["kind"] == "cash_session"
    assert screen["payoff"]["principal"] == "1000.00"
    preview = cashier.post(
        f"/api/v1/prestamos/{loan.number}/cobro/simular/",
        {"amount": "800", "method": "cash", "received": "1000"},
        format="json",
    )
    assert preview.status_code == 200, preview.content
    assert preview.json()["change"] == "200.00"
    assert preview.json()["totals"]["late_fee"] == "8.75"
    # The preview wrote nothing.
    assert cashier.get("/api/v1/pagos/").json()["count"] == 0
    key = uuid.uuid4().hex
    first = _collect(cashier, loan.number, "800", idempotency_key=key)
    again = _collect(cashier, loan.number, "800", idempotency_key=key)
    assert first.status_code == again.status_code == 201
    assert first.json()["number"] == again.json()["number"]
    receipt = cashier.get(f"/api/v1/pagos/{first.json()['number']}/").json()
    assert receipt["amount"] == "800.00"
    assert receipt["principal_after"] == "500.00"
    assert receipt["can_request_reversal"] is True
    # Another company sees nothing of it.
    assert (
        other_tenant.client("gerente").get(f"/api/v1/prestamos/{loan.number}/cobro/").status_code
        == 404
    )
    assert (
        other_tenant.client("gerente").get(f"/api/v1/pagos/{receipt['number']}/").status_code == 404
    )
    books_square(tenant)


def test_who_collects(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    assert _collect(tenant.client("oficial"), loan.number, "100").status_code == 403
    assert _collect(tenant.client("contabilidad"), loan.number, "100").status_code == 403
    # The collector only sees (and so collects) his own portfolio.
    assert _collect(tenant.client("cobrador"), loan.number, "100").status_code == 404


def test_public_receipt_shows_only_that_receipt_and_can_be_revoked(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    number = _collect(tenant.client("cajero"), loan.number, "350").json()["number"]
    receipt = tenant.client("cajero").get(f"/api/v1/pagos/{number}/").json()
    token = receipt["receipt_path"].removeprefix("/r/")
    public = APIClient().get(f"/api/v1/publico/recibos/{token}/")
    assert public.status_code == 200
    data = public.json()
    assert data["number"] == number
    assert "•" in data["customer"]["document"]
    assert "id" not in data and "cash_session" not in data
    assert APIClient().get("/api/v1/publico/recibos/no-existe/").status_code == 404
    tenant.client("cajero").post(f"/api/v1/pagos/{number}/enlace/", {"revoke": True})
    assert APIClient().get(f"/api/v1/publico/recibos/{token}/").status_code == 404


def test_reversal_needs_another_person_and_the_second_factor(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    number = _collect(tenant.client("cajero"), loan.number, "350").json()["number"]
    with company_context(tenant.company.id):
        reason = Reason.objects.filter(kind=Reason.Kind.REVERSAL).first()
    effect = tenant.client("cajero").get(
        f"/api/v1/pagos/{number}/reverso/efecto/?correct_amount=300"
    )
    assert effect.json()["principal_after"] == "800.00"
    asked = tenant.client("cajero").post(
        f"/api/v1/pagos/{number}/reverso/",
        {"reason": str(reason.id), "note": "Eran 300", "correct_amount": "300"},
        format="json",
    )
    assert asked.status_code == 201, asked.content
    approval = asked.json()["id"]
    supervisor = tenant.client("supervisor")
    inbox = supervisor.get("/api/v1/autorizaciones/").json()
    assert [item["id"] for item in inbox["results"]] == [approval]
    assert inbox["results"][0]["needs_second_factor"] is True
    assert tenant.client("cajero").get("/api/v1/autorizaciones/").json()["count"] == 0
    wrong = supervisor.post(
        f"/api/v1/autorizaciones/{approval}/aprobar/", {"second_factor": "000000"}, format="json"
    )
    assert wrong.json()["code"] == "second_factor"
    # Without an authenticator (development), the password confirms.
    done = supervisor.post(
        f"/api/v1/autorizaciones/{approval}/aprobar/",
        {"second_factor": "una-clave-larga-123"},
        format="json",
    )
    assert done.status_code == 200, done.content
    assert done.json()["status"] == "used"
    receipt = tenant.client("cajero").get(f"/api/v1/pagos/{number}/").json()
    assert receipt["status"] == "reversed"
    assert receipt["reversed"]["replacement"] is not None
    notices = tenant.client("cajero").get("/api/v1/avisos/").json()["results"]
    assert any("aprobó" in notice["text"] for notice in notices)
    books_square(tenant)


def test_payoff_letter_and_its_pdf(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-3)
    pay(tenant, loan, "350")
    api = tenant.client("oficial")
    quote = api.get(f"/api/v1/prestamos/{loan.number}/carta-saldo/").json()
    assert quote["total"] == "850.00"
    issued = api.post(f"/api/v1/prestamos/{loan.number}/carta-saldo/", {}, format="json")
    assert issued.status_code == 201
    pdf = api.get(f"/api/v1/prestamos/{loan.number}/carta-saldo/{issued.json()['id']}/")
    assert b"".join(pdf.streaming_content).startswith(b"%PDF")


def test_account_statement_on_request(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-11)
    pay(tenant, loan, "400")
    pdf = tenant.client("oficial").get(f"/api/v1/prestamos/{loan.number}/estado-de-cuenta/")
    assert pdf.status_code == 200
    assert b"".join(pdf.streaming_content).startswith(b"%PDF")
    again = tenant.client("oficial").get(f"/api/v1/prestamos/{loan.number}/estado-de-cuenta/")
    assert again.status_code == 200
    with company_context(tenant.company.id):
        from apps.documents.models import GeneratedDocument

        folios = sorted(
            GeneratedDocument.objects.filter(kind="account_statement").values_list(
                "folio", flat=True
            )
        )
        assert folios == [f"{loan.number}-EC001", f"{loan.number}-EC002"]


# --- Cash ---------------------------------------------------------------------------------------


def test_cash_api_open_close_approve_and_pdf(tenant) -> None:
    cashier = tenant.client("cajero")
    mine = cashier.get("/api/v1/caja/").json()
    assert mine["session"] is None
    opened = cashier.post(
        "/api/v1/caja/abrir/",
        {"branch": str(tenant.branch.id), "amount": "3000", "fund_from": str(tenant.cash.id)},
        format="json",
    )
    assert opened.status_code == 201, opened.content
    assert opened.json()["expected"] == "3000.00"
    closed = cashier.post("/api/v1/caja/cerrar/", {"counts": {"1000": 3}}, format="json")
    assert closed.json()["status"] == "closed"
    session_id = closed.json()["id"]
    supervisor = tenant.client("supervisor")
    listing = supervisor.get("/api/v1/cajas/?status=closed").json()
    assert listing["to_approve"] == 1
    assert supervisor.get("/api/v1/yo/").json()["closings_to_approve"] == 1
    assert cashier.get(f"/api/v1/cajas/{session_id}/").status_code == 403
    approved = supervisor.post(f"/api/v1/cajas/{session_id}/", {"note": "OK"}, format="json")
    assert approved.json()["status"] == "approved"
    pdf = supervisor.get(f"/api/v1/cajas/{session_id}/pdf/")
    assert b"".join(pdf.streaming_content).startswith(b"%PDF")


# --- Routes -------------------------------------------------------------------------------------


def test_my_route_visits_pings_and_the_supervisor_map(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-2)
    collector = tenant.client("cobrador")
    supervisor = tenant.client("supervisor")
    assigned = supervisor.post(
        "/api/v1/rutas/asignar/",
        {"loans": [loan.number], "collector": str(tenant.users["cobrador"].id)},
        format="json",
    )
    assert assigned.json()["changed"] == 1
    route = collector.get("/api/v1/ruta/").json()
    assert route["consent"] is False
    assert [stop["loan_number"] for stop in route["stops"]] == [loan.number]
    assert collector.post("/api/v1/ruta/abrir/", {}).json()["code"] == "consent"
    collector.post("/api/v1/ruta/consentimiento/")
    opened = collector.post("/api/v1/ruta/abrir/", {})
    assert opened.status_code == 201
    ping = collector.post(
        "/api/v1/ruta/ubicacion/", {"latitude": "18.4861", "longitude": "-69.9312"}, format="json"
    )
    assert ping.json()["recorded"] is True
    visit = collector.post(
        f"/api/v1/prestamos/{loan.number}/gestiones/",
        {"result": "not_home", "latitude": "18.48", "longitude": "-69.93"},
        format="json",
    )
    assert visit.status_code == 201
    paid = _collect(collector, loan.number, "350", latitude="18.4862", longitude="-69.9311")
    assert paid.status_code == 201, paid.content
    route = collector.get("/api/v1/ruta/").json()
    assert route["route"]["cash"] == "350.00"
    assert route["progress"]["paid"] == 1
    routes = supervisor.get("/api/v1/rutas/").json()
    assert routes["collectors"][0]["collected"] == "350.00"
    map_data = supervisor.get(f"/api/v1/rutas/{tenant.users['cobrador'].id}/mapa/").json()
    assert len(map_data["pings"]) == 1 and len(map_data["payments"]) == 1
    assert tenant.client("cajero").get("/api/v1/rutas/").status_code == 403
    # The cashier receives the settlement.
    open_cash(tenant, "cajero")
    route_id = route["route"]["id"]
    settled = tenant.client("cajero").post(
        f"/api/v1/rendiciones/{route_id}/", {"delivered": "350"}, format="json"
    )
    assert settled.json()["status"] == "settled"
    books_square(tenant)


# --- Delinquency, nightly job and dates ------------------------------------------------


def test_delinquency_tray_and_the_nightly_job(tenant) -> None:
    from apps.collections.models import DelinquencySnapshot
    from apps.payments.tasks import run_nightly

    late = make_loan(tenant, first_due_in=-40)
    make_loan(tenant, first_due_in=5)
    with company_context(tenant.company.id):
        result = run_nightly(tenant.company.id, timezone.localdate())
        assert result["problems"] == []
        late.refresh_from_db()
        assert late.days_past_due == 40
        assert late.late_fee_outstanding > 0
        snapshot = DelinquencySnapshot.objects.get(loan=late)
        assert snapshot.bucket == "31_60"
    tray = tenant.client("supervisor").get("/api/v1/atrasos/?tramo=31_60").json()
    assert [row["number"] for row in tray["results"]] == [late.number]
    assert {b["key"]: b["count"] for b in tray["buckets"]}["31_60"] == 1
    assert tenant.client("cajero").get("/api/v1/atrasos/").status_code == 403
    # Tampering with a cache is caught by the reconciliation.
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=late.pk).update(principal_outstanding=D("1"))
        from apps.ledger.reconciliation import check

        assert any(late.number in problem for problem in check(tenant.company.id))


def test_change_dates_creates_a_new_version(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    with company_context(tenant.company.id):
        reason = Reason.objects.get(kind=Reason.Kind.DATE_CHANGE)
    new_first = timezone.localdate() + dt.timedelta(days=3)
    response = tenant.client("supervisor").post(
        f"/api/v1/prestamos/{loan.number}/cambiar-fecha/",
        {"first_due": new_first.isoformat(), "reason": str(reason.id), "note": "Acuerdo"},
        format="json",
    )
    assert response.status_code == 200, response.content
    assert response.json()["current_terms"]["version"] == 2
    assert response.json()["days_past_due"] == 0
    assert (
        tenant.client("cajero")
        .post(f"/api/v1/prestamos/{loan.number}/cambiar-fecha/", {}, format="json")
        .status_code
        == 403
    )


# --- Branch scope (decisions 033 and 059) and working hours (035) ------------------------


def test_customers_of_another_branch_need_a_logged_grant(tenant) -> None:
    with company_context(tenant.company.id):
        other = Branch.objects.create(company=tenant.company, code="02", name="Santiago")
        far_customer = make_customer(tenant.company, other, "40212345678", first_name="Rosa")
    cashier = tenant.client("cajero")
    assert cashier.get(f"/api/v1/clientes/{far_customer.id}/").status_code == 404
    hits = cashier.get("/api/v1/clientes/otra-sucursal/?documento=402-1234567-8").json()
    assert [hit["id"] for hit in hits] == [str(far_customer.id)]
    refused = cashier.post(f"/api/v1/clientes/{far_customer.id}/acceso-especial/", {})
    assert refused.status_code == 400
    granted = cashier.post(
        f"/api/v1/clientes/{far_customer.id}/acceso-especial/",
        {"note": "Vino a pagar a esta sucursal"},
        format="json",
    )
    assert granted.status_code == 201
    assert cashier.get(f"/api/v1/clientes/{far_customer.id}/").status_code == 200
    # The manager sees every branch without asking.
    assert tenant.client("gerente").get(f"/api/v1/clientes/{far_customer.id}/").status_code == 200


@override_settings(ENFORCE_WORKING_HOURS=True)
def test_cashiers_work_within_the_branch_hours(tenant) -> None:
    with company_context(tenant.company.id):
        Branch.objects.filter(pk=tenant.branch.pk).update(workdays=[])  # closed every day
    cashier = tenant.client("cajero")
    response = cashier.get("/api/v1/clientes/")
    assert response.status_code == 401
    assert response.json()["code"] == "outside_hours"
    # The session is gone; the manager is never restricted.
    assert tenant.client("gerente").get("/api/v1/clientes/").status_code == 200
    extended = tenant.client("supervisor").post(
        "/api/v1/horario/",
        {"user": str(tenant.users["cajero"].id), "minutes": 60, "note": "Cierre de mes"},
        format="json",
    )
    assert extended.status_code == 201, extended.content
    assert tenant.client("cajero").get("/api/v1/clientes/").status_code == 200


def test_me_reports_badges(tenant) -> None:
    open_cash(tenant, "cajero")
    me = tenant.client("cajero").get("/api/v1/yo/").json()
    assert me["cash_session"]["number"].startswith("01-C-")
    assert me["unread_notifications"] == 0
    assert me["pending_approvals"] == 0


@pytest.mark.parametrize("role", ["oficial", "contabilidad", "cobrador", "gerente"])
def test_only_cashiers_and_supervisors_use_a_drawer(tenant, role) -> None:
    assert tenant.client(role).get("/api/v1/caja/").status_code == 403
