"""Phase 9 · P91: every issued document and receipt carries a QR whose
public page confirms it is authentic (decision 098)."""

from rest_framework.test import APIClient

from apps.core.models import PublicLink
from apps.core.tenancy import company_context
from apps.payments.tests.test_payments import make_loan, pay


def test_issued_documents_are_verifiable_without_a_session(tenant) -> None:
    loan = make_loan(tenant, first_due_in=5)
    documents = tenant.client("gerente").get(f"/api/v1/prestamos/{loan.number}/documentos/").json()
    first = documents["documents"][0]
    link = PublicLink.objects.get(kind=PublicLink.Kind.DOCUMENT, object_id=first["id"])
    anonymous = APIClient()
    data = anonymous.get(f"/api/v1/publico/verificar/{link.token}/").json()
    assert data["valid"] is True and data["kind"] == "document"
    assert (data["label"], data["folio"]) == (first["label"], first["folio"])
    assert len(data["fingerprint"]) == 16
    assert data["company"] == "Financiera Uno SRL"
    assert "customer" not in data  # authenticity only, never the content
    assert anonymous.get("/api/v1/publico/verificar/nada/").status_code == 404


def test_a_receipt_qr_tells_whether_it_still_stands(tenant) -> None:
    loan = make_loan(tenant, first_due_in=0)
    payment = pay(tenant, loan, "350")
    with company_context(tenant.company.id):
        receipt = tenant.client("cajero").get(f"/api/v1/pagos/{payment.number}/").json()
    assert receipt["qr"].startswith("data:image/svg+xml;base64,")
    data = APIClient().get(f"/api/v1/publico/verificar/{payment.receipt_token}/").json()
    assert (data["kind"], data["folio"], data["amount"], data["reversed"]) == (
        "receipt",
        payment.number,
        "350.00",
        False,
    )
