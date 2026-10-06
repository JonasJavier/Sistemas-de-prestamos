"""Flow F3 end to end through the API: create from the simulator's
conditions, evaluate, submit, and decide under decision 023."""

import datetime as dt
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.models import ApprovalLimit
from apps.audit.models import DomainEvent
from apps.conftest import add_user, make_customer
from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.customers.models import Collateral, Customer, Employment
from apps.lending.models import Application, ApplicationRequirement, LoanProduct
from apps.lending.tasks import expire_applications

FIJA = "Cuota Fija (mensual)"
SAN = "Personal San (semanal)"


def _create(tenant, role="oficial", **overrides):
    body = {
        "customer": str(tenant.customer.id),
        "product": str(tenant.product(FIJA).id),
        "amount": "30000",
        "frequency": "monthly",
        "installments": 12,
        "rate": "0.05",
        **overrides,
    }
    return tenant.client(role).post("/api/v1/solicitudes/", body, format="json")


def _verify_all(tenant, application_id, role="oficial"):
    api = tenant.client(role)
    for req in api.get(f"/api/v1/solicitud-requisitos/?application={application_id}").json():
        assert api.post(f"/api/v1/solicitud-requisitos/{req['id']}/verificar/").status_code == 200


def _ready(tenant, **overrides) -> str:
    """A submitted application by the officer, documents verified."""
    created = _create(tenant, **overrides)
    assert created.status_code == 201, created.content
    app_id = created.json()["id"]
    _verify_all(tenant, app_id)
    submitted = tenant.client("oficial").post(f"/api/v1/solicitudes/{app_id}/enviar/")
    assert submitted.status_code == 200, submitted.content
    return app_id


def test_create_numbers_per_branch_and_seeds_checklist_and_budget(tenant) -> None:
    with company_context(tenant.company.id):
        Employment.objects.create(
            company=tenant.company,
            customer=tenant.customer,
            employer="Claro",
            monthly_salary=Decimal("45000"),
        )
    response = _create(tenant)
    assert response.status_code == 201, response.content
    data = response.json()
    assert data["number"] == "01-S-000001"  # decision 030: branch prefix, no gaps
    assert data["status"] == "draft"
    assert data["rate_unit"] == "monthly"
    detail = tenant.client("oficial").get(f"/api/v1/solicitudes/{data['id']}/").json()
    assert [r["name"] for r in detail["requirements"]] == ["Cédula o RNC"]
    assert detail["budget_items"][0]["monthly_amount"] == "45000.00"
    assert _create(tenant).json()["number"] == "01-S-000002"


def test_conditions_must_respect_product_ranges(tenant) -> None:
    response = _create(tenant, amount="5", installments=99)
    assert response.status_code == 400
    fields = {issue["field"] for issue in response.json()["issues"]}
    assert {"amount", "installments"} <= fields


def test_only_g_su_o_create_applications(tenant) -> None:
    assert _create(tenant, role="cajero").status_code == 403
    assert _create(tenant, role="cobrador").status_code == 403
    assert _create(tenant, role="supervisor").status_code == 201


def test_evaluation_capacity_alert(tenant) -> None:
    app_id = _create(tenant).json()["id"]
    api = tenant.client("oficial")
    api.post(
        "/api/v1/solicitud-presupuesto/",
        {
            "application": app_id,
            "kind": "income",
            "description": "Sueldo",
            "monthly_amount": "20000",
        },
        format="json",
    )
    api.post(
        "/api/v1/solicitud-presupuesto/",
        {
            "application": app_id,
            "kind": "expense",
            "description": "Alquiler",
            "monthly_amount": "12000",
        },
        format="json",
    )
    evaluation = api.get(f"/api/v1/solicitudes/{app_id}/evaluacion/").json()
    # 30,000 at 5% monthly in 12 -> 3,384.76 per month over 8,000 available.
    assert evaluation["monthly_payment"] == "3384.76"
    assert evaluation["available"] == "8000.00"
    assert evaluation["capacity_ratio"] == "0.4231"
    codes = {alert["code"] for alert in evaluation["alerts"]}
    assert {"capacity_high", "requirements_pending", "bureau_missing"} <= codes


