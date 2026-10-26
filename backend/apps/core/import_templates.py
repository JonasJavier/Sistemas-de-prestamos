"""The Excel templates of the import (F16, decision 107; downloadable from
the app since D1, decision 131): the header row the importers read, one
example row and a sheet that explains every column."""

from __future__ import annotations

import io

from apps.customers.migration import COLUMNS as CUSTOMER_COLUMNS

LOAN_COLUMNS = {
    "documento": (True, "del cliente, ya cargado en Clientes"),
    "producto": (True, "nombre exacto del producto en Cobradía (Ajustes → Productos)"),
    "monto": (True, "monto prestado, sin comas"),
    "tasa": (True, "tasa por período como fracción: 5 % = 0.05"),
    "frecuencia": (True, "diaria, interdiaria, semanal, quincenal o mensual"),
    "cuotas": (True, "número de cuotas"),
    "fecha_desembolso": (True, "AAAA-MM-DD, anterior a hoy"),
    "primera_cuota": (False, "AAAA-MM-DD; si se omite, la del producto"),
    "numero_anterior": (False, "número del préstamo en el sistema anterior"),
    "cobrador": (False, "correo del cobrador en Cobradía"),
    "saldo_capital": (True, "capital pendiente hoy, para cuadrar al centavo"),
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


def columns_of(kind: str) -> dict[str, tuple[bool, str]]:
    if kind == "clientes":
        return {name: (req, help_) for name, (_field, req, help_) in CUSTOMER_COLUMNS.items()}
    return LOAN_COLUMNS


def template_bytes(kind: str) -> bytes:
    """clientes.xlsx or prestamos.xlsx, in memory."""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    columns = columns_of(kind)
    example = CUSTOMER_EXAMPLE if kind == "clientes" else LOAN_EXAMPLE
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
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()
