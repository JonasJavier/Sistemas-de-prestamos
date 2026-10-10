"""Phase 8 · F9: legal professionals, cases, costs and the legal documents
with the file's real data (decision 095)."""

from decimal import Decimal

from django.utils import timezone

from apps.core.tenancy import company_context
from apps.expenses.models import Expense
from apps.lending.models import Installment
from apps.payments.tasks import run_nightly
from apps.payments.tests.test_payments import make_loan, pay

D = Decimal


def nightly(tenant) -> None:
    with company_context(tenant.company.id):
        run_nightly(tenant.company.id, timezone.localdate())


def professional(tenant, role="gerente", **data):
    return tenant.client(role).post("/api/v1/profesionales-legales/", data, format="json")


def catalog(tenant) -> dict:
    lawyer = professional(
        tenant,
        kind="lawyer",
        name="Lic. Ramón Peña",
        license="12345-678-90",
        document="00100000001",
    ).json()
    notary = professional(
        tenant, kind="notary", name="Dra. Ana Cruz", license="NOT-555", address="Calle 1, Santiago"
    ).json()
    bailiff = professional(tenant, kind="bailiff", name="Pedro Alguacil").json()
    witness = professional(tenant, kind="witness", name="Juan Testigo", parent=lawyer["id"]).json()
    return {"lawyer": lawyer, "notary": notary, "bailiff": bailiff, "witness": witness}


def test_the_catalog_of_professionals(tenant) -> None:
    people = catalog(tenant)
    assert people["witness"]["parent"] == people["lawyer"]["id"]
    assert professional(tenant, kind="witness", name="Sin abogado").status_code == 400
    assert professional(tenant, kind="lawyer", name="Sin matrícula").json()["code"] == "license"
    assert professional(tenant, "supervisor", kind="bailiff", name="X").status_code == 403
    listed = tenant.client("auditoria").get("/api/v1/profesionales-legales/").json()
    assert len(listed) == 4


def test_the_same_professional_is_not_entered_twice(tenant) -> None:
    people = catalog(tenant)
    twin = professional(tenant, kind="lawyer", name="Lic. R. Peña", license=" 12345-678-90 ")
    assert twin.status_code == 400 and twin.json()["code"] == "license"
    assert "matrícula 12345-678-90" in twin.json()["detail"]
    same_id = professional(
        tenant, kind="lawyer", name="Otro", license="999", document="00100000001"
    ).json()
    assert same_id["code"] == "document"
    # A notary may share a lawyer's number (another registry), and editing
    # a professional keeps its own license.
    assert professional(tenant, kind="notary", name="X", license="12345-678-90").status_code == 201
    manager = tenant.client("gerente")
    edited = manager.patch(
        f"/api/v1/profesionales-legales/{people['lawyer']['id']}/",
        {"phone": "8095550000", "license": "12345-678-90"},
        format="json",
    )
    assert edited.status_code == 200, edited.content


def test_a_case_needs_real_arrears_and_its_lawyer(tenant) -> None:
    people = catalog(tenant)
    current = make_loan(tenant, first_due_in=5)
    late = make_loan(tenant, first_due_in=-40)
    nightly(tenant)
    manager = tenant.client("gerente")
    body = {"lawyer": people["lawyer"]["id"], "note": "Sin respuesta a las gestiones"}
    refused = manager.post(
        "/api/v1/casos-legales/", {**body, "loan": current.number}, format="json"
    )
    assert refused.status_code == 400 and refused.json()["code"] == "not_late"
    opened = manager.post("/api/v1/casos-legales/", {**body, "loan": late.number}, format="json")
    assert opened.status_code == 201, opened.content
    case = opened.json()
    assert case["number"].startswith("01-L-")
    again = manager.post("/api/v1/casos-legales/", {**body, "loan": late.number}, format="json")
    assert again.json()["code"] == "open"
    assert (
        tenant.client("supervisor")
        .post("/api/v1/casos-legales/", {**body, "loan": late.number}, format="json")
        .status_code
        == 403
    )
    wrong = manager.patch(
        f"/api/v1/casos-legales/{case['id']}/", {"bailiff": people["notary"]["id"]}, format="json"
    )
    assert wrong.status_code == 400
    moved = manager.patch(
        f"/api/v1/casos-legales/{case['id']}/", {"status": "execution"}, format="json"
    )
    assert moved.json()["status"] == "execution"


