"""F7 (cash sessions) and the settlement of F6, against the ledger."""

from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.cash import services as cash
from apps.cash.models import CashSession, RouteSession
from apps.conftest import cash_total
from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.ledger import services as ledger
from apps.lending.models import Loan
from apps.notifications.models import Notification
from apps.payments.tests.test_payments import books_square, make_loan, pay

D = Decimal


def _open(tenant, role="cajero", amount="5000"):
    with company_context(tenant.company.id):
        return cash.open_session(
            user=tenant.users[role], branch=tenant.branch, amount=D(amount), fund_from=tenant.cash
        )


def _reason(tenant):
    with company_context(tenant.company.id):
        return Reason.objects.get(kind=Reason.Kind.CASH_DIFFERENCE)


def test_open_count_close_and_approve(tenant) -> None:
    session = _open(tenant)
    assert session.number == "01-C-000001"
    with company_context(tenant.company.id):
        assert cash.expected_cash(session) == D("5000.00")
        with pytest.raises(cash.CashError, match="ya tienes|Ya tienes"):
            cash.open_session(user=tenant.users["cajero"], branch=tenant.branch)
        closed = cash.close_session(
            session=session,
            user=tenant.users["cajero"],
            counts={"2000": 2, "500": 2},
            return_to=tenant.cash,
            return_amount=D("4000"),
        )
        assert (closed.expected, closed.counted, closed.difference) == (
            D("5000.00"),
            D("5000.00"),
            D("0.00"),
        )
        assert Notification.objects.filter(kind="closing_to_approve").exists()
        with pytest.raises(cash.CashError, match="supervisor o el gerente"):
            cash.approve_session(session=closed, user=tenant.users["cajero"])
        approved = cash.approve_session(session=closed, user=tenant.users["supervisor"])
        assert approved.status == CashSession.Status.APPROVED
        # 1,000 stayed as tomorrow's fund; the next opening carries it over.
        assert ledger.balance_of(session.drawer.ledger_account) == D("1000.00")
    again = _open(tenant, amount="0")
    assert again.carried_over == D("1000.00")
    books_square(tenant)


def test_a_shortage_needs_a_reason_and_is_owed_by_the_cashier(tenant) -> None:
    session = _open(tenant)
    with company_context(tenant.company.id):
        with pytest.raises(cash.CashError, match="motivo"):
            cash.close_session(session=session, user=tenant.users["cajero"], counts={"2000": 2})
        closed = cash.close_session(
            session=session,
            user=tenant.users["cajero"],
            counts={"2000": 2},
            reason=_reason(tenant),
            note="Faltan mil, se revisará la cámara",
        )
        assert closed.difference == D("-1000.00")
        shortage = ledger.system_account(tenant.company.id, "cash_shortage")
        assert ledger.balance_of(shortage) == D("1000.00")
        # Above the supervisor's limit (RD$ 500): the manager approves it.
        with pytest.raises(cash.CashError, match="supera tu límite"):
            cash.approve_session(session=closed, user=tenant.users["supervisor"])
        cash.approve_session(session=closed, user=tenant.users["gerente"])
    books_square(tenant)


def test_nobody_approves_their_own_closing(tenant) -> None:
    session = _open(tenant, role="supervisor", amount="0")
    with company_context(tenant.company.id):
        closed = cash.close_session(session=session, user=tenant.users["supervisor"], counts={})
        with pytest.raises(cash.CashError, match="propia"):
            cash.approve_session(session=closed, user=tenant.users["supervisor"])
        cash.approve_session(session=closed, user=tenant.users["gerente"])


def test_one_open_session_per_cashier_in_the_database(tenant) -> None:
    session = _open(tenant)
    with company_context(tenant.company.id), pytest.raises(IntegrityError), transaction.atomic():
        CashSession.objects.create(
            company=tenant.company,
            number="X",
            branch=tenant.branch,
            cashier=tenant.users["cajero"],
            drawer=session.drawer,
            business_date=timezone.localdate(),
        )


def test_only_cashiers_and_supervisors_open_a_drawer(tenant) -> None:
    with company_context(tenant.company.id):
        for role in ("gerente", "oficial", "cobrador", "contabilidad"):
            with pytest.raises(cash.CashError):
                cash.open_session(user=tenant.users[role], branch=tenant.branch)


def test_drawers_move_only_through_their_sessions(tenant) -> None:
    session = _open(tenant)
    with company_context(tenant.company.id):
        with pytest.raises(ledger.LedgerError, match="sesiones"):
            ledger.transfer(
                source=session.drawer,
                target=tenant.cash,
                amount=D("10"),
                branch=tenant.branch,
                on=timezone.localdate(),
                note="",
                created_by=tenant.users["gerente"],
            )
        cash.move(
            session=session,
            user=tenant.users["cajero"],
            account=tenant.cash,
            amount=D("2000"),
            incoming=False,
            note="Depósito al banco",
        )
        assert cash.expected_cash(session) == D("3000.00")
    books_square(tenant)


# --- Routes (F6) ------------------------------------------------------------------------------


def _route(tenant):
    with company_context(tenant.company.id):
        collector = tenant.users["cobrador"]
        with pytest.raises(cash.CashError, match="ubicación"):
            cash.open_route(user=collector, branch=tenant.branch)
        collector.location_consent_at = timezone.now()
        collector.save()
        return cash.open_route(user=collector, branch=tenant.branch)


def test_route_collection_and_settlement_with_a_shortage(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=loan.pk).update(collector=tenant.users["cobrador"])
    route = _route(tenant)
    before = cash_total(tenant)
    payment = pay(tenant, loan, "350.00", role="cobrador")
    assert payment.route_session == route
    assert payment.off_route  # no stop generated for this loan today
    with company_context(tenant.company.id):
        assert cash.route_cash(route) == D("350.00")
        with pytest.raises(cash.CashError, match="no el propio"):
            cash.settle_route(route=route, user=tenant.users["cobrador"], delivered=D("350"))
        settled = cash.settle_route(
            route=route,
            user=tenant.users["cajero"],
            delivered=D("300"),
            reason=_reason(tenant),
            note="Dice que dio cambio de más",
        )
        assert (settled.expected, settled.difference) == (D("350.00"), D("-50.00"))
        assert settled.status == RouteSession.Status.SETTLED
        assert ledger.balance_of(route.bag.ledger_account) == D("0.00")
        assert Notification.objects.filter(kind="cash_difference").exists()
    assert cash_total(tenant) == before + D("300.00")
    books_square(tenant)


def test_a_collector_only_collects_his_portfolio(tenant) -> None:
    from apps.payments.services import PaymentError

    loan = make_loan(tenant, first_due_in=0)
    _route(tenant)
    with pytest.raises(PaymentError, match="tu cartera"):
        pay(tenant, loan, "350.00", role="cobrador")


def test_the_cash_limit_warns_the_supervisor_once(tenant) -> None:
    with company_context(tenant.company.id):
        tenant.company.collector_cash_limit = D("300")
        tenant.company.save()
    loan = make_loan(tenant, first_due_in=0)
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=loan.pk).update(collector=tenant.users["cobrador"])
    _route(tenant)
    pay(tenant, loan, "350.00", role="cobrador")
    pay(tenant, loan, "100.00", role="cobrador")
    with company_context(tenant.company.id):
        assert Notification.objects.filter(kind="cash_limit").values("text").distinct().count() == 1
