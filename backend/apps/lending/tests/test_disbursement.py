"""Flow F4 (atomic disbursement) and F14 (void), against the ledger.

Phase 3 acceptance (doc 10): «el desembolso cuadra en cero contra el
libro» — every test that disburses checks the books to the cent.
"""

import datetime as dt
import uuid
from decimal import Decimal

import pytest
from django.utils import timezone

from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.customers.models import Collateral
from apps.documents.models import GeneratedDocument
from apps.documents.services import amount_in_words, ensure_loan_documents
from apps.ledger import services as ledger
from apps.ledger.models import JournalEntry, JournalLine
from apps.lending.models import Application, Disbursement, Loan, LoanProduct, ProductCharge

D = Decimal
FIJA = "Cuota Fija (mensual)"
SAN = "Personal San (semanal)"


def _approved(
    tenant,
    *,
    product=FIJA,
    amount="20000",
    installments=6,
    frequency=None,
    rate=None,
    approver="supervisor",
):
    """An application created by the officer and approved (supervisor by default)."""
    product_obj = tenant.product(product)
    body = {
        "customer": str(tenant.customer.id),
        "product": str(product_obj.id),
        "amount": amount,
        "frequency": frequency or product_obj.allowed_frequencies[-1],
        "installments": installments,
        "rate": rate or str(product_obj.default_rate),
    }
    officer = tenant.client("oficial")
    app_id = officer.post("/api/v1/solicitudes/", body, format="json").json()["id"]
    for req in officer.get(f"/api/v1/solicitud-requisitos/?application={app_id}").json():
        officer.post(f"/api/v1/solicitud-requisitos/{req['id']}/verificar/")
    assert officer.post(f"/api/v1/solicitudes/{app_id}/enviar/").status_code == 200
    approved = tenant.client(approver).post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    assert approved.status_code == 200, approved.content
    return app_id


def _disburse(tenant, app_id, role="cajero", key=None, **overrides):
    body = {
        "source_account": str(tenant.cash.id),
        "method": "cash",
        "idempotency_key": key or uuid.uuid4().hex,
        **overrides,
    }
    return tenant.client(role).post(
        f"/api/v1/solicitudes/{app_id}/desembolsar/", body, format="json"
    )


def _set_charge(tenant, product_name: str, mode: str, value="0.02") -> None:
    with company_context(tenant.company.id):
        product = LoanProduct.objects.get(name=product_name)
        product.charges.all().delete()
        product.min_amount = D("1000")
        product.save()
        ProductCharge.objects.create(
            company=tenant.company,
            product=product,
            name="Gastos de cierre",
            basis=ProductCharge.Basis.PERCENT,
            value=D(value),
            mode=mode,
        )


def _books_balance(tenant) -> None:
    """Every balance cache equals its lines, and debits equal credits."""
    with company_context(tenant.company.id):
        from apps.ledger.models import LedgerAccount

        for account in LedgerAccount.objects.all():
            assert ledger.balance_of(account) == ledger.recomputed_balance(account), account
        lines = JournalLine.objects.all()
        assert sum(line.debit for line in lines) == sum(line.credit for line in lines)


def test_e7_discounted_disbursement_entry(tenant) -> None:
    """E7 discounted: 980.00 out of the box, 20.00 charge income, portfolio
    1,000.00 (doc 03 - section 13)."""
    _set_charge(tenant, SAN, ProductCharge.Mode.DISCOUNTED)
    app_id = _approved(tenant, product=SAN, amount="1000", installments=4, rate="0.10")
    response = _disburse(tenant, app_id)
    assert response.status_code == 201, response.content
    assert response.json()["loan"] == "01-000001"  # decision 030

    with company_context(tenant.company.id):
        loan = Loan.objects.get(number="01-000001")
        entry = loan.disbursement.journal_entry
        lines = {
            line.account.system_key or line.account.code: (line.debit, line.credit)
            for line in entry.lines.select_related("account")
        }
        assert lines == {
            "loan_portfolio": (D("1000.00"), D("0.00")),
            "1101-01": (D("0.00"), D("980.00")),
            "charge_income": (D("0.00"), D("20.00")),
        }
        assert ledger.balance_of(tenant.cash.ledger_account) == D("499020.00")
        disbursement = loan.disbursement
        assert (disbursement.gross, disbursement.net) == (D("1000.00"), D("980.00"))
        # E1 schedule: 4 x 350.00, frozen as terms version 1.
        rows = list(loan.installments.order_by("number"))
        assert [r.principal_due + r.interest_due for r in rows] == [D("350.00")] * 4
        assert loan.principal_outstanding == D("1000.00")
        assert loan.interest_outstanding == D("400.00")
        terms = loan.terms.get()
        assert (terms.version, terms.method, terms.late_fee_grace_days) == (1, "flat", 3)
        assert loan.application.status == Application.Status.DISBURSED
    _books_balance(tenant)


