import pytest
from rest_framework.test import APIClient

from apps.core.models import Branch
from apps.core.tenancy import company_context
from apps.platform.services import RegistrationResult, register_company

VALID_CEDULA = "00112345673"


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
    api.force_login(tenant.admin)  # Gerente: may create customers
    return api


@pytest.fixture
def branch_id(tenant: RegistrationResult) -> str:
    with company_context(tenant.company.id):
        return str(Branch.objects.get().id)


def _person(branch_id: str, **overrides) -> dict:
    data = {
        "kind": "person",
        "document_type": "cedula",
        "document_number": "001-1234567-3",
        "first_name": "José",
        "last_name": "Pérez",
        "phone": "809-555-0001",
        "home_branch": branch_id,
    }
    data.update(overrides)
    return data


def test_create_person_normalizes_document(client: APIClient, branch_id: str) -> None:
    response = client.post("/api/v1/clientes/", _person(branch_id), format="json")
    assert response.status_code == 201, response.content
    assert response.json()["document_number"] == VALID_CEDULA


def test_invalid_cedula_is_rejected(client: APIClient, branch_id: str) -> None:
    response = client.post(
        "/api/v1/clientes/",
        _person(branch_id, document_number="00112345674"),
        format="json",
    )
    assert response.status_code == 400
    assert "document_number" in response.json()


def test_exact_duplicate_document_blocks(client: APIClient, branch_id: str) -> None:
    client.post("/api/v1/clientes/", _person(branch_id), format="json")
    response = client.post(
        "/api/v1/clientes/",
        _person(branch_id, first_name="Otro", phone="809-555-9999"),
        format="json",
    )
    assert response.status_code == 400
    assert "documento" in str(response.json()["document_number"])


def test_lookalike_warns_and_confirm_creates(client: APIClient, branch_id: str) -> None:
    client.post("/api/v1/clientes/", _person(branch_id), format="json")
    lookalike = _person(
        branch_id,
        document_number="002-1234567-2",  # different valid document
        first_name="Jose",  # same name without the accent
    )
    response = client.post("/api/v1/clientes/", lookalike, format="json")
    assert response.status_code == 409, response.content
    assert response.json()["code"] == "possible_duplicate"
    assert len(response.json()["candidates"]) == 1

    confirmed = client.post(
        "/api/v1/clientes/", {**lookalike, "confirm_duplicate": True}, format="json"
    )
    assert confirmed.status_code == 201, confirmed.content


def test_company_without_legal_name_fails(client: APIClient, branch_id: str) -> None:
    response = client.post(
        "/api/v1/clientes/",
        {
            "kind": "company",
            "document_type": "rnc",
            "document_number": "131123456",
            "phone": "809-555-0002",
            "home_branch": branch_id,
        },
        format="json",
    )
    assert response.status_code == 400
    assert "legal_name" in response.json()


def test_search_ignores_accents(client: APIClient, branch_id: str) -> None:
    client.post("/api/v1/clientes/", _person(branch_id), format="json")
    response = client.get("/api/v1/clientes/", {"q": "jose perez"})
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_customers_are_company_scoped(client: APIClient, branch_id: str, db) -> None:
    created = client.post("/api/v1/clientes/", _person(branch_id), format="json").json()
    other = register_company(
        legal_name="Financiera Dos SRL",
        admin_email="gerente@dos.do",
        admin_password="una-clave-larga-123",
        admin_first_name="Luis",
        admin_last_name="Santana",
    )
    other_client = APIClient()
    other_client.force_login(other.admin)
    assert other_client.get("/api/v1/clientes/").json()["count"] == 0
    assert other_client.get(f"/api/v1/clientes/{created['id']}/").status_code == 404


def test_block_and_unblock_with_reason(client: APIClient, branch_id: str) -> None:
    created = client.post("/api/v1/clientes/", _person(branch_id), format="json").json()
    response = client.post(
        f"/api/v1/clientes/{created['id']}/block/", {"reason": "Mora grave"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["status"] == "blocked"
    response = client.post(f"/api/v1/clientes/{created['id']}/unblock/")
    assert response.json()["status"] == "active"


def test_cashier_cannot_create_customers(tenant: RegistrationResult, branch_id: str) -> None:
    import datetime as dt

    from django.utils import timezone

    from apps.accounts import services as account_services
    from apps.accounts.models import Invitation, Role, User

    with company_context(tenant.company.id):
        role = Role.objects.get(name="Cajero")
        invitation = Invitation.objects.create(
            company=tenant.company,
            email="cajera@uno.do",
            branch_id=branch_id,
            role=role,
            token="token-cajera-prueba",
            invited_by=tenant.admin,
            expires_at=timezone.now() + dt.timedelta(days=1),
        )
    account_services.accept_invitation(
        token=invitation.token,
        first_name="Caro",
        last_name="Núñez",
        password="otra-clave-larga-456",
    )
    cashier_client = APIClient()
    cashier_client.force_login(User.objects.get(email="cajera@uno.do"))
    # Reads are allowed (doc 06 matrix), writes are not.
    assert cashier_client.get("/api/v1/clientes/").status_code == 200
    response = cashier_client.post(
        "/api/v1/clientes/", _person(branch_id, document_number="003-1234567-1"), format="json"
    )
    assert response.status_code == 403
