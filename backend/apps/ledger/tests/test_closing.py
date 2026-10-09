"""F15 · Month-end close and the interest accrual (decisions 075 and 084)."""

import datetime as dt
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.cash import services as cash
from apps.cash.models import CashSession
from apps.conftest import open_cash
from apps.core.tenancy import company_context
from apps.documents.models import GeneratedDocument
from apps.ledger import accounting, closing
from apps.ledger import services as ledger
from apps.ledger.models import AccountingPeriod, JournalEntry
from apps.payments.tests.test_payments import books_square, make_loan

D = Decimal


def today() -> dt.date:
    return timezone.localdate()


def last_month_end() -> dt.date:
    return today().replace(day=1) - dt.timedelta(days=1)


def test_the_accrual_counts_due_interest_and_the_elapsed_share(tenant) -> None:
    # E1 weekly: 100.00 of interest per installment, the first due in 3 days.
    make_loan(tenant, first_due_in=3)
    with company_context(tenant.company.id):
        as_of = today() + dt.timedelta(days=5)
        [item] = closing.accrual(as_of)
        # Installment 1 is due and unpaid (100.00); 2 of the 7 days of
        # installment 2 have run (28.57).
        assert (item.amount, item.days_past_due) == (D("128.57"), 2)


def test_loans_over_90_days_late_do_not_accrue(tenant) -> None:
    make_loan(tenant, first_due_in=-100)
    with company_context(tenant.company.id):
        assert closing.accrual(today()) == []


def test_closing_a_month_locks_it_and_reopening_cancels_its_accrual(
    tenant, django_capture_on_commit_callbacks
) -> None:
    month_end = last_month_end()
    year, month = month_end.year, month_end.month
    manager = tenant.users["gerente"]
    with company_context(tenant.company.id):
        ledger.capital_movement(
            account=tenant.cash,
            amount=D("1000"),
            increase=True,
            branch=tenant.branch,
            on=month_end,
            note="Aporte del mes pasado",
            created_by=manager,
        )
    session = open_cash(tenant, amount="100")
    with company_context(tenant.company.id):
        CashSession.objects.filter(pk=session.pk).update(business_date=month_end)
    # A drawer of that month still open blocks the close, with the reason.
    refused = tenant.client("gerente").post(f"/api/v1/contabilidad/cierre/{year}/{month}/cerrar/")
    assert refused.status_code == 400
    assert "cajas" in refused.json()["detail"]
    assert any(not c["ok"] for c in refused.json()["checklist"]["checks"])
    with company_context(tenant.company.id):
        cash.close_session(session=session, user=tenant.users["cajero"], counts={"100": 1})
    assert (
        tenant.client("contabilidad")
        .post(f"/api/v1/contabilidad/cierre/{year}/{month}/cerrar/")
        .status_code
        == 403
    )
    with django_capture_on_commit_callbacks(execute=True):
        closed = tenant.client("gerente").post(
            f"/api/v1/contabilidad/cierre/{year}/{month}/cerrar/"
        )
    assert closed.status_code == 200, closed.content
    assert closed.json()["status"] == "closed"
    with company_context(tenant.company.id):
        period = AccountingPeriod.objects.get(year=year, month=month)
        assert GeneratedDocument.objects.filter(target_id=period.pk, kind="month_close").exists()
        with pytest.raises(accounting.AccountingError, match="cerrado"):
            ledger.capital_movement(
                account=tenant.cash,
                amount=D("1"),
                increase=True,
                branch=tenant.branch,
                on=month_end,
                note="Tarde",
                created_by=manager,
            )
    pdf = tenant.client("auditoria").get(f"/api/v1/contabilidad/cierre/{year}/{month}/pdf/")
    assert pdf.status_code == 200
    # Reopening needs a reason and leaves the books as before the close.
    assert (
        tenant.client("gerente")
        .post(f"/api/v1/contabilidad/cierre/{year}/{month}/reabrir/", {}, format="json")
        .status_code
        == 400
    )
    reopened = tenant.client("gerente").post(
        f"/api/v1/contabilidad/cierre/{year}/{month}/reabrir/",
        {"reason": "Faltó registrar una factura"},
        format="json",
    )
    assert reopened.json()["status"] == "open"
    with company_context(tenant.company.id):
        receivable = ledger.system_account(tenant.company.id, "interest_receivable")
        assert ledger.balance_of(receivable) == D("0.00")
        assert not accounting.is_closed(tenant.company.id, month_end)
    books_square(tenant)


def test_an_accrual_is_booked_at_month_end_and_reversed_the_next_day(tenant) -> None:
    month_end = last_month_end()
    loan = make_loan(tenant, first_due_in=-3)
    with company_context(tenant.company.id):
        # Move the loan so that, at last month's end, installment 1 is 3 days
        # late and 3 of the 7 days of installment 2 have run.
        from apps.lending.models import Installment, Loan

        Loan.objects.filter(pk=loan.pk).update(disbursed_on=month_end - dt.timedelta(days=10))
        for inst in Installment.objects.filter(loan=loan).order_by("number"):
            due = month_end - dt.timedelta(days=3) + dt.timedelta(days=7 * (inst.number - 1))
            Installment.objects.filter(pk=inst.pk).update(due_date=due)
        [item] = closing.accrual(month_end)
        assert item.amount == D("142.86")  # 100.00 + 100.00 x 3/7
        period = closing.close_month(
            year=month_end.year, month=month_end.month, user=tenant.users["gerente"]
        )
        assert period.checklist["accrual"]["total"] == "142.86"
        accrual = JournalEntry.objects.get(source_type="ledger.accrual", reversal_of__isnull=True)
        assert accrual.date == month_end
        assert accrual.reversed_by.date == month_end + dt.timedelta(days=1)
        statement = accounting.income_statement(month_end.replace(day=1), month_end)
        assert {a.system_key: v for a, v in statement.income.rows}["interest_income"] == D("142.86")
        receivable = ledger.system_account(tenant.company.id, "interest_receivable")
        assert ledger.balance_of(receivable) == D("0.00")  # today, after the reversal