def test_e7_financed_charge_raises_the_base(tenant) -> None:
    """E7 financed: the customer receives 1,000.00; installments on 1,020."""
    _set_charge(tenant, SAN, ProductCharge.Mode.FINANCED)
    app_id = _approved(tenant, product=SAN, amount="1000", installments=4, rate="0.10")
    assert _disburse(tenant, app_id).status_code == 201
    with company_context(tenant.company.id):
        loan = Loan.objects.get()
        assert loan.principal == D("1020.00")
        assert sum(r.principal_due for r in loan.installments.all()) == D("1020.00")
        assert loan.disbursement.net == D("1000.00")
        assert ledger.balance_of(tenant.cash.ledger_account) == D("499000.00")
    _books_balance(tenant)


def test_cash_mode_charge_is_collected_apart(tenant) -> None:
    _set_charge(tenant, SAN, ProductCharge.Mode.CASH)
    app_id = _approved(tenant, product=SAN, amount="1000", installments=4, rate="0.10")
    assert _disburse(tenant, app_id).status_code == 201
    with company_context(tenant.company.id):
        loan = Loan.objects.get()
        assert loan.disbursement.net == D("1000.00")
        assert loan.disbursement.cash_charges == D("20.00")
        # 1,000 out, 20 in: the box nets -980 and the income shows the 20.
        assert ledger.balance_of(tenant.cash.ledger_account) == D("499020.00")
        income = ledger.system_account(tenant.company.id, "charge_income")
        assert ledger.balance_of(income) == D("20.00")
    _books_balance(tenant)


def test_double_click_never_pays_twice(tenant) -> None:
    app_id = _approved(tenant)
    key = uuid.uuid4().hex
    first = _disburse(tenant, app_id, key=key)
    second = _disburse(tenant, app_id, key=key)
    assert first.status_code == second.status_code == 201
    assert first.json()["loan"] == second.json()["loan"]
    with company_context(tenant.company.id):
        assert Loan.objects.count() == 1
        assert Disbursement.objects.count() == 1
        assert JournalEntry.objects.filter(source_type="lending.disbursement").count() == 1
    # A different key on the same application is refused: already disbursed.
    third = _disburse(tenant, app_id)
    assert third.status_code == 400
    assert third.json()["code"] == "state"
    _books_balance(tenant)


def test_whoever_approved_does_not_disburse(tenant) -> None:
    """Doc 06 - section 4, rule 2."""
    officer = tenant.client("oficial")
    product = tenant.product(FIJA)
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
    for req in officer.get(f"/api/v1/solicitud-requisitos/?application={app_id}").json():
        officer.post(f"/api/v1/solicitud-requisitos/{req['id']}/verificar/")
    officer.post(f"/api/v1/solicitudes/{app_id}/enviar/")
    tenant.client("gerente").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    response = _disburse(tenant, app_id, role="gerente")
    assert response.status_code == 403
    assert "aprobó" in response.json()["detail"]
    assert _disburse(tenant, app_id, role="gerente2").status_code == 201


def test_only_g_ca_ct_disburse(tenant) -> None:
    app_id = _approved(tenant)
    assert _disburse(tenant, app_id, role="oficial").status_code == 403
    assert _disburse(tenant, app_id, role="cobrador").status_code == 403
    assert _disburse(tenant, app_id, role="supervisor").status_code == 403
    assert _disburse(tenant, app_id, role="contabilidad").status_code == 201


