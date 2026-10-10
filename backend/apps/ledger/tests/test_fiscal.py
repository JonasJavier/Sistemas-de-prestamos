"""e-CF queue, the 606/607 formats (decision 085) and P61 management results."""

import datetime as dt
from decimal import Decimal

from django.utils import timezone

from apps.core.models import Reason
from apps.core.tenancy import company_context
from apps.expenses import payables
from apps.expenses import services as expenses
from apps.expenses.models import ExpenseCategory
from apps.ledger import accounting
from apps.ledger.models import FiscalDocument
from apps.lending.models import ProductCharge
from apps.payments.models import PaymentAllocation
from apps.payments.reversals import execute_reversal
from apps.payments.tests.test_payments import books_square, make_loan, pay

D = Decimal
URL = "/api/v1/comprobantes/"


def today() -> dt.date:
    return timezone.localdate()


def test_a_collection_queues_its_exempt_receipt_and_a_reversal_follows_it(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    payment = pay(tenant, loan, "400")
    with company_context(tenant.company.id):
        receipt = FiscalDocument.objects.get(source_id=payment.id)
        income = sum(
            a.amount
            for a in PaymentAllocation.objects.filter(
                payment=payment, component__in=["interest", "late_fee", "charges"]
            )
        )
        # Interest and late fee only; the principal is never invoiced.
        assert (receipt.kind, receipt.status, receipt.total, receipt.itbis) == (
            "E32",
            "pending",
            income,
            D("0.00"),
        )
    manager = tenant.client("gerente")
    wrong = manager.post(f"{URL}{receipt.id}/emitir/", {"ncf": "E310000000001"}, format="json")
    assert "E32" in wrong.json()["detail"]
    issued = manager.post(f"{URL}{receipt.id}/emitir/", {"ncf": "E320000000001"}, format="json")
    assert issued.json()["status"] == "issued", issued.content
    # Reversing an issued collection asks for a credit note on it.
    with company_context(tenant.company.id):
        execute_reversal(
            payment=payment,
            requested_by=tenant.users["cajero"],
            authorized_by=tenant.users["supervisor"],
            reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
            note="Error",
        )
        note = FiscalDocument.objects.get(kind="E34")
        assert (note.modifies_id, note.total, note.status) == (receipt.id, receipt.total, "pending")
    second = pay(tenant, loan, "350")
    with company_context(tenant.company.id):
        pending = FiscalDocument.objects.get(source_id=second.id)
        execute_reversal(
            payment=second,
            requested_by=tenant.users["cajero"],
            authorized_by=tenant.users["supervisor"],
            reason=Reason.objects.filter(kind=Reason.Kind.REVERSAL).first(),
            note="Error",
        )
        pending.refresh_from_db()
        assert pending.status == "voided"  # never issued: nothing to credit
    books_square(tenant)


def test_a_taxed_charge_at_disbursement_shows_its_itbis(tenant) -> None:
    fija = "Cuota Fija (mensual)"
    with company_context(tenant.company.id):
        ProductCharge.objects.filter(product__name=fija).update(taxed=True)
    loan = make_loan(
        tenant, first_due_in=30, product=fija, amount="10000", installments=3, rate="0.05"
    )
    with company_context(tenant.company.id):
        receipt = FiscalDocument.objects.get(source_type="lending.disbursement", source_id=loan.id)
        assert (receipt.taxed_amount, receipt.itbis, receipt.total) == (
            D("169.49"),
            D("30.51"),
            D("200.00"),
        )


def test_the_606_and_607_and_the_pending_list(tenant) -> None:
    with company_context(tenant.company.id):
        light = ExpenseCategory.objects.get(name="Luz, agua, teléfono e internet")
        owner = ExpenseCategory.objects.get(name="Gastos personales del dueño")
        for category, amount, ncf in (
            (light, "2500", "B0100000123"),
            (owner, "900", "B0100000124"),
        ):
            expenses.register(
                user=tenant.users["gerente"],
                kind="expense",
                date=today(),
                branch=tenant.branch,
                category=category,
                description="Factura",
                amount=D(amount),
                itbis=D("381.36") if category == light else D("0"),
                account=tenant.cash,
                party_document="101821248",
                ncf=ncf,
            )
    loan = make_loan(tenant, first_due_in=-10)
    payment = pay(tenant, loan, "400")
    with company_context(tenant.company.id):
        receipt = FiscalDocument.objects.get(source_id=payment.id)
    tenant.client("gerente").post(
        f"{URL}{receipt.id}/emitir/", {"ncf": "E320000000007"}, format="json"
    )
    month = f"?year={today().year}&month={today().month}"
    f606 = tenant.client("contabilidad").get(f"{URL}exportar/606/{month}").content.decode()
    lines = f606.strip().splitlines()
    assert len(lines) == 2  # header + the light bill; the owner's spending is left out
    assert "101821248,1,02,B0100000123" in lines[1] and "381.36" in lines[1]
    f607 = tenant.client("auditoria").get(f"{URL}exportar/607/{month}").content.decode()
    assert "E320000000007" in f607
    pending = tenant.client("gerente").get(f"{URL}exportar/pendientes/").content.decode()
    assert pending.startswith("﻿Tipo,Fecha")
    assert tenant.client("cajero").get(URL).status_code == 403


def test_invoices_owed_reach_the_606_in_the_month_of_their_receipt(tenant) -> None:
    payables_url = "/api/v1/cuentas-por-pagar/"
    accountant = tenant.client("contabilidad")
    with company_context(tenant.company.id):
        rent = str(ExpenseCategory.objects.get(name="Alquiler del local").id)
    base = {
        "branch": str(tenant.branch.id),
        "category": rent,
        "party_name": "Inmobiliaria del Cibao",
        "party_document": "131234567",
        "description": "Alquiler",
        "amount": "30000",
        "invoice_on": today().isoformat(),
        "due_on": today().isoformat(),
    }
    owed = accountant.post(payables_url, {**base, "ncf": "B0100000888"}, format="json")
    assert owed.status_code == 201, owed.content
    paid = accountant.post(
        payables_url, {**base, "ncf": "B0100000889", "itbis": "4576.27"}, format="json"
    ).json()[0]
    accountant.post(
        f"{payables_url}{paid['id']}/pagar/",
        {"amount": "30000", "account": str(tenant.cash.id), "date": today().isoformat()},
        format="json",
    )
    # A series occurrence gets its invoice when it arrives.
    series = accountant.post(
        payables_url,
        {**base, "invoice_on": None, "frequency": "monthly", "count": 2},
        format="json",
    ).json()
    assert series[0]["ncf"] == "" and series[0]["itbis"] == "0.00"
    with company_context(tenant.company.id):
        payables.recognize_due(today())
    receipt = accountant.post(
        f"{payables_url}{series[0]['id']}/comprobante/",
        {"party_document": "131234567", "ncf": "B0100000890", "itbis": "4576.27"},
        format="json",
    )
    assert receipt.status_code == 200, receipt.content
    assert (receipt.json()["ncf"], receipt.json()["itbis"]) == ("B0100000890", "4576.27")
    month = f"?year={today().year}&month={today().month}"
    lines = accountant.get(f"{URL}exportar/606/{month}").content.decode().strip().splitlines()
    rows = {line.split(",")[3]: line.split(",") for line in lines[1:]}
    assert set(rows) == {"B0100000888", "B0100000889", "B0100000890"}
    assert (rows["B0100000888"][6], rows["B0100000888"][15]) == ("", "04")  # still owed
    assert rows["B0100000889"][6] == today().strftime("%Y%m%d")  # paid in the month
    assert rows["B0100000889"][10] == "4576.27"
    # The same supplier's receipt is never entered twice.
    twice = accountant.post(payables_url, {**base, "ncf": "B0100000888"}, format="json")
    assert twice.status_code == 400 and twice.json()["code"] == "ncf"
    with company_context(tenant.company.id):
        light = ExpenseCategory.objects.get(name="Luz, agua, teléfono e internet")
        try:
            expenses.register(
                user=tenant.users["gerente"],
                kind="expense",
                date=today(),
                branch=tenant.branch,
                category=light,
                description="La misma factura",
                amount=D("30000"),
                account=tenant.cash,
                party_document="131234567",
                ncf="B0100000889",
            )
        except expenses.ExpenseError as exc:
            assert exc.code == "ncf" and "cuenta por pagar" in str(exc)
        else:
            raise AssertionError("a payable's NCF was entered again as an expense")
    books_square(tenant)


def test_management_results_count_what_was_collected(tenant) -> None:
    loan = make_loan(tenant, first_due_in=-10)
    pay(tenant, loan, "400")
    with company_context(tenant.company.id):
        owner = ExpenseCategory.objects.get(name="Gastos personales del dueño")
        expenses.register(
            user=tenant.users["gerente"],
            kind="expense",
            date=today(),
            branch=tenant.branch,
            category=owner,
            description="Supermercado",
            amount=D("1000"),
            account=tenant.cash,
        )
        report = accounting.management_results(today().replace(day=1), today())
        income = dict(report.income)
        assert income["Intereses cobrados"] > 0
        assert report.expense_total == D("0")  # the owner's spending is not an expense
        assert report.owner_withdrawals == D("1000.00")
    data = tenant.client("contabilidad").get("/api/v1/reportes/resultados/").json()
    assert D(data["result"]) == D(data["income_total"]) - D(data["expense_total"])
    assert data["owner_withdrawals"] == "1000.00"
    books_square(tenant)
