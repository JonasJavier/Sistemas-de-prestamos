"""Phase 8 · doc 09 «Legales»: the contract of each kind of asset in
guarantee, with the asset described from Garantías (decision 096)."""

import io
import zipfile
from decimal import Decimal

from apps.core.tenancy import company_context
from apps.customers.models import Collateral, PropertyDetail, VehicleDetail
from apps.lending.tests.test_disbursement import FIJA, _disburse
from apps.payments.tests.test_payments import make_loan

D = Decimal


def pledged_loan(tenant) -> str:
    with company_context(tenant.company.id):
        car = Collateral.objects.create(
            company=tenant.company,
            owner=tenant.customer,
            type=Collateral.Type.VEHICLE,
            description="Honda Civic 2020",
            appraised_value=D("900000"),
        )
        VehicleDetail.objects.create(
            company=tenant.company,
            collateral=car,
            brand="Honda",
            model="Civic",
            year=2020,
            plate="A123456",
            chassis="2HGFC2F59LH000001",
        )
        house = Collateral.objects.create(
            company=tenant.company,
            owner=tenant.customer,
            type=Collateral.Type.PROPERTY,
            description="Casa en Los Jardines",
            appraised_value=D("4500000"),
        )
        PropertyDetail.objects.create(
            company=tenant.company,
            collateral=house,
            title_number="0100123456",
            cadastral_designation="Parcela 123, DC 4",
            location="Santiago",
        )
    product = tenant.product(FIJA)
    officer = tenant.client("oficial")
    app_id = officer.post(
        "/api/v1/solicitudes/",
        {
            "customer": str(tenant.customer.id),
            "product": str(product.id),
            "amount": "20000",
            "frequency": "monthly",
            "installments": 6,
            "rate": "0.05",
        },
        format="json",
    ).json()["id"]
    for asset in (car, house):
        officer.post(
            "/api/v1/solicitud-garantias/",
            {"application": app_id, "collateral": str(asset.id)},
            format="json",
        )
    for req in officer.get(f"/api/v1/solicitud-requisitos/?application={app_id}").json():
        officer.post(f"/api/v1/solicitud-requisitos/{req['id']}/verificar/")
    officer.post(f"/api/v1/solicitudes/{app_id}/enviar/")
    tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    return _disburse(tenant, app_id).json()["loan"]


def test_each_asset_brings_its_contract_with_the_real_description(tenant) -> None:
    number = pledged_loan(tenant)
    manager = tenant.client("gerente")
    documents = manager.get(f"/api/v1/prestamos/{number}/documentos/").json()["documents"]
    kinds = [doc["kind"] for doc in documents]
    assert {"pledge_contract", "mortgage_contract"} <= set(kinds)
    contract = next(doc for doc in documents if doc["kind"] == "pledge_contract")
    assert contract["legal_status"] == "reviewed"  # decision 127
    pdf = manager.get(f"/api/v1/prestamos/{number}/documentos/{contract['id']}/")
    assert b"".join(pdf.streaming_content).startswith(b"%PDF")
    editable = manager.get(f"/api/v1/prestamos/{number}/contratos/pledge_contract/docx/")
    assert editable.status_code == 200
    with zipfile.ZipFile(io.BytesIO(editable.content)) as archive:
        body = archive.read("word/document.xml").decode()
    assert "placa A123456" in body and "chasis 2HGFC2F59LH000001" in body
    # Decision 127: Ley 45-20 (SEGM, extrajudicial execution) and the credit conditions.
    assert "GARANTÍA MOBILIARIA SOBRE VEHÍCULO" in body and "(SEGM)" in body
    assert "Ley 358-05, artículo 55" in body and "Ley 172-13" in body
    mortgage = manager.get(f"/api/v1/prestamos/{number}/contratos/mortgage_contract/docx/")
    with zipfile.ZipFile(io.BytesIO(mortgage.content)) as archive:
        body = archive.read("word/document.xml").decode()
    assert "designación catastral Parcela 123, DC 4" in body
    assert "Ley 108-05" in body and "Registro de Títulos" in body
    # Issued once: listing again does not issue them twice.
    again = manager.get(f"/api/v1/prestamos/{number}/documentos/").json()["documents"]
    assert len(again) == len(documents)


def test_no_asset_no_contract(tenant) -> None:
    loan = make_loan(tenant, first_due_in=5)
    manager = tenant.client("gerente")
    documents = manager.get(f"/api/v1/prestamos/{loan.number}/documentos/").json()["documents"]
    assert not {"pledge_contract", "mortgage_contract"} & {doc["kind"] for doc in documents}
    missing = manager.get(f"/api/v1/prestamos/{loan.number}/contratos/pledge_contract/docx/")
    assert missing.status_code == 400 and missing.json()["code"] == "collateral"