def test_no_overdraft_on_disbursement(tenant) -> None:
    """Reference defect #30: no funds, no disbursement, nothing written."""
    app_id = _approved(tenant, amount="600000", installments=12, approver="gerente")
    response = _disburse(tenant, app_id)
    assert response.status_code == 400
    assert response.json()["code"] == "insufficient_funds"
    with company_context(tenant.company.id):
        assert not Loan.objects.exists()
        assert Application.objects.get(pk=app_id).status == Application.Status.APPROVED
    _books_balance(tenant)


def test_expired_approval_cannot_be_disbursed(tenant) -> None:
    app_id = _approved(tenant)
    with company_context(tenant.company.id):
        Application.objects.filter(pk=app_id).update(
            valid_until=timezone.localdate() - dt.timedelta(days=1)
        )
    response = _disburse(tenant, app_id)
    assert response.status_code == 400
    assert response.json()["code"] == "expired"


def test_cash_comes_from_a_box_and_transfers_from_a_bank(tenant) -> None:
    app_id = _approved(tenant)
    with company_context(tenant.company.id):
        bank = ledger.create_financial_account(
            company_id=tenant.company.id, name="Popular", kind="bank", bank_name="Popular"
        )
    wrong = _disburse(tenant, app_id, source_account=str(bank.id), method="cash")
    assert wrong.status_code == 400
    empty_bank = _disburse(tenant, app_id, source_account=str(bank.id), method="transfer")
    assert empty_bank.json()["code"] == "insufficient_funds"


