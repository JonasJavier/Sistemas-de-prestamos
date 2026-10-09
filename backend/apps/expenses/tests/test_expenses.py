"""P54 · Expenses and other income (F15, decision 081)."""

import datetime as dt
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.cash import services as cash
from apps.conftest import open_cash
from apps.core.tenancy import company_context
from apps.expenses import services
from apps.expenses.models import Expense, ExpenseCategory
from apps.ledger import accounting
from apps.ledger import services as ledger
from apps.ledger.models import AccountingPeriod
from apps.notifications.models import Notification
from apps.payments.tests.test_payments import books_square

D = Decimal
PDF = b"%PDF-1.4\n%fake receipt\n"


def today() -> dt.date:
    return timezone.localdate()


def category(tenant, name: str) -> ExpenseCategory:
    with company_context(tenant.company.id):
        return ExpenseCategory.objects.get(name=name)


def body(tenant, **overrides) -> dict:
    data = {
        "kind": "expense",
        "date": today().isoformat(),
        "branch": str(tenant.branch.id),
        "category": str(category(tenant, "Luz, agua, teléfono e internet").id),
        "description": "Factura de luz de octubre",
        "amount": "2500.00",
        "itbis": "381.36",
        "method": "transfer",
        "account": str(tenant.cash.id),
        "party_name": "Edenorte Dominicana",
        "party_document": "101-82124-8",
        "ncf": "B0100000123",
    }
    return {**data, **overrides}


def test_the_manager_registers_an_expense_that_lands_in_the_books(tenant) -> None:
    response = tenant.client("gerente").post("/api/v1/gastos/", body(tenant), format="json")
    assert response.status_code == 201, response.content
    data = response.json()
    assert (data["status"], data["party_document"], data["ncf"]) == (
        "posted",
        "101821248",
        "B0100000123",
    )
    with company_context(tenant.company.id):
        statement = accounting.income_statement(today().replace(day=1), today())
        assert {a.code: v for a, v in statement.expenses.rows}["5203"] == D("2500.00")
    # Descriptive fields change with history; the amount never does.
    edited = tenant.client("contabilidad").patch(
        f"/api/v1/gastos/{data['id']}/", {"ncf": "E310000000045"}, format="json"
    )
    assert edited.json()["ncf"] == "E310000000045"
    assert len(edited.json()["history"]) >= 2
    books_square(tenant)


def test_above_the_limit_someone_else_approves_and_only_then_money_moves(tenant) -> None:
    supervisor = tenant.client("supervisor")
    response = supervisor.post(
        "/api/v1/gastos/", body(tenant, amount="8000", itbis="0"), format="json"
    )
    assert response.json()["status"] == "pending"
    expense_id = response.json()["id"]
    with company_context(tenant.company.id):
        assert Expense.objects.get(pk=expense_id).entry_id is None
        assert Notification.objects.filter(
            kind="approval_requested", user=tenant.users["gerente"]
        ).exists()
    assert supervisor.post(f"/api/v1/gastos/{expense_id}/aprobar/").status_code == 403
    approved = tenant.client("gerente").post(f"/api/v1/gastos/{expense_id}/aprobar/")
    assert approved.json()["status"] == "posted", approved.content
    second = supervisor.post(
        "/api/v1/gastos/", body(tenant, amount="9000", itbis="0"), format="json"
    )
    refused = tenant.client("gerente").post(f"/api/v1/gastos/{second.json()['id']}/rechazar/", {})
    assert refused.status_code == 400  # a rejection needs its reason
    rejected = tenant.client("gerente").post(
        f"/api/v1/gastos/{second.json()['id']}/rechazar/",
        {"note": "No corresponde a la sucursal"},
        format="json",
    )
    assert rejected.json()["status"] == "rejected"
    books_square(tenant)