def test_submit_assigns_an_approver_who_is_not_the_creator(tenant) -> None:
    app_id = _ready(tenant)
    detail = tenant.client("oficial").get(f"/api/v1/solicitudes/{app_id}/").json()
    assert detail["status"] == "in_review"
    # 30,000 fits the supervisor's 50,000 limit: smallest sufficient limit first.
    assert detail["assigned_approver"] == str(tenant.users["supervisor"].id)


def test_large_amount_goes_to_a_manager(tenant) -> None:
    app_id = _ready(tenant, amount="80000")
    detail = tenant.client("oficial").get(f"/api/v1/solicitudes/{app_id}/").json()
    assert detail["assigned_approver"] in {
        str(tenant.users["gerente"].id),
        str(tenant.users["gerente2"].id),
    }
    # The supervisor cannot approve above 50,000 (doc 06 - section 5)...
    response = tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    assert response.status_code == 403
    assert "límite" in response.json()["detail"]
    # ...nor see it in «Por aprobar».
    tray = tenant.client("supervisor").get("/api/v1/solicitudes/?bandeja=por_aprobar").json()
    assert tray["count"] == 0
    assert (
        tenant.client("gerente").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {}).status_code
        == 200
    )


def test_nobody_approves_what_they_created(tenant) -> None:
    """Decision 023, in the API and in the database."""
    created = _create(tenant, role="supervisor")
    app_id = created.json()["id"]
    _verify_all(tenant, app_id, role="supervisor")
    assert (
        tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/enviar/").status_code == 200
    )
    detail = tenant.client("supervisor").get(f"/api/v1/solicitudes/{app_id}/").json()
    assert detail["assigned_approver"] != str(tenant.users["supervisor"].id)
    assert detail["can"]["decide"] is False
    response = tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    assert response.status_code == 403
    assert "023" in response.json()["detail"]
    # Even if code failed, the database refuses a self-decision.
    with company_context(tenant.company.id):
        application = Application.objects.get(pk=app_id)
        application.decided_by = application.created_by
        with pytest.raises(IntegrityError), transaction.atomic():
            application.save()


def test_no_eligible_approver_is_explained(tenant) -> None:
    with company_context(tenant.company.id):
        ApprovalLimit.objects.filter(operation="approve_application").delete()
    created = _create(tenant)
    _verify_all(tenant, created.json()["id"])
    response = tenant.client("oficial").post(f"/api/v1/solicitudes/{created.json()['id']}/enviar/")
    assert response.status_code == 400
    assert response.json()["code"] == "no_approver"


def test_approve_with_adjustments_sets_validity_and_records_the_change(tenant) -> None:
    app_id = _ready(tenant)
    response = tenant.client("supervisor").post(
        f"/api/v1/solicitudes/{app_id}/aprobar/",
        {"amount": "25000", "installments": 10, "note": "Monto menor por capacidad"},
        format="json",
    )
    assert response.status_code == 200, response.content
    data = response.json()
    assert data["status"] == "approved"
    assert data["approved_amount"] == "25000.00"
    assert data["approved_installments"] == 10
    assert data["amount"] == "30000.00"  # the request stays as it was asked
    assert data["valid_until"] == (timezone.localdate() + dt.timedelta(days=15)).isoformat()
    events = tenant.client("oficial").get(f"/api/v1/solicitudes/{app_id}/eventos/").json()
    approved = next(e for e in events if e["type"] == "application.approved")
    assert approved["summary"].startswith("Aprobada con ajustes")
    assert approved["data"]["amount_from"] == "30000.00"


def test_approval_requires_verified_documents_and_unblocked_customer(tenant) -> None:
    created = _create(tenant)
    app_id = created.json()["id"]
    tenant.client("oficial").post(f"/api/v1/solicitudes/{app_id}/enviar/")  # docs pending
    response = tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    assert response.status_code == 400
    assert {i["code"] for i in response.json()["issues"]} == {"requirements_pending"}

    _verify_all(tenant, app_id, role="supervisor")  # the approver may verify in review
    with company_context(tenant.company.id):
        Customer.objects.filter(pk=tenant.customer.pk).update(
            status=Customer.Status.BLOCKED, block_reason="Fraude"
        )
    response = tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    assert {i["code"] for i in response.json()["issues"]} == {"customer_blocked"}


