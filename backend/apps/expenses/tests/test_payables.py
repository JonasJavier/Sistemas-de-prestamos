"""P55 · Payables (F15, decision 082): accrual, partial payments, series
recognized when due, cancellation, and the nightly reconciliation."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.core.tenancy import company_context
from apps.expenses import payables
from apps.expenses.models import ExpenseCategory, Payable
from apps.ledger import accounting
from apps.ledger import services as ledger
from apps.ledger.reconciliation import check
from apps.payments.tests.test_payments import books_square

D = Decimal
URL = "/api/v1/cuentas-por-pagar/"


def today() -> dt.date:
    return timezone.localdate()


def rent(tenant) -> str:
    with company_context(tenant.company.id):
        return str(ExpenseCategory.objects.get(name="Alquiler del local").id)


def owed(tenant) -> Decimal:
    with company_context(tenant.company.id):
        return ledger.balance_of(ledger.system_account(tenant.company.id, "payables"))


def test_an_invoice_is_owed_until_paid_even_in_parts(tenant) -> None:
    created = tenant.client("contabilidad").post(
        URL,
        {
            "branch": str(tenant.branch.id),
            "category": rent(tenant),
            "party_name": "Inmobiliaria del Cibao",
            "party_document": "131234567",
            "ncf": "B0100000888",
            "description": "Alquiler de octubre",
            "amount": "30000",
            "invoice_on": today().isoformat(),
            "due_on": (today() + dt.timedelta(days=5)).isoformat(),
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    payable_id = created.json()[0]["id"]
    assert owed(tenant) == D("30000.00")  # the expense and the debt, at the invoice date
    with company_context(tenant.company.id):
        statement = accounting.income_statement(today().replace(day=1), today())
        assert {a.code: v for a, v in statement.expenses.rows}["5202"] == D("30000.00")
    body = {"account": str(tenant.cash.id), "date": today().isoformat()}
    partial = tenant.client("gerente").post(
        f"{URL}{payable_id}/pagar/", {**body, "amount": "10000"}, format="json"
    )
    assert (partial.json()["status"], partial.json()["outstanding"]) == ("partial", "20000.00")
    too_much = tenant.client("gerente").post(
        f"{URL}{payable_id}/pagar/", {**body, "amount": "25000"}, format="json"
    )
    assert too_much.status_code == 400
    paid = tenant.client("gerente").post(
        f"{URL}{payable_id}/pagar/", {**body, "amount": "20000"}, format="json"
    )
    assert paid.json()["status"] == "paid" and len(paid.json()["payments"]) == 2
    assert owed(tenant) == D("0.00")
    with company_context(tenant.company.id):
        assert check(tenant.company.id) == []
    books_square(tenant)


def test_a_series_is_recognized_as_each_occurrence_falls_due(tenant) -> None:
    created = tenant.client("gerente").post(
        URL,
        {
            "branch": str(tenant.branch.id),
            "category": rent(tenant),
            "party_name": "Inmobiliaria del Cibao",
            "description": "Alquiler",
            "amount": "30000",
            "due_on": today().isoformat(),
            "frequency": "monthly",
            "count": 3,
        },
        format="json",
    )
    rows = created.json()
    assert [r["description"] for r in rows] == [
        "Alquiler (1/3)",
        "Alquiler (2/3)",
        "Alquiler (3/3)",
    ]
    assert owed(tenant) == D("0.00")  # nothing recognized until it falls due
    with company_context(tenant.company.id):
        assert payables.recognize_due(today()) == 1
        assert payables.recognize_due(today()) == 0  # once
    assert owed(tenant) == D("30000.00")
    # Paying the next one early recognizes it first.
    early = tenant.client("gerente").post(
        f"{URL}{rows[1]['id']}/pagar/",
        {"account": str(tenant.cash.id), "date": today().isoformat(), "amount": "30000"},
        format="json",
    )
    assert early.json()["status"] == "paid" and early.json()["recognized_on"]
    assert owed(tenant) == D("30000.00")
    # Cancelling the third (never recognized) moves no money; the first's
    # unpaid remainder reverses its expense.
    third = tenant.client("gerente").post(
        f"{URL}{rows[2]['id']}/cancelar/", {"reason": "Se rescindió el contrato"}, format="json"
    )
    assert third.json()["status"] == "cancelled"
    first = tenant.client("gerente").post(
        f"{URL}{rows[0]['id']}/cancelar/", {"reason": "Acuerdo de salida"}, format="json"
    )
    assert first.json()["status"] == "cancelled"
    assert owed(tenant) == D("0.00")
    with company_context(tenant.company.id):
        assert check(tenant.company.id) == []
        assert Payable.objects.filter(status="cancelled").count() == 2
    books_square(tenant)


def test_payables_are_for_management_and_accounting(tenant, other_tenant) -> None:
    body = {
        "branch": str(tenant.branch.id),
        "category": rent(tenant),
        "party_name": "X",
        "description": "Y",
        "amount": "100",
        "invoice_on": today().isoformat(),
        "due_on": today().isoformat(),
    }
    assert tenant.client("supervisor").post(URL, body, format="json").status_code == 403
    assert tenant.client("auditoria").get(URL).status_code == 200
    assert tenant.client("auditoria").post(URL, body, format="json").status_code == 403
    created = tenant.client("gerente").post(URL, body, format="json").json()[0]
    assert other_tenant.client("gerente").get(f"{URL}{created['id']}/").status_code == 404
    late = tenant.client("gerente").post(
        URL, {**body, "due_on": today().isoformat(), "invoice_on": "2000-01-01"}, format="json"
    )
    assert late.status_code == 201  # an old invoice in an open month is fine
    listing = tenant.client("gerente").get(f"{URL}?vista=abiertas").json()
    assert D(listing["totals"]["outstanding"]) == D("200.00")


def test_paying_from_an_empty_account_says_so(tenant) -> None:
    """No overdraft (#30): a clear 400, never a server error, and nothing kept."""
    with company_context(tenant.company.id):
        bank = ledger.create_financial_account(
            company_id=tenant.company.id, name="Banco vacío", kind="bank"
        )
    created = (
        tenant.client("gerente")
        .post(
            URL,
            {
                "branch": str(tenant.branch.id),
                "category": rent(tenant),
                "party_name": "Inmobiliaria",
                "description": "Alquiler",
                "amount": "1000",
                "invoice_on": today().isoformat(),
                "due_on": today().isoformat(),
            },
            format="json",
        )
        .json()[0]
    )
    refused = tenant.client("gerente").post(
        f"{URL}{created['id']}/pagar/",
        {"account": str(bank.id), "date": today().isoformat(), "amount": "1000"},
        format="json",
    )
    assert refused.status_code == 400
    assert refused.json()["code"] == "insufficient_funds"
    assert "Fondos insuficientes" in refused.json()["detail"]
    assert tenant.client("gerente").get(f"{URL}{created['id']}/").json()["paid"] == "0.00"
    books_square(tenant)