def test_collateral_is_pledged_and_released_by_void(tenant) -> None:
    with company_context(tenant.company.id):
        car = Collateral.objects.create(
            company=tenant.company,
            owner=tenant.customer,
            type=Collateral.Type.VEHICLE,
            description="Honda Civic 2020",
            appraised_value=D("900000"),
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
    officer.post(
        "/api/v1/solicitud-garantias/",
        {"application": app_id, "collateral": str(car.id)},
        format="json",
    )
    for req in officer.get(f"/api/v1/solicitud-requisitos/?application={app_id}").json():
        officer.post(f"/api/v1/solicitud-requisitos/{req['id']}/verificar/")
    officer.post(f"/api/v1/solicitudes/{app_id}/enviar/")
    tenant.client("supervisor").post(f"/api/v1/solicitudes/{app_id}/aprobar/", {})
    number = _disburse(tenant, app_id).json()["loan"]
    with company_context(tenant.company.id):
        car.refresh_from_db()
        assert car.status == Collateral.Status.PLEDGED
        reason = Reason.objects.filter(kind=Reason.Kind.VOID).first()

    # F14: supervisor voids with a catalog reason; money and charges return.
    voided = tenant.client("supervisor").post(
        f"/api/v1/prestamos/{number}/anular/",
        {"reason": str(reason.id), "note": "Se registró por error"},
        format="json",
    )
    assert voided.status_code == 200, voided.content
    assert voided.json()["status"] == "voided"
    with company_context(tenant.company.id):
        car.refresh_from_db()
        assert car.status == Collateral.Status.RELEASED
        loan = Loan.objects.get(number=number)
        assert loan.disbursement.reversal_entry.reversal_of == loan.disbursement.journal_entry
        assert set(loan.charges.values_list("status", flat=True)) == {"reversed"}
        assert ledger.balance_of(tenant.cash.ledger_account) == D("500000.00")
        portfolio = ledger.system_account(tenant.company.id, "loan_portfolio")
        assert ledger.balance_of(portfolio) == D("0.00")
    _books_balance(tenant)
    # Cashiers do not void (doc 06 matrix).
    assert (
        tenant.client("cajero").post(f"/api/v1/prestamos/{number}/anular/", {}).status_code == 403
    )


def test_loan_file_api_and_documents(tenant) -> None:
    app_id = _approved(tenant, amount="12500", installments=6)
    number = _disburse(tenant, app_id).json()["loan"]
    api = tenant.client("oficial")
    detail = api.get(f"/api/v1/prestamos/{number}/")
    assert detail.status_code == 200
    data = detail.json()
    assert data["current_terms"]["version"] == 1
    assert data["disbursement"]["net"] == "12250.00"  # 2% discounted closing cost
    assert "•" in data["customer_document"]
    calendar = api.get(f"/api/v1/prestamos/{number}/calendario/").json()
    assert len(calendar["installments"]) == 6
    events = api.get(f"/api/v1/prestamos/{number}/eventos/").json()
    assert {e["type"] for e in events} >= {
        "application.created",
        "application.approved",
        "loan.disbursed",
    }

    docs = api.get(f"/api/v1/prestamos/{number}/documentos/").json()["documents"]
    assert [d["kind"] for d in docs] == ["promissory_note", "payment_schedule"]
    pdf = api.get(f"/api/v1/prestamos/{number}/documentos/{docs[0]['id']}/")
    assert pdf.status_code == 200
    body = b"".join(pdf.streaming_content)
    assert body.startswith(b"%PDF")
    with company_context(tenant.company.id):
        loan = Loan.objects.get(number=number)
        again = ensure_loan_documents(loan, issued_by=None)
        assert [str(d.id) for d in again] == [d["id"] for d in docs]
        assert GeneratedDocument.objects.count() == 2  # issued once; reprints are identical


def test_loans_are_isolated_and_collectors_see_only_theirs(tenant, other_tenant) -> None:
    app_id = _approved(tenant)
    number = _disburse(tenant, app_id).json()["loan"]
    assert other_tenant.client("gerente").get(f"/api/v1/prestamos/{number}/").status_code == 404
    assert tenant.client("cobrador").get("/api/v1/prestamos/").json()["count"] == 0
    with company_context(tenant.company.id):
        Loan.objects.filter(number=number).update(collector=tenant.users["cobrador"])
    assert tenant.client("cobrador").get("/api/v1/prestamos/").json()["count"] == 1


def test_loan_list_totals_cover_the_filter_and_search_by_name_or_document(tenant) -> None:
    """Doc 07 - 5: totals respect the filters, not the page on screen."""
    for amount in ("20000", "15000"):
        assert _disburse(tenant, _approved(tenant, amount=amount)).status_code == 201
    manager = tenant.client("gerente")
    listing = manager.get("/api/v1/prestamos/?page_size=1").json()
    assert listing["count"] == 2
    assert len(listing["results"]) == 1
    expected = sum(
        D(loan["principal_outstanding"])
        for loan in manager.get("/api/v1/prestamos/").json()["results"]
    )
    assert D(listing["totals"]["principal_outstanding"]) == expected
    # «maría gómez» (accents and order free) and the cédula with dashes both find them.
    assert manager.get("/api/v1/prestamos/?q=gomez maria").json()["count"] == 2
    assert manager.get("/api/v1/prestamos/?q=001-1234567-4").json()["count"] == 2
    assert manager.get("/api/v1/prestamos/?q=maria otro").json()["count"] == 0


@pytest.mark.parametrize(
    ("amount", "words"),
    [
        (D("1250.50"), "MIL DOSCIENTOS CINCUENTA PESOS DOMINICANOS CON 50/100"),
        (D("21"), "VEINTIÚN PESOS DOMINICANOS CON 00/100"),
        (D("101"), "CIENTO UN PESOS DOMINICANOS CON 00/100"),
        (D("1000000"), "UN MILLÓN DE PESOS DOMINICANOS CON 00/100"),
    ],
)
def test_amount_in_words(amount, words) -> None:
    assert amount_in_words(amount) == words


def test_global_search_finds_loans_in_scope(tenant, other_tenant) -> None:
    app_id = _approved(tenant)
    number = _disburse(tenant, app_id).json()["loan"]
    hits = tenant.client("cajero").get(f"/api/v1/buscar/?q={number}").json()
    assert [hit["number"] for hit in hits["loans"]] == [number]
    assert other_tenant.client("gerente").get(f"/api/v1/buscar/?q={number}").json()["loans"] == []
    # Roles without loan access get customers only.
    from rest_framework.test import APIClient

    from apps.conftest import add_user

    admin_only = add_user(tenant.reg, "admin@uno.do", "Administrador")
    api = APIClient()
    api.force_login(admin_only)
    assert api.get(f"/api/v1/buscar/?q={number}").json()["loans"] == []
