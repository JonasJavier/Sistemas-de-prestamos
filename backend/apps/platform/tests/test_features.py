"""Decision 124: what each plan includes, enforced by the API."""

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.platform import features
from apps.platform.models import Plan, Subscription
from apps.platform.services import RegistrationResult, register_company


@pytest.fixture
def tenant(db) -> RegistrationResult:
    return register_company(
        legal_name="Financiera Uno SRL",
        admin_email="gerente@uno.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )


def _on(tenant: RegistrationResult, tier: str) -> APIClient:
    plan = Plan.objects.create(name=f"Plan {tier}", tier=tier)
    Subscription.objects.filter(company=tenant.company).update(plan=plan)
    client = APIClient()
    client.force_login(tenant.admin)
    return client


def test_the_tiers_build_on_each_other() -> None:
    assert features.features_of_tier("esencial") == set()
    assert "routes" in features.features_of_tier("profesional")
    assert "accounting" not in features.features_of_tier("profesional")
    assert features.features_of_tier("empresa") == {f.key for f in features.FEATURES}


def test_paths_map_to_features() -> None:
    assert features.feature_for_path("/api/v1/rutas/") == "routes"
    assert features.feature_for_path("/api/v1/reportes/cartera/") is None
    assert features.feature_for_path("/api/v1/reportes/atrasos/datos/") == "reports"
    assert features.feature_for_path("/api/v1/reportes/resultados/") == "accounting"
    assert features.feature_for_path("/api/v1/prestamos/P-1/castigar/") == "recovery"
    assert features.feature_for_path("/api/v1/prestamos/P-1/cobro/") is None
    assert features.feature_for_path("/api/v1/clientes/") is None
    assert features.feature_for_path("/api/v1/contabilidad/diario/") == "accounting"


def test_esencial_is_refused_the_street_and_the_books(tenant) -> None:
    client = _on(tenant, "esencial")
    assert client.get("/api/v1/clientes/").status_code == 200
    assert client.get("/api/v1/reportes/cartera/").status_code == 200
    refused = client.get("/api/v1/rutas/")
    assert refused.status_code == 403
    assert refused.json()["code"] == "plan_feature"
    assert refused.json()["tier"] == "profesional"
    assert "Profesional" in refused.json()["detail"]
    assert client.get("/api/v1/contabilidad/diario/").status_code == 403


def test_profesional_has_the_street_but_not_the_books(tenant) -> None:
    client = _on(tenant, "profesional")
    assert client.get("/api/v1/rutas/").status_code == 200
    assert client.get("/api/v1/gastos/").status_code == 200
    assert client.get("/api/v1/comprobantes/").status_code == 403


def test_the_trial_and_empresa_have_everything(tenant) -> None:
    trial = APIClient()
    trial.force_login(tenant.admin)
    assert trial.get("/api/v1/contabilidad/diario/").status_code == 200
    assert trial.get("/api/v1/yo/").json()["plan_tier"] == "empresa"
    client = _on(tenant, "empresa")
    assert client.get("/api/v1/casos-legales/").status_code == 200
    me = client.get("/api/v1/yo/").json()
    assert "legal" in me["features"] and "routes" in me["features"]


def test_yo_tells_esencial_what_it_lacks(tenant) -> None:
    client = _on(tenant, "esencial")
    me = client.get("/api/v1/yo/").json()
    assert me["plan_tier"] == "esencial"
    assert me["features"] == []


def test_seed_plans_loads_the_three_and_keeps_the_trial_full(db) -> None:
    call_command("seed_plans")
    call_command("seed_plans")  # idempotent
    rows = {p.name: p for p in Plan.objects.filter(is_trial=False)}
    assert set(rows) >= {"Esencial", "Profesional", "Empresa"}
    assert str(rows["Esencial"].monthly_price) == "990.00"
    assert rows["Esencial"].max_users == 3 and rows["Esencial"].max_active_loans is None
    assert rows["Profesional"].tier == "profesional" and rows["Profesional"].max_branches == 3
    assert rows["Empresa"].max_users is None
    assert all(p.tier == "empresa" for p in Plan.objects.filter(is_trial=True))


def test_the_plans_are_public(db) -> None:
    call_command("seed_plans")
    rows = APIClient().get("/api/v1/planes/").json()
    assert [r["name"] for r in rows] == ["Esencial", "Profesional", "Empresa"]
    assert rows[0]["features"] == []
    assert "accounting" in rows[2]["features"] and "accounting" not in rows[1]["features"]