def test_reject_needs_catalog_reason_and_note(tenant) -> None:
    app_id = _ready(tenant)
    with company_context(tenant.company.id):
        reason = Reason.objects.filter(kind=Reason.Kind.REJECTION).first()
        void_reason = Reason.objects.filter(kind=Reason.Kind.VOID).first()
    api = tenant.client("supervisor")
    bad = api.post(
        f"/api/v1/solicitudes/{app_id}/rechazar/",
        {"reason": str(void_reason.id), "note": "x"},
        format="json",
    )
    assert bad.status_code == 400
    ok = api.post(
        f"/api/v1/solicitudes/{app_id}/rechazar/",
        {"reason": str(reason.id), "note": "Ingresos no demostrados"},
        format="json",
    )
    assert ok.status_code == 200
    assert ok.json()["status"] == "rejected"
    assert ok.json()["decision_reason_text"] == reason.text


def test_return_edit_and_resubmit(tenant) -> None:
    app_id = _ready(tenant)
    api = tenant.client("supervisor")
    assert api.post(f"/api/v1/solicitudes/{app_id}/devolver/", {"note": ""}).status_code == 400
    returned = api.post(
        f"/api/v1/solicitudes/{app_id}/devolver/", {"note": "Falta el buró"}, format="json"
    )
    assert returned.json()["status"] == "returned"
    officer = tenant.client("oficial")
    edited = officer.patch(
        f"/api/v1/solicitudes/{app_id}/",
        {"bureau_provider": "datacredito", "bureau_score": 712, "bureau_date": "2026-10-01"},
        format="json",
    )
    assert edited.status_code == 200, edited.content
    assert officer.post(f"/api/v1/solicitudes/{app_id}/enviar/").json()["status"] == "in_review"


