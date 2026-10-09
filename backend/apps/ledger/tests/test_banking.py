"""Bank reconciliation (F15, decision 083)."""

import datetime as dt
import io
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from openpyxl import Workbook

from apps.core.tenancy import company_context
from apps.expenses import services as expenses
from apps.expenses.models import ExpenseCategory
from apps.ledger import banking
from apps.ledger import services as ledger
from apps.ledger.models import LedgerAccount
from apps.payments.tests.test_payments import books_square

D = Decimal
URL = "/api/v1/conciliaciones/"


def today() -> dt.date:
    return timezone.localdate()


def _bank_with_movements(tenant):
    """100,000 deposited; a 2,500 bill paid; a 1,000 check the bank has not cashed."""
    with company_context(tenant.company.id):
        bank = ledger.create_financial_account(
            company_id=tenant.company.id, name="Banco Popular", kind="bank", account_number="1234"
        )
        manager = tenant.users["gerente"]
        ledger.capital_movement(
            account=bank,
            amount=D("100000"),
            increase=True,
            branch=tenant.branch,
            on=today(),
            note="Aporte",
            created_by=manager,
        )
        light = ExpenseCategory.objects.get(name="Luz, agua, teléfono e internet")
        for amount, text in ((D("2500"), "Factura de luz"), (D("1000"), "Cheque 0045 imprenta")):
            expenses.register(
                user=manager,
                kind="expense",
                date=today(),
                branch=tenant.branch,
                category=light,
                description=text,
                amount=amount,
                account=bank,
            )
    return bank


def _csv(lines: list[str]) -> SimpleUploadedFile:
    content = "Fecha;Descripción;Referencia;Débito;Crédito\n" + "\n".join(lines) + "\n"
    return SimpleUploadedFile("extracto.csv", content.encode("latin-1"), content_type="text/csv")


def test_a_month_reconciles_with_a_charge_and_a_check_in_transit(tenant) -> None:
    bank = _bank_with_movements(tenant)
    day = today().strftime("%d/%m/%Y")
    client = tenant.client("contabilidad")
    started = client.post(
        URL,
        {
            "account": str(bank.id),
            "year": today().year,
            "month": today().month,
            "statement_closing": "97350.00",
        },
        format="json",
    )
    assert started.status_code == 201, started.content
    rec_id = started.json()["id"]
    statement = _csv(
        [
            f"{day};Depósito;D-1;;100,000.00",
            f"{day};Pago Edenorte;CH-44;2,500.00;",
            f"{day};Comisión por manejo de cuenta;;150.00;",
        ]
    )
    imported = client.post(f"{URL}{rec_id}/extracto/", {"file": statement}, format="multipart")
    assert imported.json()["imported"] == {"added": 3, "skipped": 0}, imported.content
    again = client.post(
        f"{URL}{rec_id}/extracto/",
        {"file": _csv([f"{day};Depósito;D-1;;100,000.00"])},
        format="multipart",
    )
    assert again.json()["imported"] == {"added": 0, "skipped": 1}
    auto = client.post(f"{URL}{rec_id}/emparejar/").json()
    assert auto["matched"] == 2
    assert [b["amount"] for b in auto["in_transit"]] == ["-1000.00"]  # the uncashed check
    refused = client.post(f"{URL}{rec_id}/cerrar/")
    assert "por emparejar" in refused.json()["detail"]
    fee = next(line for line in auto["lines"] if line["matched"] is None)
    with company_context(tenant.company.id):
        bank_fees = LedgerAccount.objects.get(code="5208")
    booked = client.post(
        f"{URL}{rec_id}/lineas/{fee['id']}/registrar/",
        {"counterpart": str(bank_fees.id)},
        format="json",
    ).json()
    summary = booked["summary"]
    assert (summary["book_balance"], summary["in_transit"], summary["difference"]) == (
        "96350.00",
        "-1000.00",
        "0.00",
    )
    with company_context(tenant.company.id):
        assert banking.pending_for_month(today().year, today().month) == [bank]
    closed = client.post(f"{URL}{rec_id}/cerrar/")
    assert closed.json()["status"] == "closed", closed.content
    with company_context(tenant.company.id):
        assert banking.pending_for_month(today().year, today().month) == []
    late = client.post(f"{URL}{rec_id}/extracto/", {"file": _csv([])}, format="multipart")
    assert late.status_code == 400
    books_square(tenant)


def test_an_excel_statement_with_one_amount_column(tenant) -> None:
    bank = _bank_with_movements(tenant)
    book = Workbook()
    sheet = book.active
    sheet.append(["Banco Popular — estado de cuenta"])
    sheet.append(["Fecha", "Concepto", "Monto"])
    sheet.append([today(), "Depósito", 100000])
    sheet.append([today().strftime("%d/%m/%Y"), "Pago Edenorte", "-2,500.00"])
    buffer = io.BytesIO()
    book.save(buffer)
    upload = SimpleUploadedFile("extracto.xlsx", buffer.getvalue())
    with company_context(tenant.company.id):
        rec = banking.start(
            user=tenant.users["gerente"],
            account=bank,
            year=today().year,
            month=today().month,
            statement_closing=D("97500"),
        )
        assert banking.import_statement(
            reconciliation=rec, user=tenant.users["gerente"], upload=upload
        ) == (2, 0)
        assert [(line.description, line.amount) for line in rec.lines.order_by("amount")] == [
            ("Pago Edenorte", D("-2500.00")),
            ("Depósito", D("100000.00")),
        ]


def test_reconciliation_is_for_management_and_accounting(tenant, other_tenant) -> None:
    bank = _bank_with_movements(tenant)
    body = {
        "account": str(bank.id),
        "year": today().year,
        "month": today().month,
        "statement_closing": "0",
    }
    assert tenant.client("supervisor").post(URL, body, format="json").status_code == 403
    assert tenant.client("auditoria").post(URL, body, format="json").status_code == 403
    created = tenant.client("gerente").post(URL, body, format="json").json()
    assert tenant.client("auditoria").get(f"{URL}{created['id']}/").status_code == 200
    assert other_tenant.client("gerente").get(f"{URL}{created['id']}/").status_code == 404
    with company_context(tenant.company.id):
        cash_rec = tenant.client("gerente").post(
            URL, {**body, "account": str(tenant.cash.id)}, format="json"
        )
    assert cash_rec.status_code == 400  # only banks
    unreadable = SimpleUploadedFile("x.csv", b"sin columnas\n1;2;3\n")
    bad = tenant.client("gerente").post(
        f"{URL}{created['id']}/extracto/", {"file": unreadable}, format="multipart"
    )
    assert "columnas" in bad.json()["detail"]
