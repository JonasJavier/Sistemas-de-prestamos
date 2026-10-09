"""Phase 7 · P62: the explainable classification A–D (decision 088)."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.core.tenancy import company_context
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import make_loan
from apps.reports import scoring
from apps.reports.models import CustomerScore
from apps.reports.scoring import Facts, Installment, compute

D = Decimal
TODAY = dt.date(2026, 10, 9)


def on(days_ago: int) -> dt.date:
    return TODAY - dt.timedelta(days=days_ago)


def points(result) -> dict:
    return {f["key"]: f.get("points") for f in result.factors}


def test_no_installment_due_means_no_grade() -> None:
    facts = Facts(installments=[Installment(on(-5), None, 3)], first_disbursed_on=on(10))
    result = compute(facts, TODAY)
    assert (result.score, result.grade) == (None, "")


def test_a_punctual_long_standing_customer_is_a() -> None:
    facts = Facts(
        installments=[Installment(on(d), on(d), 3) for d in (120, 90, 60, 30)],
        first_disbursed_on=on(800),
        paid_off_loans=3,
    )
    result = compute(facts, TODAY)
    assert (result.score, result.grade) == (D("100.0"), "A")


def test_a_short_history_stays_between_b_and_c() -> None:
    punctual = Facts(
        installments=[Installment(on(30), on(30), 3)], first_disbursed_on=on(800), paid_off_loans=3
    )
    assert compute(punctual, TODAY).grade == "B"
    late_once = Facts(installments=[Installment(on(10), on(4), 3)], first_disbursed_on=on(40))
    result = compute(late_once, TODAY)
    assert result.score < 50 and result.grade == "C"
    assert any(f["key"] == "short" for f in result.factors)


def test_each_factor_shows_its_points() -> None:
    facts = Facts(
        installments=[
            Installment(on(60), on(60), 3),  # on time
            Installment(on(30), on(20), 3),  # 10 days late: beyond the grace
        ],
        first_disbursed_on=TODAY.replace(month=4),
    )
    result = compute(facts, TODAY)
    assert points(result) == {
        "punctuality": D("25.0"),  # 1 of 2
        "days_late": D("25.0"),  # 5 days on average: 30 × (1 − 5/30)
        "seniority": D("2.5"),  # 6 of 24 months
        "paid_off": D("0.0"),
    }
    assert (result.score, result.grade) == (D("52.5"), "C")


def test_the_grace_counts_as_on_time_and_unpaid_counts_until_today() -> None:
    graced = compute(
        Facts(installments=[Installment(on(30), on(27), 3)], first_disbursed_on=on(60)), TODAY
    )
    assert points(graced)["punctuality"] == D("50.0")
    unpaid = compute(
        Facts(installments=[Installment(on(15), None, 3)], first_disbursed_on=on(60)), TODAY
    )
    assert points(unpaid)["punctuality"] == D("0.0")
    assert points(unpaid)["days_late"] == D("15.0")  # 15 days late today


def test_caps_override_the_points() -> None:
    good = [Installment(on(d), on(d), 3) for d in (120, 90, 60, 30)]
    base = {"installments": good, "first_disbursed_on": on(800), "paid_off_loans": 3}
    assert compute(Facts(**base, written_off=True), TODAY).grade == "D"
    assert compute(Facts(**base, max_days_past_due=95), TODAY).grade == "D"
    capped = compute(Facts(**base, max_days_past_due=45), TODAY)
    assert capped.grade == "C" and capped.score == D("100.0")
    assert any(f["key"] == "cap" for f in capped.factors)


def test_the_nightly_grades_customers_and_the_api_explains(tenant, other_tenant) -> None:
    make_loan(tenant, first_due_in=-35)
    with company_context(tenant.company.id):
        run_nightly(tenant.company.id, timezone.localdate())
        score = CustomerScore.objects.get(customer=tenant.customer)
        assert score.grade == "D"
        CustomerScore.objects.filter(pk=score.pk).update(grade="A")
        scoring.refresh()
        score.refresh_from_db()
        assert (score.grade, score.previous_grade) == ("D", "A")

    data = tenant.client("oficial").get("/api/v1/clasificacion/").json()
    assert data["counts"]["D"] == 1 and data["count"] == 1
    row = data["results"][0]
    assert row["customer"]["name"] == "María Gómez"
    assert {f["key"] for f in row["factors"]} >= {"punctuality", "days_late"}
    assert tenant.client("gerente").get("/api/v1/clasificacion/?grado=A").json()["count"] == 0
    assert tenant.client("gerente").get("/api/v1/clasificacion/?grado=Z").status_code == 400

    detail = tenant.client("oficial").get(f"/api/v1/clientes/{tenant.customer.id}/").json()
    assert detail["classification"]["grade"] == "D"

    assert tenant.client("cobrador").get("/api/v1/clasificacion/").status_code == 403
    assert tenant.client("contabilidad").get("/api/v1/clasificacion/").status_code == 403
    assert other_tenant.client("gerente").get("/api/v1/clasificacion/").json()["count"] == 0

    report = tenant.client("gerente").get("/api/v1/reportes/clasificacion/datos/").json()
    assert report["rows"][0]["grade"] == "D"
    assert report["summary"][3] == {"label": "D · Riesgoso", "value": 1, "kind": "int"}
