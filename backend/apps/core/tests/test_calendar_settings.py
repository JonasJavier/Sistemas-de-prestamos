"""P75: holidays and document numbering, per company."""

import datetime as dt

from django.utils import timezone

from apps.core.holidays import seed_year
from apps.core.models import Holiday, Sequence
from apps.core.tasks import seed_next_year_holidays
from apps.core.tenancy import company_context


def test_holidays_api_is_manager_gated_and_company_scoped(tenant, other_tenant) -> None:
    year = timezone.localdate().year
    listing = tenant.client("oficial").get(f"/api/v1/feriados/?year={year}")
    assert listing.status_code == 200
    assert len(listing.json()) == 9
    created = tenant.client("gerente").post(
        "/api/v1/feriados/", {"date": f"{year}-04-03", "name": "Viernes Santo"}, format="json"
    )
    assert created.status_code == 201, created.content
    assert (
        tenant.client("oficial")
        .post(
            "/api/v1/feriados/", {"date": f"{year}-06-04", "name": "Corpus Christi"}, format="json"
        )
        .status_code
        == 403
    )
    duplicate = tenant.client("gerente").post(
        "/api/v1/feriados/", {"date": f"{year}-04-03", "name": "Otro"}, format="json"
    )
    assert duplicate.status_code == 400
    holiday_id = created.json()["id"]
    assert other_tenant.client("gerente").get(f"/api/v1/feriados/{holiday_id}/").status_code == 404


def test_movable_holidays_arrive_unconfirmed_and_can_be_confirmed(tenant) -> None:
    """Law 139-97 may move them: the company confirms each one (doc 03 - 4)."""
    year = timezone.localdate().year + 1
    with company_context(tenant.company.id):
        labor_day = Holiday.objects.get(date=dt.date(year, 5, 1))
        assert labor_day.is_confirmed is False
    response = tenant.client("gerente").patch(
        f"/api/v1/feriados/{labor_day.id}/", {"is_confirmed": True}, format="json"
    )
    assert response.json()["is_confirmed"] is True


def test_seed_year_is_idempotent_and_respects_moved_holidays(tenant) -> None:
    year = timezone.localdate().year + 2
    with company_context(tenant.company.id):
        assert seed_year(tenant.company.id, year) == 9
        moved = Holiday.objects.get(date=dt.date(year, 1, 26))
        moved.date = dt.date(year, 1, 25)  # the law moved it to Monday
        moved.is_confirmed = True
        moved.save()
        assert seed_year(tenant.company.id, year) == 0  # nothing duplicated
        assert Holiday.objects.filter(date__year=year).count() == 9
    assert (
        tenant.client("gerente")
        .post("/api/v1/feriados/sembrar/", {"year": year + 5}, format="json")
        .status_code
        == 400
    )


def test_yearly_task_seeds_every_company(tenant, other_tenant) -> None:
    # Signup already seeded this year and next; the task is a no-op for them.
    assert seed_next_year_holidays() == 0


def test_sequence_prefix_edit_keeps_numbers_unique(tenant) -> None:
    with company_context(tenant.company.id):
        from apps.core.models import Branch

        north = Branch.objects.create(company=tenant.company, code="ST", name="Santiago")
        Sequence.allocate(tenant.branch, Sequence.DocType.LOAN)
        Sequence.allocate(north, Sequence.DocType.LOAN)
        seq = Sequence.objects.get(branch=north, doc_type=Sequence.DocType.LOAN)
    api = tenant.client("gerente")
    rows = api.get("/api/v1/numeraciones/").json()
    assert {row["next_number"] for row in rows if row["doc_type"] == "loan"} == {
        "01-000002",
        "ST-000002",
    }
    clash = api.patch(f"/api/v1/numeraciones/{seq.id}/", {"prefix": "01-"}, format="json")
    assert clash.status_code == 400
    ok = api.patch(
        f"/api/v1/numeraciones/{seq.id}/",
        {"prefix": "STI-", "next_value": 1},  # the counter is read-only
        format="json",
    )
    assert ok.status_code == 200
    assert ok.json()["next_number"] == "STI-000002"
    assert tenant.client("supervisor").get("/api/v1/numeraciones/").status_code == 403
