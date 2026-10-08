"""The ledger rules of doc 05 - section 7, proven against PostgreSQL."""

from decimal import Decimal

import pytest
from django.db import DatabaseError, connection, transaction
from django.utils import timezone

from apps.core.tenancy import company_context
from apps.ledger import services as ledger
from apps.ledger.models import AccountBalance, JournalEntry, JournalLine

D = Decimal


def test_signup_seeds_chart_and_cash_box(tenant) -> None:
    with company_context(tenant.company.id):
        keys = set(AccountBalance.objects.values_list("account__system_key", flat=True)) - {""}
        assert keys == {
            "loan_portfolio",
            "owner_equity",
            "interest_income",
            "late_fee_income",
            "charge_income",
            "write_off_expense",
            "cash_shortage",
            "cash_overage",
            "opening_balance",
        }
        assert tenant.cash.name == "Caja general"
        assert tenant.cash.ledger_account.code == "1101-01"
        # The conftest funded it with an owner's contribution.
        assert ledger.balance_of(tenant.cash.ledger_account) == D("500000.00")


def test_transfer_moves_money_and_keeps_cache_equal_to_lines(tenant) -> None:
    with company_context(tenant.company.id):
        bank = ledger.create_financial_account(
            company_id=tenant.company.id,
            name="Banco Popular",
            kind="bank",
            bank_name="Banco Popular",
            account_number="800-123456-7",
        )
        assert bank.account_number_last4 == "4567"  # stored masked
        ledger.transfer(
            source=tenant.cash,
            target=bank,
            amount=D("120000"),
            branch=tenant.branch,
            on=timezone.localdate(),
            note="Depósito",
            created_by=tenant.users["gerente"],
        )
        for account in (tenant.cash.ledger_account, bank.ledger_account):
            assert ledger.balance_of(account) == ledger.recomputed_balance(account)
        assert ledger.balance_of(bank.ledger_account) == D("120000.00")
        assert ledger.balance_of(tenant.cash.ledger_account) == D("380000.00")


def test_no_overdraft(tenant) -> None:
    """Reference defect #30: a cash box never goes negative."""
    with company_context(tenant.company.id):
        bank = ledger.create_financial_account(
            company_id=tenant.company.id, name="BHD", kind="bank", bank_name="BHD"
        )
        with pytest.raises(ledger.InsufficientFunds):
            ledger.transfer(
                source=tenant.cash,
                target=bank,
                amount=D("500000.01"),
                branch=tenant.branch,
                on=timezone.localdate(),
                note="",
                created_by=None,
            )
        assert ledger.balance_of(tenant.cash.ledger_account) == D("500000.00")
        assert not JournalLine.objects.filter(financial_account=bank).exists()


def test_unbalanced_entry_is_rejected_in_python(tenant) -> None:
    with company_context(tenant.company.id):
        equity = ledger.system_account(tenant.company.id, "owner_equity")
        with pytest.raises(ledger.LedgerError, match="desbalanceado"):
            ledger.post_entry(
                company_id=tenant.company.id,
                branch=tenant.branch,
                on=timezone.localdate(),
                description="Mal",
                source_type="test",
                source_id=None,
                lines=[
                    ledger.cash_line(tenant.cash, debit_amount=D("10")),
                    ledger.credit(equity, D("9.99")),
                ],
            )


def test_database_rejects_unbalanced_entry_even_if_code_fails(tenant) -> None:
    """Doc 05 - 7.1: the deferred trigger checks every entry at commit."""
    with company_context(tenant.company.id):
        entry = JournalEntry.objects.first()
        with pytest.raises(DatabaseError, match="desbalanceado"), transaction.atomic():
            JournalLine.objects.create(
                company_id=tenant.company.id,
                entry=entry,
                account=tenant.cash.ledger_account,
                debit=D("1.00"),
                branch=tenant.branch,
            )
            with connection.cursor() as cursor:  # run the deferred check now
                cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")


def test_ledger_is_append_only(tenant) -> None:
    """Doc 05 - 7.2: no UPDATE nor DELETE on entries or lines."""
    with company_context(tenant.company.id):
        line = JournalLine.objects.first()
        with pytest.raises(DatabaseError), transaction.atomic():
            JournalLine.objects.filter(pk=line.pk).update(debit=D("1"))
        with pytest.raises(DatabaseError), transaction.atomic():
            JournalEntry.objects.filter(pk=line.entry_id).delete()


def test_reversal_restores_balances(tenant) -> None:
    with company_context(tenant.company.id):
        entry = JournalEntry.objects.get(source_type="ledger.capital")
        ledger.reverse_entry(entry, on=timezone.localdate(), description="Error")
        assert ledger.balance_of(tenant.cash.ledger_account) == D("0.00")
        with pytest.raises(ledger.LedgerError, match="ya fue revertido"):
            ledger.reverse_entry(entry, on=timezone.localdate(), description="Otra vez")


def test_ledger_is_isolated_between_companies(tenant, other_tenant) -> None:
    with company_context(tenant.company.id):
        own = set(JournalEntry.objects.values_list("company_id", flat=True))
    assert own == {tenant.company.id}
    with company_context(other_tenant.company.id):
        assert not JournalLine.objects.filter(account=tenant.cash.ledger_account).exists()


def test_accounts_api_matrix(tenant) -> None:
    """P53: G and Ct manage; audit reads; the cashier and officer do not."""
    assert tenant.client("gerente").get("/api/v1/cuentas/").status_code == 200
    assert tenant.client("contabilidad").get("/api/v1/cuentas/").status_code == 200
    assert tenant.client("cajero").get("/api/v1/cuentas/").status_code == 403
    assert tenant.client("oficial").get("/api/v1/cuentas/").status_code == 403

    created = tenant.client("contabilidad").post(
        "/api/v1/cuentas/",
        {
            "name": "Banreservas",
            "kind": "bank",
            "bank_name": "Banreservas",
            "account_number": "9600123456",
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    assert created.json()["account_number_last4"] == "3456"
    assert "account_number" not in created.json()

    bank_id = created.json()["id"]
    # Capital adjustments: manager only (doc 06: «Ajustes contables»).
    body = {"amount": "1000", "direction": "in", "note": "Aporte"}
    assert (
        tenant.client("contabilidad").post(f"/api/v1/cuentas/{bank_id}/capital/", body).status_code
        == 403
    )
    assert (
        tenant.client("gerente").post(f"/api/v1/cuentas/{bank_id}/capital/", body).status_code
        == 201
    )
    transfer = tenant.client("contabilidad").post(
        "/api/v1/cuentas/transferir/",
        {"source": str(tenant.cash.id), "target": bank_id, "amount": "999999999", "note": ""},
        format="json",
    )
    assert transfer.status_code == 400
    assert "Fondos insuficientes" in transfer.json()["detail"]
    movements = tenant.client("gerente").get(f"/api/v1/cuentas/{bank_id}/movimientos/")
    assert movements.json()["results"][0]["debit"] == "1000.00"
