"""P56 and F15 (decision 080): the books agree with the ledger to the cent,
and a closed month refuses entries, even through raw SQL."""

import datetime as dt
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.core.tenancy import company_context
from apps.ledger import accounting
from apps.ledger import services as ledger
from apps.ledger.models import AccountingPeriod, JournalEntry, LedgerAccount
from apps.payments.tests.test_payments import books_square, make_loan, pay

D = Decimal


def today() -> dt.date:
    return timezone.localdate()


def last_month() -> dt.date:
    return today().replace(day=1) - dt.timedelta(days=1)


def _close(tenant, on: dt.date) -> AccountingPeriod:
    with company_context(tenant.company.id):
        return AccountingPeriod.objects.create(
            company_id=tenant.company.id,
            year=on.year,
            month=on.month,
            status=AccountingPeriod.Status.CLOSED,
            closed_at=timezone.now(),
            closed_by=tenant.users["gerente"],
        )


def test_the_statements_agree_with_the_books(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    pay(tenant, loan, "400")
    with company_context(tenant.company.id):
        start = dt.date(today().year, 1, 1)
        statement = accounting.income_statement(start, today())
        income = {a.system_key: amount for a, amount in statement.income.rows}
        # E1's 10 % interest and its late fee, recognized as they were collected.
        assert income["interest_income"] > 0 and income["late_fee_income"] > 0
        sheet = accounting.balance_sheet(today())
        assert sheet.balances
        assert sheet.current == statement.result
        rows = accounting.trial_balance(start, today())
        assert sum(r.debit for r in rows) == sum(r.credit for r in rows)
        # The general ledger of the cash box ends where its cached balance is.
        _, lines, _ = accounting.account_ledger(tenant.cash.ledger_account, start, today())
        assert lines[-1].balance == ledger.balance_of(tenant.cash.ledger_account)
    books_square(tenant)


def test_a_closed_month_refuses_entries_even_by_raw_sql(tenant) -> None:
    closed = last_month()
    _close(tenant, closed)
    with company_context(tenant.company.id):
        equity = ledger.system_account(tenant.company.id, "owner_equity")
        with pytest.raises(accounting.AccountingError, match="cerrado"):
            ledger.post_entry(
                company_id=tenant.company.id,
                branch=tenant.branch,
                on=closed,
                description="Fuera de plazo",
                source_type="test",
                source_id=None,
                lines=[
                    ledger.debit(tenant.cash.ledger_account, D("1")),
                    ledger.credit(equity, D("1")),
                ],
            )
        # Code that forgets to ask still hits the database trigger.
        with pytest.raises(IntegrityError, match="cerrado"), transaction.atomic():
            JournalEntry.objects.create(
                company_id=tenant.company.id,
                number="X-1",
                date=closed,
                branch=tenant.branch,
                description="Directo",
                source_type="test",
            )
        # Today's month stays open.
        ledger.capital_movement(
            account=tenant.cash,
            amount=D("10"),
            increase=True,
            branch=tenant.branch,
            on=today(),
            note="Abierto",
            created_by=tenant.users["gerente"],
        )


def test_the_manager_adjusts_with_a_reason_and_never_a_subledger(tenant) -> None:
    created = tenant.client("contabilidad").post(
        "/api/v1/contabilidad/cuentas/",
        {"code": "5250", "name": "Depreciación", "type": "expense"},
        format="json",
    )
    assert created.status_code == 201, created.content
    expense_id = created.json()["id"]
    with company_context(tenant.company.id):
        portfolio = ledger.system_account(tenant.company.id, "loan_portfolio")
    body = {
        "date": today().isoformat(),
        "branch": str(tenant.branch.id),
        "description": "Depreciación de equipos",
        "lines": [
            {"account": expense_id, "debit": "150.00"},
            {"account": str(tenant.cash.ledger_account_id), "credit": "150.00"},
        ],
    }
    assert (
        tenant.client("contabilidad")
        .post("/api/v1/contabilidad/asientos/", body, format="json")
        .status_code
        == 403
    )
    ok = tenant.client("gerente").post("/api/v1/contabilidad/asientos/", body, format="json")
    assert ok.status_code == 201, ok.content
    unbalanced = {**body, "lines": [body["lines"][0], {**body["lines"][1], "credit": "100"}]}
    assert (
        tenant.client("gerente")
        .post("/api/v1/contabilidad/asientos/", unbalanced, format="json")
        .status_code
        == 400
    )
    subledger = {
        **body,
        "lines": [body["lines"][0], {"account": str(portfolio.id), "credit": "150"}],
    }
    refused = tenant.client("gerente").post(
        "/api/v1/contabilidad/asientos/", subledger, format="json"
    )
    assert "registro auxiliar" in refused.json()["detail"]
    _close(tenant, last_month())
    late = {**body, "date": last_month().isoformat()}
    assert (
        "cerrado"
        in tenant.client("gerente")
        .post("/api/v1/contabilidad/asientos/", late, format="json")
        .json()["detail"]
    )
    statement = tenant.client("gerente").get("/api/v1/contabilidad/resultados/").json()
    assert {r["code"]: r["amount"] for r in statement["expenses"]["rows"]}["5250"] == "150.00"
    books_square(tenant)


def test_the_books_are_for_management_and_accounting_only(tenant, other_tenant) -> None:
    assert tenant.client("auditoria").get("/api/v1/contabilidad/balanza/").status_code == 200
    assert tenant.client("cajero").get("/api/v1/contabilidad/balanza/").status_code == 403
    assert (
        tenant.client("auditoria")
        .post("/api/v1/contabilidad/cuentas/", {"code": "5251", "name": "X", "type": "expense"})
        .status_code
        == 403
    )
    with company_context(tenant.company.id):
        system = LedgerAccount.objects.get(system_key="interest_income")
    refused = tenant.client("gerente").patch(
        f"/api/v1/contabilidad/cuentas/{system.id}/", {"name": "Otra"}, format="json"
    )
    assert refused.status_code == 400
    # Another company's account does not exist for me.
    assert (
        other_tenant.client("gerente")
        .get(f"/api/v1/contabilidad/cuentas/{system.id}/mayor/")
        .status_code
        == 404
    )
    sheet = tenant.client("gerente").get("/api/v1/contabilidad/balance/").json()
    assert sheet["balances"] is True
    assert sheet["assets"]["total"] == sheet["liabilities_and_equity"]
    journal = tenant.client("gerente").get("/api/v1/contabilidad/diario/").json()
    assert journal["count"] >= 1 and journal["results"][0]["lines"]
    periods = tenant.client("contabilidad").get("/api/v1/contabilidad/periodos/").json()
    assert len(periods) == 24 and periods[0]["status"] == "open"
