"""F16 (decision 107): the Excel templates, the customers and loans loaded
from Excel, rehearsed before anything is saved."""

import datetime as dt
from decimal import Decimal

from django.core.management import call_command
from django.utils import timezone
from openpyxl import Workbook

from apps.conftest import make_customer
from apps.core.tabular import read_rows
from apps.core.tenancy import company_context
from apps.customers.models import Customer
from apps.lending.models import Loan

SAN = "Personal San (semanal)"


def _sheet(path, rows: list[list[str]]) -> str:
    book = Workbook()
    for row in rows:
        book.active.append(row)
    book.save(path)
    return str(path)


def test_the_templates_carry_the_columns_the_importers_read(tmp_path) -> None:
    call_command("plantillas_migracion", str(tmp_path))
    customers = read_rows(str(tmp_path / "clientes.xlsx"))
    loans = read_rows(str(tmp_path / "prestamos.xlsx"))
    assert customers[0]["tipo"] == "persona" and customers[0]["sucursal"] == "01"
    assert loans[0]["frecuencia"] == "mensual"
    assert {"documento", "saldo_capital", "pagos"} <= set(loans[0])


def test_customers_load_from_excel_after_a_clean_rehearsal(tenant, tmp_path) -> None:
    header = ["Tipo", "Tipo documento", "Documento", "Nombres", "Apellidos", "Teléfono", "Sucursal"]
    new = ["persona", "cédula", "002-1234567-2", "Pedro", "Santana", "809-555-0199", "01"]
    bad = ["persona", "cedula", "999-9999999-9", "Rosa", "Mejía", "", "01"]
    known = ["persona", "cedula", "402-2345678-7", "Rosa", "Gómez", "", "01"]
    path = _sheet(tmp_path / "clientes.xlsx", [header, new, bad, known])
    with company_context(tenant.company.id):
        make_customer(tenant.company, tenant.branch, "40223456787", "Rosa")
        before = Customer.objects.count()

    call_command("migrar_clientes", path, usuario="gerente@uno.do", aplicar=True)
    with company_context(tenant.company.id):
        assert Customer.objects.count() == before  # one bad row: nothing saved

    path = _sheet(tmp_path / "clientes.xlsx", [header, new, known])
    call_command("migrar_clientes", path, usuario="gerente@uno.do")
    with company_context(tenant.company.id):
        assert Customer.objects.count() == before  # a rehearsal saves nothing
    call_command("migrar_clientes", path, usuario="gerente@uno.do", aplicar=True)
    call_command("migrar_clientes", path, usuario="gerente@uno.do", aplicar=True)  # again
    with company_context(tenant.company.id):
        assert Customer.objects.count() == before + 1  # the known one was skipped
        pedro = Customer.objects.get(document_number="00212345672")
        assert (pedro.display_name, pedro.home_branch_id) == ("Pedro Santana", tenant.branch.id)

    # Its running loan, from Excel too, with the frequency in Spanish.
    start = timezone.localdate() - dt.timedelta(days=30)
    loans = _sheet(
        tmp_path / "prestamos.xlsx",
        [
            ["documento", "producto", "monto", "tasa", "frecuencia", "cuotas"]
            + ["fecha_desembolso", "numero_anterior", "saldo_capital"],
            ["002-1234567-2", SAN, "1000", "0.10", "semanal", "4", start.isoformat(), "B-7"]
            + ["1000.00"],
        ],
    )
    call_command("migrar_prestamos", loans, usuario="gerente@uno.do", aplicar=True)
    with company_context(tenant.company.id):
        loan = Loan.objects.get(legacy_number="B-7")
        assert (loan.customer_id, loan.principal_outstanding) == (pedro.id, Decimal("1000.00"))
