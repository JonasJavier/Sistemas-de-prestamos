"""Phase 7 · PT4 and PT2: support access (read-only, visible, audited) and
the platform's aggregated dashboard (decisions 046 and 091)."""

import datetime as dt

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.audit.models import SensitiveAccessLog
from apps.core.tenancy import company_context
from apps.notifications.models import Notification
from apps.payments.tests.test_payments import make_loan
from apps.platform.models import SupportAccessGrant


@pytest.fixture
def owner(db) -> APIClient:
    client = APIClient()
    client.force_login(User.objects.create_superuser("jonas@cobradia.com", "una-clave-larga-123"))
    return client


def grant(owner, tenant, **data):
    body = {"reason": "Ayuda con el cierre de mes", "hours": 72, **data}
    return owner.post(
        f"/api/v1/plataforma/empresas/{tenant.company.id}/soporte/", body, format="json"
    )


def test_a_grant_needs_a_reason_and_tells_the_company(owner, tenant) -> None:
    assert grant(owner, tenant, reason="").status_code == 400
    assert grant(owner, tenant, hours=500).status_code == 400
    created = grant(owner, tenant)
    assert created.status_code == 201, created.content
    assert created.json()["active"] is True
    with company_context(tenant.company.id):
        assert Notification.objects.filter(
            user=tenant.users["gerente"], kind=Notification.Kind.SUPPORT_ACCESS
        ).exists()
    manager = tenant.client("gerente")
    assert (
        manager.post(
            f"/api/v1/plataforma/empresas/{tenant.company.id}/soporte/",
            {"reason": "x"},
            format="json",
        ).status_code
        == 403
    )


def test_support_reads_with_the_audit_lens_and_never_writes(owner, tenant) -> None:
    make_loan(tenant, first_due_in=3)
    # Without a grant the owner sees nothing of the company.
    assert owner.get("/api/v1/yo/").json()["company_id"] is None
    access = grant(owner, tenant).json()
    assert owner.post(f"/api/v1/plataforma/soporte/{access['id']}/entrar/").status_code == 200

    me = owner.get("/api/v1/yo/").json()
    assert me["company_id"] == str(tenant.company.id)
    assert me["roles"] == ["Auditoría"] and me["support"]["grant"] == access["id"]
    assert me["is_manager"] is False
    loans = owner.get("/api/v1/prestamos/")
    assert loans.status_code == 200 and loans.json()["count"] == 1
    assert owner.get("/api/v1/reportes/cartera/").status_code == 200

    refused = owner.post("/api/v1/gastos/", {"amount": "100"}, format="json")
    assert refused.status_code == 403 and refused.json()["code"] == "support_read_only"
    assert owner.patch("/api/v1/ajustes/empresa/", {}, format="json").status_code == 403

    with company_context(tenant.company.id):
        reads = list(
            SensitiveAccessLog.objects.filter(
                action=SensitiveAccessLog.Action.SUPPORT_READ
            ).values_list("detail", flat=True)
        )
    assert "/api/v1/prestamos/" in reads and "/api/v1/yo/" not in reads

    # The company sees it all and revokes; the owner is out at once.
    seen = tenant.client("gerente").get("/api/v1/ajustes/soporte/").json()
    assert seen["active"]["id"] == access["id"]
    assert any(r["path"] == "/api/v1/prestamos/" for r in seen["reads"])
    revoked = tenant.client("gerente").post(f"/api/v1/ajustes/soporte/{access['id']}/revocar/")
    assert revoked.status_code == 200 and revoked.json()["active"] is False
    after = owner.get("/api/v1/yo/").json()
    assert after["support"] is None and after["company_id"] is None


def test_leaving_and_expired_grants(owner, tenant) -> None:
    access = grant(owner, tenant).json()
    owner.post(f"/api/v1/plataforma/soporte/{access['id']}/entrar/")
    assert owner.post("/api/v1/plataforma/soporte/salir/").status_code == 204
    assert owner.get("/api/v1/yo/").json()["support"] is None

    SupportAccessGrant.objects.filter(pk=access["id"]).update(
        ends_at=timezone.now() - dt.timedelta(minutes=1)
    )
    entered = owner.post(f"/api/v1/plataforma/soporte/{access['id']}/entrar/")
    assert entered.status_code == 400 and entered.json()["code"] == "ended"


def test_a_tenant_user_never_enters_support(owner, tenant, other_tenant) -> None:
    access = grant(owner, tenant).json()
    stranger = other_tenant.client("gerente")
    assert stranger.post(f"/api/v1/plataforma/soporte/{access['id']}/entrar/").status_code == 403
    assert stranger.get("/api/v1/ajustes/soporte/").json()["active"] is None
    assert stranger.post(f"/api/v1/ajustes/soporte/{access['id']}/revocar/").status_code == 404


def test_the_platform_dashboard_counts_without_company_data(owner, tenant, other_tenant) -> None:
    make_loan(tenant, first_due_in=3)
    data = owner.get("/api/v1/plataforma/tablero/").json()
    assert data["companies"]["trial"] == 2
    rows = {row["name"]: row for row in data["usage"]["rows"]}
    assert rows["Financiera Uno SRL"]["active_loans"] == 1
    assert rows["Financiera Dos SRL"]["active_loans"] == 0
    assert set(rows["Financiera Uno SRL"]) == {
        "id",
        "name",
        "users",
        "active_users",
        "active_loans",
        "payments",
    }
    assert tenant.client("gerente").get("/api/v1/plataforma/tablero/").status_code == 403