def test_in_review_applications_are_not_editable(tenant) -> None:
    app_id = _ready(tenant)
    response = tenant.client("oficial").patch(
        f"/api/v1/solicitudes/{app_id}/", {"amount": "40000"}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["code"] == "not_editable"


def test_guarantor_rules(tenant) -> None:
    app_id = _create(tenant).json()["id"]
    api = tenant.client("oficial")
    itself = api.post(
        "/api/v1/solicitud-garantes/",
        {"application": app_id, "customer": str(tenant.customer.id)},
        format="json",
    )
    assert itself.status_code == 400
    with company_context(tenant.company.id):
        guarantor = make_customer(tenant.company, tenant.branch, "00212345672", "Pedro")
    ok = api.post(
        "/api/v1/solicitud-garantes/",
        {"application": app_id, "customer": str(guarantor.id)},
        format="json",
    )
    assert ok.status_code == 201
    assert "•" in ok.json()["customer_document"]


def test_guarantor_from_another_company_does_not_exist(tenant, other_tenant) -> None:
    """Reference defect #27: a guarantor of another company is not ours."""
    app_id = _create(tenant).json()["id"]
    response = tenant.client("oficial").post(
        "/api/v1/solicitud-garantes/",
        {"application": app_id, "customer": str(other_tenant.customer.id)},
        format="json",
    )
    assert response.status_code == 400
    assert "customer" in response.json()


def test_collateral_coverage_blocks_submission(tenant) -> None:
    with company_context(tenant.company.id):
        product = LoanProduct.objects.get(name=FIJA)
        product.guarantee = LoanProduct.GuaranteeRequirement.ASSET
        product.min_coverage = Decimal("1.50")
        product.save()
        car = Collateral.objects.create(
            company=tenant.company,
            owner=tenant.customer,
            type=Collateral.Type.VEHICLE,
            description="Toyota Corolla 2018",
            appraised_value=Decimal("40000"),
        )
    app_id = _create(tenant).json()["id"]
    officer = tenant.client("oficial")
    blocked = officer.post(f"/api/v1/solicitudes/{app_id}/enviar/")
    assert {i["code"] for i in blocked.json()["issues"]} == {
        "guarantee_missing",
        "coverage_insufficient",
    }
    added = officer.post(
        "/api/v1/solicitud-garantias/",
        {"application": app_id, "collateral": str(car.id)},
        format="json",
    )
    assert added.json()["considered_value"] == "40000.00"  # defaults to the appraisal
    blocked = officer.post(f"/api/v1/solicitudes/{app_id}/enviar/")
    assert {i["code"] for i in blocked.json()["issues"]} == {"coverage_insufficient"}
    officer.patch(f"/api/v1/solicitudes/{app_id}/", {"amount": "25000"}, format="json")
    assert officer.post(f"/api/v1/solicitudes/{app_id}/enviar/").status_code == 200


def test_withdraw_and_history_is_kept(tenant) -> None:
    app_id = _create(tenant).json()["id"]
    response = tenant.client("oficial").post(
        f"/api/v1/solicitudes/{app_id}/desistir/", {"note": "Consiguió en otro lado"}
    )
    assert response.json()["status"] == "withdrawn"
    listing = (
        tenant.client("oficial").get(f"/api/v1/solicitudes/?customer={tenant.customer.id}").json()
    )
    assert listing["count"] == 1  # defect #22: processed applications never vanish


def test_approved_applications_expire_after_their_validity(tenant) -> None:
    app_id = _ready(tenant)
    tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    with company_context(tenant.company.id):
        Application.objects.filter(pk=app_id).update(
            valid_until=timezone.localdate() - dt.timedelta(days=1)
        )
    assert expire_applications() == 1
    with company_context(tenant.company.id):
        assert Application.objects.get(pk=app_id).status == "expired"
        assert DomainEvent.objects.filter(type="application.expired").exists()
    # «Si vence, se reevalúa»: it can be sent to approval again.
    assert tenant.client("oficial").post(f"/api/v1/solicitudes/{app_id}/enviar/").status_code == 200


def test_branch_scope_hides_other_branches(tenant) -> None:
    """Decision 033: an officer of branch B does not see branch A's work."""
    with company_context(tenant.company.id):
        from apps.core.models import Branch

        north = Branch.objects.create(company=tenant.company, code="ST", name="Santiago")
    outsider = add_user(tenant.reg, "oficial.st@uno.do", "Oficial de crédito", branch=north)
    app_id = _create(tenant).json()["id"]
    from rest_framework.test import APIClient

    api = APIClient()
    api.force_login(outsider)
    assert api.get(f"/api/v1/solicitudes/{app_id}/").status_code == 404
    assert api.get("/api/v1/solicitudes/").json()["count"] == 0
    # The manager sees every branch.
    assert tenant.client("gerente").get(f"/api/v1/solicitudes/{app_id}/").status_code == 200


def test_applications_are_isolated_between_companies(tenant, other_tenant) -> None:
    app_id = _create(tenant).json()["id"]
    intruder = other_tenant.client("gerente")
    assert intruder.get(f"/api/v1/solicitudes/{app_id}/").status_code == 404
    assert intruder.post(f"/api/v1/solicitudes/{app_id}/enviar/").status_code == 404
    response = intruder.post(
        "/api/v1/solicitudes/",
        {
            "customer": str(tenant.customer.id),
            "product": str(other_tenant.product(FIJA).id),
            "amount": "30000",
            "frequency": "monthly",
            "installments": 12,
        },
        format="json",
    )
    assert response.status_code == 400  # the other company's customer does not exist here


def test_requirements_follow_the_product(tenant) -> None:
    with company_context(tenant.company.id):
        product = LoanProduct.objects.get(name=SAN)
        product.required_documents = ["Cédula o RNC", "Comprobante de ingresos"]
        product.save()
    app_id = _create(
        tenant,
        product=str(tenant.product(SAN).id),
        amount="5000",
        frequency="weekly",
        installments=8,
        rate="0.10",
    ).json()["id"]
    with company_context(tenant.company.id):
        names = set(
            ApplicationRequirement.objects.filter(application_id=app_id).values_list(
                "name", flat=True
            )
        )
    assert names == {"Cédula o RNC", "Comprobante de ingresos"}
