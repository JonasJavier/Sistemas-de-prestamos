"""F16 (decision 107): the Excel templates the customer fills in.

    manage.py plantillas_migracion carpeta/

Writes clientes.xlsx and prestamos.xlsx: the header row the importers
read, one example row and a sheet that explains every column.
"""

from pathlib import Path

from django.core.management.base import BaseCommand

from apps.customers.migration import COLUMNS as CUSTOMER_COLUMNS

LOAN_COLUMNS = {
    "documento": (True, "del cliente, ya cargado con migrar_clientes"),
    "producto": (True, "nombre exacto del producto en Cobradía"),
    "monto": (True, "monto prestado, sin comas"),
    "tasa": (True, "tasa por período como fracción: 5 % = 0.05"),
    "frecuencia": (True, "diaria, interdiaria, semanal, quincenal o mensual"),
    "cuotas": (True, "número de cuotas"),
    "fecha_desembolso": (True, "AAAA-MM-DD"),
    "primera_cuota": (False, "AAAA-MM-DD; si se omite, la del producto"),
    "numero_anterior": (False, "número del préstamo en el sistema anterior"),
    "cobrador": (False, "correo del cobrador en Cobradía"),
    "saldo_capital": (True, "capital pendiente hoy, para cuadrar"),
    "pagos": (False, "fecha:monto separados por punto y coma"),
}
CUSTOMER_EXAMPLE = {
    "tipo": "persona",
    "tipo_documento": "cedula",
    "documento": "001-1234567-3",
    "nombres": "María",
    "apellidos": "Gómez",
    "telefono": "809-555-0101",
    "correo": "maria@correo.do",
    "direccion": "Calle 1, Los Mina",
    "sucursal": "01",
}
LOAN_EXAMPLE = {
    "documento": "001-1234567-3",
    "producto": "Cuota Fija (mensual)",
    "monto": "25000",
    "tasa": "0.05",
    "frecuencia": "mensual",
    "cuotas": "12",
    "fecha_desembolso": "2026-03-10",
    "primera_cuota": "2026-04-10",
    "numero_anterior": "A-1043",
    "saldo_capital": "17850.25",
    "pagos": "2026-04-10:2820.62;2026-05-10:2820.62",
}


def _book(path: Path, columns: dict[str, tuple[bool, str]], example: dict[str, str]) -> None:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    book = Workbook()
    data = book.active
    data.title = "Datos"
    data.append(list(columns))
    data.append([example.get(name, "") for name in columns])
    for cell in data[1]:
        cell.font = Font(bold=True)
        cell.fill = PatternFill("solid", fgColor="DCEFE4")
    for column in data.columns:
        data.column_dimensions[column[0].column_letter].width = 20
    for row in data.iter_rows():  # everything is text: never a formula
        for cell in row:
            cell.number_format = "@"
    guide = book.create_sheet("Instrucciones")
    guide.append(["Columna", "Obligatoria", "Qué va"])
    for cell in guide[1]:
        cell.font = Font(bold=True)
    for name, (required, help_text) in columns.items():
        guide.append([name, "sí" if required else "no", help_text])
    guide.append([])
    guide.append(["Borra la fila de ejemplo antes de cargar. Una fila por registro."])
    guide.column_dimensions["A"].width = 20
    guide.column_dimensions["C"].width = 60
    book.save(path)


class Command(BaseCommand):
    help = "Escribe las plantillas de Excel de la migración (clientes y préstamos)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("carpeta")

    def handle(self, *args, **options) -> None:
        folder = Path(options["carpeta"])
        folder.mkdir(parents=True, exist_ok=True)
        customers = {name: (req, help_) for name, (_field, req, help_) in CUSTOMER_COLUMNS.items()}
        _book(folder / "clientes.xlsx", customers, CUSTOMER_EXAMPLE)
        _book(folder / "prestamos.xlsx", LOAN_COLUMNS, LOAN_EXAMPLE)
        done = f"Plantillas en {folder}: clientes.xlsx y prestamos.xlsx"
        self.stdout.write(self.style.SUCCESS(done))
