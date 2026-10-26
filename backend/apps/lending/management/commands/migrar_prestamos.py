"""F16: load running loans from a CSV or Excel file, validating row by row.

    manage.py migrar_prestamos prestamos.csv --usuario gerente@empresa.do
    manage.py migrar_prestamos prestamos.csv --usuario gerente@empresa.do --aplicar

Without --aplicar nothing is saved: the report says what would happen
(F16 step 2). Columns (first row, in Spanish): documento, producto, monto,
tasa, frecuencia, cuotas, fecha_desembolso, primera_cuota, numero_anterior,
cobrador, saldo_capital, pagos — «pagos» as «2026-01-05:1500;2026-02-05:1500».
Rates are fractions (5 % = 0.05), dates are YYYY-MM-DD.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.core.importing import run_import
from apps.core.tabular import read_rows
from apps.core.tenancy import company_context


class Command(BaseCommand):
    help = "Migra préstamos en curso desde un CSV (F16), validando fila por fila."

    def add_arguments(self, parser) -> None:
        parser.add_argument("archivo")
        parser.add_argument("--usuario", required=True, help="Correo del gerente o administrador")
        parser.add_argument(
            "--aplicar", action="store_true", help="Guarda lo que pase la validación"
        )

    def handle(self, *args, **options) -> None:
        user = User.objects.filter(email=options["usuario"].lower()).first()
        if user is None or user.company_id is None:
            raise CommandError("Ese usuario no existe o no pertenece a una empresa.")
        rows = read_rows(options["archivo"])  # CSV or Excel (decision 107)
        if not rows:
            raise CommandError("El archivo no tiene filas.")
        with company_context(user.company_id):
            report = run_import(kind="prestamos", rows=rows, user=user, apply=options["aplicar"])
        for row in report.rows:
            line = f"Fila {row.line}: {row.detail}"
            self.stdout.write(self.style.ERROR(line) if row.status == "error" else line)
        style = self.style.SUCCESS if report.applied else self.style.ERROR if report.errors else str
        self.stdout.write(style(report.summary))
