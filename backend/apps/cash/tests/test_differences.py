"""Resolving cash differences (decision 075, doc 03 §16.1)."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.cash import differences
from apps.cash import services as cash
from apps.cash.models import CashDifference
from apps.conftest import open_cash
from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.ledger import services as ledger
from apps.ledger.reconciliation import check
from apps.lending.models import Loan
from apps.payments.tests.test_payments import books_square, make_loan, pay

D = Decimal


def balance(tenant, key: str) -> Decimal:
    with company_context(tenant.company.id):
        return ledger.balance_of(ledger.system_account(tenant.company.id, key))


def _reason(tenant):
    with company_context(tenant.company.id):
        return Reason.objects.filter(kind=Reason.Kind.CASH_DIFFERENCE).first()


def test_a_shortage_is_repaid_in_part_and_the_rest_taken_as_a_loss(tenant) -> None:
    session = open_cash(tenant, amount="1000")
    with company_context(tenant.company.id):
        cash.close_session(
            session=session,
            user=tenant.users["cajero"],
            counts={"500": 1, "200": 2, "50": 1},  # 950 of 1,000
            reason=_reason(tenant),
            note="No aparece",
        )
        shortage = CashDifference.objects.get()
        assert (shortage.kind, shortage.amount, shortage.person) == (
            "shortage",
            D("50.00"),
            tenant.users["cajero"],
        )
    assert balance(tenant, "cash_shortage") == D("50.00")
    # The cashier repays 20 into the drawer he opens the next day.
    next_session = open_cash(tenant, amount="0")
    repaid = tenant.client("cajero").post(
        f"/api/v1/diferencias-caja/{shortage.id}/reponer/", {"amount": "20"}, format="json"
    )
    assert repaid.json()["outstanding"] == "30.00", repaid.content
    with company_context(tenant.company.id):
        assert cash.expected_cash(next_session) == D("970.00")  # 950 carried + 20 repaid
    assert (
        tenant.client("cajero")
        .post(f"/api/v1/diferencias-caja/{shortage.id}/perdida/", {"note": "x"}, format="json")
        .status_code
        == 403
    )
    loss = tenant.client("gerente").post(
        f"/api/v1/diferencias-caja/{shortage.id}/perdida/",
        {"note": "Error de conteo comprobado"},
        format="json",
    )
    assert loss.json()["status"] == "resolved"
    assert balance(tenant, "cash_shortage") == D("0.00")
    assert balance(tenant, "cash_shortage_loss") == D("30.00")
    with company_context(tenant.company.id):
        assert check(tenant.company.id) == []
    books_square(tenant)


def test_an_overage_waits_for_its_owner_then_becomes_income(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=loan.pk).update(collector=tenant.users["cobrador"])
        collector = tenant.users["cobrador"]
        collector.location_consent_at = timezone.now()
        collector.save()
        route = cash.open_route(user=collector, branch=tenant.branch)
    pay(tenant, loan, "350.00", role="cobrador")
    open_cash(tenant)
    with company_context(tenant.company.id):
        cash.settle_route(
            route=route,
            user=tenant.users["cajero"],
            delivered=D("390"),
            reason=_reason(tenant),
            note="Un cliente no esperó el cambio",
        )
        overage = CashDifference.objects.get(kind="overage")
    assert balance(tenant, "cash_overage_pending") == D("40.00")
    assert balance(tenant, "cash_overage") == D("0.00")  # not income yet
    # The collector sees his own; the supervisor applies part from her drawer.
    mine = tenant.client("cobrador").get("/api/v1/diferencias-caja/").json()
    assert [d["id"] for d in mine] == [str(overage.id)] and mine[0]["is_mine"]
    open_cash(tenant, role="supervisor", amount="500")
    applied = tenant.client("supervisor").post(
        f"/api/v1/diferencias-caja/{overage.id}/aplicar/",
        {"amount": "15", "note": "Devuelto a Juan Pérez"},
        format="json",
    )
    assert applied.json()["outstanding"] == "25.00", applied.content
    with company_context(tenant.company.id):
        result = differences.nightly(overage.occurred_on + dt.timedelta(days=31))
        assert result["overages_to_income"] == 1
        overage.refresh_from_db()
        assert overage.status == "resolved"
        assert check(tenant.company.id) == []
    assert balance(tenant, "cash_overage") == D("25.00")
    assert balance(tenant, "cash_overage_pending") == D("0.00")
    books_square(tenant)


def test_old_shortages_warn_the_managers_once(tenant) -> None:
    session = open_cash(tenant, amount="100")
    with company_context(tenant.company.id):
        cash.close_session(
            session=session,
            user=tenant.users["cajero"],
            counts={"50": 1},
            reason=_reason(tenant),
            note="Faltan 50",
        )
        later = timezone.localdate() + dt.timedelta(days=31)
        assert differences.nightly(later)["shortages_warned"] == 1
        assert differences.nightly(later)["shortages_warned"] == 0