def test_petty_cash_leaves_the_cashiers_open_drawer_within_his_limit(tenant) -> None:
    petty = {"from_drawer": True, "account": None, "ncf": "", "itbis": "0"}
    no_drawer = tenant.client("cajero").post(
        "/api/v1/gastos/",
        body(
            tenant,
            **petty,
            amount="300",
            category=str(category(tenant, "Materiales de oficina").id),
        ),
        format="json",
    )
    assert "Abre tu caja" in no_drawer.json()["detail"]
    session = open_cash(tenant, amount="5000")
    ok = tenant.client("cajero").post(
        "/api/v1/gastos/",
        body(
            tenant,
            **petty,
            amount="300",
            category=str(category(tenant, "Materiales de oficina").id),
        ),
        format="json",
    )
    assert ok.json()["status"] == "posted" and ok.json()["from_drawer"] is True
    with company_context(tenant.company.id):
        assert cash.expected_cash(session) == D("4700.00")
    too_much = tenant.client("cajero").post(
        "/api/v1/gastos/", body(tenant, **petty, amount="1500"), format="json"
    )
    assert "límite" in too_much.json()["detail"]
    # The cashier sees what he registered, nothing else.
    tenant.client("gerente").post("/api/v1/gastos/", body(tenant), format="json")
    listing = tenant.client("cajero").get("/api/v1/gastos/").json()
    assert [row["amount"] for row in listing["results"]] == ["300.00"]
    books_square(tenant)


def test_bad_receipts_owner_spending_voids_and_closed_months(tenant) -> None:
    manager = tenant.client("gerente")
    assert (
        "NCF"
        in manager.post("/api/v1/gastos/", body(tenant, ncf="B99"), format="json").json()["detail"]
    )
    bad_id = manager.post("/api/v1/gastos/", body(tenant, party_document="123"), format="json")
    assert bad_id.status_code == 400
    owner = manager.post(
        "/api/v1/gastos/",
        body(
            tenant,
            category=str(category(tenant, "Gastos personales del dueño").id),
            amount="1000",
            itbis="0",
            ncf="",
        ),
        format="json",
    ).json()
    with company_context(tenant.company.id):
        statement = accounting.income_statement(today().replace(day=1), today())
        assert statement.expenses.total == D("0")  # the owner's spending is equity (#12)
        withdrawals = ledger.system_account(tenant.company.id, "owner_withdrawals")
        assert ledger.balance_of(withdrawals) == D("-1000.00")
    assert (
        tenant.client("supervisor")
        .post(f"/api/v1/gastos/{owner['id']}/anular/", {"note": "x"}, format="json")
        .status_code
        == 403
    )
    voided = manager.post(
        f"/api/v1/gastos/{owner['id']}/anular/", {"note": "Era de la empresa"}, format="json"
    )
    assert voided.json()["status"] == "voided" and voided.json()["void_entry_number"]
    last_month = today().replace(day=1) - dt.timedelta(days=1)
    with company_context(tenant.company.id):
        AccountingPeriod.objects.create(
            company_id=tenant.company.id,
            year=last_month.year,
            month=last_month.month,
            status="closed",
            closed_at=timezone.now(),
        )
    late = manager.post("/api/v1/gastos/", body(tenant, date=last_month.isoformat()), format="json")
    assert "cerrado" in late.json()["detail"]
    books_square(tenant)


def test_receipts_are_private_and_companies_never_mix(tenant, other_tenant) -> None:
    manager = tenant.client("gerente")
    created = manager.post("/api/v1/gastos/", body(tenant), format="json").json()
    fake = SimpleUploadedFile("factura.exe", b"MZ not a receipt", content_type="application/pdf")
    refused = manager.post(
        f"/api/v1/gastos/{created['id']}/archivos/", {"files": [fake]}, format="multipart"
    )
    assert refused.status_code == 400
    receipt = SimpleUploadedFile("factura.pdf", PDF, content_type="application/pdf")
    attached = manager.post(
        f"/api/v1/gastos/{created['id']}/archivos/", {"files": [receipt]}, format="multipart"
    ).json()
    file_id = attached["files"][0]["id"]
    download = tenant.client("auditoria").get(f"/api/v1/gastos/archivos/{file_id}/")
    assert download.status_code == 200
    assert b"".join(download.streaming_content).startswith(b"%PDF")
    outsider = other_tenant.client("gerente")
    assert outsider.get(f"/api/v1/gastos/{created['id']}/").status_code == 404
    assert outsider.get(f"/api/v1/gastos/archivos/{file_id}/").status_code == 404
    assert outsider.get("/api/v1/gastos/").json()["count"] == 0
    assert tenant.client("cobrador").get("/api/v1/gastos/").status_code == 403
    categories = tenant.client("cajero").get("/api/v1/categorias-gasto/?kind=expense").json()
    assert any(c["name"] == "Alquiler del local" for c in categories)
    with pytest.raises(services.ExpenseError):
        with company_context(tenant.company.id):
            services.clean_ncf("A0100000001")