def test_costs_are_paid_and_charged_to_the_customer(tenant) -> None:
    people = catalog(tenant)
    loan = make_loan(tenant, first_due_in=-40)
    nightly(tenant)
    manager = tenant.client("gerente")
    case = manager.post(
        "/api/v1/casos-legales/",
        {"lawyer": people["lawyer"]["id"], "loan": loan.number},
        format="json",
    ).json()
    with company_context(tenant.company.id):
        oldest = Installment.objects.filter(loan=loan).order_by("number").first()
        before = oldest.charges_due
    added = manager.post(
        f"/api/v1/casos-legales/{case['id']}/costas/",
        {
            "description": "Honorarios de la intimación",
            "amount": "1500",
            "account": str(tenant.cash.id),
            "charge_customer": True,
        },
        format="json",
    )
    assert added.status_code == 201, added.content
    with company_context(tenant.company.id):
        assert Expense.objects.filter(amount=D("1500.00")).exists()
        oldest.refresh_from_db()
        assert oldest.charges_due == before + D("1500.00")
    detail = manager.get(f"/api/v1/casos-legales/{case['id']}/").json()
    assert detail["costs"][0] == {
        **detail["costs"][0],
        "amount": "1500.00",
        "paid": True,
        "charged": True,
    }
    # The customer pays it like any charge (first in the allocation order).
    payment = pay(tenant, loan, "1500")
    with company_context(tenant.company.id):
        assert payment.allocations.filter(component="charges").exists()


def test_legal_documents_use_the_real_data(tenant) -> None:
    people = catalog(tenant)
    loan = make_loan(tenant, first_due_in=-40)
    nightly(tenant)
    manager = tenant.client("gerente")
    case = manager.post(
        "/api/v1/casos-legales/",
        {"lawyer": people["lawyer"]["id"], "loan": loan.number},
        format="json",
    ).json()
    url = f"/api/v1/casos-legales/{case['id']}/documentos"
    notice = manager.post(f"{url}/demand_notice/")
    assert notice.status_code == 201, notice.content
    pdf = manager.get(f"{url}/archivo/?id={notice.json()['id']}")
    assert pdf.content.startswith(b"%PDF")
    assert manager.post(f"{url}/payment_order/").json()["code"] == "bailiff"
    assert manager.post(f"{url}/voluntary_surrender/").json()["code"] == "collateral"
    assert manager.post(f"{url}/notarial_note/").json()["code"] == "notary"
    manager.patch(
        f"/api/v1/casos-legales/{case['id']}/",
        {"bailiff": people["bailiff"]["id"], "notary": people["notary"]["id"]},
        format="json",
    )
    assert manager.post(f"{url}/payment_order/").status_code == 201
    assert manager.post(f"{url}/notarial_note/").status_code == 201
    editable = manager.get(f"{url}/notarial_note/")
    assert editable.status_code == 200 and editable.content.startswith(b"PK")  # a .docx
    detail = manager.get(f"/api/v1/casos-legales/{case['id']}/").json()
    assert [d["kind"] for d in detail["documents"]] == [
        "demand_notice",
        "payment_order",
        "notarial_note",
    ]
    assert all(d["legal_status"] == "pending" for d in detail["documents"])
    assert D(detail["exigible"]) > 0


def test_closing_a_case_and_isolation(tenant, other_tenant) -> None:
    people = catalog(tenant)
    loan = make_loan(tenant, first_due_in=-40)
    nightly(tenant)
    manager = tenant.client("gerente")
    case = manager.post(
        "/api/v1/casos-legales/",
        {"lawyer": people["lawyer"]["id"], "loan": loan.number},
        format="json",
    ).json()
    close = f"/api/v1/casos-legales/{case['id']}/cerrar/"
    written = manager.post(close, {"outcome": "written_off", "note": "x"}, format="json")
    assert written.json()["code"] == "outcome"  # write the loan off first
    closed = manager.post(close, {"outcome": "agreement", "note": "Acuerdo firmado"}, format="json")
    assert closed.json()["status"] == "closed"
    theirs = other_tenant.client("gerente")
    assert theirs.get("/api/v1/casos-legales/").json() == []
    assert theirs.get(f"/api/v1/casos-legales/{case['id']}/").status_code == 404
