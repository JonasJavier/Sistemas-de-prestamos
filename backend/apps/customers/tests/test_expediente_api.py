import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.audit.models import SensitiveAccessLog
from apps.core.models import Branch
from apps.core.tenancy import company_context
from apps.platform.services import RegistrationResult, register_company

PDF_BYTES = b"%PDF-1.4 fake-but-valid-magic\n%%EOF"


@pytest.fixture
def tenant(db) -> RegistrationResult:
    return register_company(
        legal_name="Financiera Uno SRL",
        admin_email="gerente@uno.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Gina",
        admin_last_name="Rodríguez",
    )


@pytest.fixture
def client(tenant: RegistrationResult) -> APIClient:
    api = APIClient()
    api.force_login(tenant.admin)
    return api


@pytest.fixture
def customer_id(client: APIClient, tenant: RegistrationResult) -> str:
    with company_context(tenant.company.id):
        branch_id = str(Branch.objects.get().id)
    response = client.post(
        "/api/v1/clientes/",
        {
            "kind": "person",
            "document_type": "cedula",
            "document_number": "001-1234567-3",
            "first_name": "José",
            "last_name": "Pérez",
            "phone": "809-555-0001",
            "home_branch": branch_id,
        },
        format="json",
    )
    assert response.status_code == 201, response.content
    return response.json()["id"]


def test_employment_upsert(client: APIClient, customer_id: str) -> None:
    assert client.get(f"/api/v1/clientes/{customer_id}/empleo/").status_code == 404
    response = client.put(
        f"/api/v1/clientes/{customer_id}/empleo/",
        {"employer": "Ferretería El Clavo", "monthly_salary": "35000.00"},
        format="json",
    )
    assert response.status_code == 200, response.content
    # Second PUT updates, not duplicates.
    response = client.put(
        f"/api/v1/clientes/{customer_id}/empleo/",
        {"employer": "Ferretería El Clavo", "monthly_salary": "40000.00"},
        format="json",
    )
    assert response.status_code == 200
    assert client.get(f"/api/v1/clientes/{customer_id}/empleo/").json()[
        "monthly_salary"
    ] == "40000.00"


def test_business_upsert(client: APIClient, customer_id: str) -> None:
    response = client.put(
        f"/api/v1/clientes/{customer_id}/negocio/",
        {"name": "Colmado Doña Tata", "monthly_sales": "90000.00", "monthly_expenses": "60000.00"},
        format="json",
    )
    assert response.status_code == 200, response.content


def test_relatives_crud(client: APIClient, customer_id: str) -> None:
    created = client.post(
        "/api/v1/familiares/",
        {"customer": customer_id, "name": "Ana Pérez", "relationship": "Madre"},
        format="json",
    )
    assert created.status_code == 201, created.content
    listing = client.get("/api/v1/familiares/", {"customer": customer_id})
    assert listing.json()["count"] == 1
    assert (
        client.delete(f"/api/v1/familiares/{created.json()['id']}/").status_code == 204
    )


def test_reference_verification_trail(
    client: APIClient, customer_id: str, tenant: RegistrationResult
) -> None:
    created = client.post(
        "/api/v1/referencias/",
        {"customer": customer_id, "name": "Pedro Gómez", "phone": "809-555-0100"},
        format="json",
    )
    assert created.status_code == 201, created.content
    verified = client.post(
        f"/api/v1/referencias/{created.json()['id']}/verify/",
        {"result": "Contactado: da buenas referencias"},
        format="json",
    )
    assert verified.status_code == 200
    data = verified.json()
    assert data["verified_by_email"] == tenant.admin.email
    assert data["verified_at"] is not None


def test_file_upload_download_and_audit(
    client: APIClient, customer_id: str, tenant: RegistrationResult
) -> None:
    def audit_count() -> int:
        with company_context(tenant.company.id):  # the log table is RLS-protected too
            return SensitiveAccessLog.objects.count()

    upload = client.post(
        "/api/v1/archivos/",
        {
            "customer": customer_id,
            "kind": "id_front",
            "file": SimpleUploadedFile("cedula.pdf", PDF_BYTES, content_type="application/pdf"),
        },
        format="multipart",
    )
    assert upload.status_code == 201, upload.content
    file_id = upload.json()["id"]
    assert upload.json()["content_type"] == "application/pdf"

    download = client.get(f"/api/v1/archivos/{file_id}/download/")
    assert download.status_code == 200
    assert b"".join(download.streaming_content) == PDF_BYTES
    assert audit_count() == 1  # the download was logged

    link = client.post(f"/api/v1/archivos/{file_id}/link/")
    assert link.status_code == 200
    url = link.json()["url"]
    assert "/api/v1/archivos/descarga/" in url
    signed = client.get(url.replace("http://testserver", ""))
    assert signed.status_code == 200
    assert audit_count() == 2

    tampered = client.get("/api/v1/archivos/descarga/esto-no-es-un-token/")
    assert tampered.status_code == 404


def test_file_type_and_size_limits(client: APIClient, customer_id: str) -> None:
    bad = client.post(
        "/api/v1/archivos/",
        {
            "customer": customer_id,
            "kind": "other",
            "file": SimpleUploadedFile("virus.exe", b"MZ\x90\x00", content_type="application/pdf"),
        },
        format="multipart",
    )
    assert bad.status_code == 400
    assert "PDF" in str(bad.json()["file"])


def test_vehicle_collateral_requires_detail(client: APIClient, customer_id: str) -> None:
    missing = client.post(
        "/api/v1/garantias/",
        {"owner": customer_id, "type": "vehicle", "description": "Yamaha FZ"},
        format="json",
    )
    assert missing.status_code == 400
    created = client.post(
        "/api/v1/garantias/",
        {
            "owner": customer_id,
            "type": "vehicle",
            "description": "Yamaha FZ 2022",
            "appraised_value": "185000.00",
            "vehicle": {"brand": "Yamaha", "model": "FZ", "year": 2022, "plate": "K1234567"},
        },
        format="json",
    )
    assert created.status_code == 201, created.content
    assert created.json()["vehicle"]["brand"] == "Yamaha"
    assert created.json()["status"] == "registered"


def test_expediente_is_company_scoped(client: APIClient, customer_id: str, db) -> None:
    other = register_company(
        legal_name="Financiera Dos SRL",
        admin_email="gerente@dos.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Luis",
        admin_last_name="Santana",
    )
    intruder = APIClient()
    intruder.force_login(other.admin)
    # A foreign customer id is invisible: related creates fail validation.
    response = intruder.post(
        "/api/v1/familiares/",
        {"customer": customer_id, "name": "X", "relationship": "Primo"},
        format="json",
    )
    assert response.status_code == 400
    assert intruder.get(f"/api/v1/clientes/{customer_id}/empleo/").status_code == 404


def test_global_search_finds_customers(client: APIClient, customer_id: str) -> None:
    response = client.get("/api/v1/buscar/", {"q": "jose"})
    assert response.status_code == 200
    results = response.json()["customers"]
    assert len(results) == 1
    assert results[0]["id"] == customer_id
