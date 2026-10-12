"""Phase 7 · doc 09 §3: the indicators with their exact definitions, the
dashboard by role and the portfolio report (decision 086)."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.core.models import Branch, Reason
from apps.core.tenancy import company_context
from apps.payments.reversals import execute_reversal
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import FIJA, make_loan, pay
from apps.reports import indicators

D = Decimal


def today() -> dt.date:
    return timezone.localdate()


def nightly(tenant, day=None):
    with company_context(tenant.company.id):
        run_nightly(tenant.company.id, day or today())


def test_portfolio_par_and_buckets_follow_the_oldest_unpaid_installment(tenant) -> None:
    make_loan(tenant, first_due_in=3)  # current
    make_loan(tenant, first_due_in=-10)  # 10 days late
    make_loan(tenant, first_due_in=-35)  # 35 days late
    nightly(tenant)
    with company_context(tenant.company.id):
        result = indicators.portfolio(today())
    assert (result.count, result.principal) == (3, D("3000.00"))
    assert (result.par7, result.par30, result.par90) == (D("0.6667"), D("0.3333"), D("0.0000"))
    counts = {b["key"]: (b["count"], b["principal"]) for b in result.buckets}
    assert counts["al_dia"] == (1, D("1000.00"))
    assert counts["8_30"] == (1, D("1000.00"))
    assert counts["31_60"] == (1, D("1000.00"))
    assert sum(b["count"] for b in result.buckets) == result.count


def test_the_day_is_measured_from_its_start_and_reversals_subtract(tenant) -> None:
    due_today = make_loan(tenant, first_due_in=0)  # installment 1 of 350.00 due today
    make_loan(tenant, first_due_in=5)  # nothing due today
    with company_context(tenant.company.id):
        assert indicators.expected(today()) == D("350.00")
    payment = pay(tenant, due_today, "350")
    with company_context(tenant.company.id):
        # Paying does not shrink what was expected when the day began.
        day = indicators.day_collection(today())
        assert (day["collected"], day["expected"], day["recovery"]) == (
            D("350.00"),
            D("350.00"),
            D("1.0000"),
        )
        execute_reversal(
            payment=payment,
            requested_by=tenant.users["cajero"],
            authorized_by=tenant.users["supervisor"],
            reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
            note="Error de digitación",
        )
        assert indicators.collected(today()) == D("0.00")
        assert indicators.expected(today()) == D("350.00")


def test_a_promise_for_today_adds_what_is_overdue(tenant) -> None:
    late = make_loan(tenant, first_due_in=-10)  # installments 1 and 2 overdue
    with company_context(tenant.company.id):
        assert indicators.expected(today()) == D("0.00")
    response = tenant.client("oficial").post(
        f"/api/v1/prestamos/{late.number}/gestiones/",
        {
            "kind": "call",
            "result": "promised",
            "note": "",
            "promise_on": today().isoformat(),
            "promise_amount": "700",
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    with company_context(tenant.company.id):
        assert indicators.expected(today()) >= D("700.00")  # two installments plus late fees


def test_disbursed_promises_and_differences_of_the_month(tenant) -> None:
    make_loan(tenant, first_due_in=3)
    make_loan(tenant, first_due_in=3, amount="2000")
    with company_context(tenant.company.id):
        month = indicators.disbursed(today().year, today().month)
        assert (month["total"], month["count"]) == (D("3000.00"), 2)
        promises = indicators.promise_compliance(today().replace(day=1), today())
        assert promises["rate"] is None  # nothing resolved: no ratio, never a fake 0 %
        diffs = indicators.cash_differences(today().replace(day=1), today())
        assert diffs["total"] == D("0.00")


def test_the_dashboard_shows_each_role_its_sections(tenant) -> None:
    make_loan(tenant, first_due_in=-35)
    nightly(tenant)
    manager = tenant.client("gerente").get("/api/v1/tablero/").json()
    assert {"indicators", "operations", "books"} <= manager.keys()
    assert manager["indicators"]["portfolio"]["count"] == 1
    assert manager["indicators"]["portfolio"]["par30"] == "1.0000"
    assert "profit_month" in manager["indicators"]
    assert manager["scope"] == "Toda la empresa"
    assert "portfolio" in manager["definitions"]

    supervisor = tenant.client("supervisor").get("/api/v1/tablero/").json()
    assert "indicators" in supervisor and "operations" in supervisor
    assert "profit_month" not in supervisor["indicators"]  # the books are not theirs
    assert "books" not in supervisor

    accounting = tenant.client("contabilidad").get("/api/v1/tablero/").json()
    assert "books" in accounting and "operations" not in accounting
    assert accounting["books"]["accounts"][0]["balance"]

    officer = tenant.client("oficial").get("/api/v1/tablero/").json()
    assert "officer" in officer and "indicators" not in officer

    collector = tenant.client("cobrador").get("/api/v1/tablero/").json()
    assert not {"indicators", "operations", "books", "officer"} & collector.keys()


def test_branch_filter_respects_the_scope(tenant) -> None:
    make_loan(tenant, first_due_in=3)
    with company_context(tenant.company.id):
        other = Branch.objects.create(company=tenant.company, code="S2", name="Santiago")
    manager = tenant.client("gerente").get(f"/api/v1/tablero/?sucursal={other.id}")
    assert manager.status_code == 200
    assert manager.json()["indicators"]["portfolio"]["count"] == 0
    assert manager.json()["scope"] == "Santiago"
    supervisor = tenant.client("supervisor").get(f"/api/v1/tablero/?sucursal={other.id}")
    assert supervisor.status_code == 404


def test_the_portfolio_report_cuts_and_reads_past_snapshots(tenant) -> None:
    make_loan(tenant, first_due_in=-10)
    make_loan(tenant, first_due_in=3, product=FIJA, amount="20000", installments=6, rate=None)
    yesterday = today() - dt.timedelta(days=1)
    nightly(tenant, yesterday)
    nightly(tenant)
    client = tenant.client("gerente")
    live = client.get("/api/v1/reportes/cartera/?corte=producto").json()
    assert live["snapshot"] is False
    assert live["totals"]["count"] == 2
    assert sorted(r["count"] for r in live["rows"]) == [1, 1]
    assert sum(D(r["principal"]) for r in live["rows"]) == D(live["totals"]["principal"])

    by_collector = client.get("/api/v1/reportes/cartera/?corte=cobrador").json()
    assert by_collector["rows"][0]["count"] == 2

    past = client.get(f"/api/v1/reportes/cartera/?fecha={yesterday.isoformat()}").json()
    assert past["snapshot"] is True
    assert past["missing_snapshot"] is False
    assert past["totals"]["count"] == 2
    # A night with no photo says so instead of reading as an empty portfolio.
    before = (yesterday - dt.timedelta(days=30)).isoformat()
    assert client.get(f"/api/v1/reportes/cartera/?fecha={before}").json()["missing_snapshot"]
    assert live["missing_snapshot"] is False

    assert client.get("/api/v1/reportes/cartera/?corte=color").status_code == 400
    assert tenant.client("cobrador").get("/api/v1/reportes/cartera/").status_code == 403
    assert tenant.client("oficial").get("/api/v1/reportes/cartera/").status_code == 403


def test_indicators_never_cross_companies(tenant, other_tenant) -> None:
    make_loan(tenant, first_due_in=-35)
    nightly(tenant)
    theirs = other_tenant.client("gerente").get("/api/v1/tablero/").json()
    assert theirs["indicators"]["portfolio"]["count"] == 0
    assert theirs["indicators"]["disbursed_month"]["count"] == 0
    report = other_tenant.client("gerente").get("/api/v1/reportes/cartera/").json()
    assert report["totals"]["count"] == 0
    response = other_tenant.client("gerente").get(f"/api/v1/tablero/?sucursal={tenant.branch.id}")
    assert response.status_code == 404


def test_origins_split_the_day_between_routes_and_the_office(tenant) -> None:
    """Decision 114: each route against its stops, the office with the rest,
    and the rows add up to the figure of the day."""
    from apps.cash.tests.test_cash import _route
    from apps.collections.models import RouteStop
    from apps.lending.models import Loan

    on_route = make_loan(tenant, first_due_in=0)
    at_office = make_loan(tenant, first_due_in=0)
    collector = tenant.users["cobrador"]
    with company_context(tenant.company.id):
        Loan.objects.filter(pk=on_route.pk).update(collector=collector)
        RouteStop.objects.create(
            company=tenant.company,
            collector=collector,
            date=today(),
            loan=on_route,
            position=1,
            reason=RouteStop.Reason.DUE_TODAY,
            amount_due=D("350.00"),
        )
    _route(tenant)
    pay(tenant, on_route, "300.00", role="cobrador")
    pay(tenant, at_office, "350.00")
    with company_context(tenant.company.id):
        rows = indicators.origins(today())
    route, office = rows
    assert (route["kind"], route["status"]) == ("route", "open")
    assert (route["collected"], route["expected"]) == (D("300.00"), D("350.00"))
    assert (office["kind"], office["collected"], office["expected"]) == (
        "office",
        D("350.00"),
        D("350.00"),
    )
    with company_context(tenant.company.id):
        day = indicators.day_collection(today())
    assert sum(r["collected"] for r in rows) == day["collected"]
    assert sum(r["expected"] for r in rows) == day["expected"]
    manager = tenant.client("gerente").get("/api/v1/tablero/").json()
    assert [o["kind"] for o in manager["indicators"]["origins"]] == ["route", "office"]
