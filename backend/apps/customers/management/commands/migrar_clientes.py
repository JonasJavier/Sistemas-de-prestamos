"""F16 (decision 107): load the customers of the previous system.

    manage.py migrar_clientes clientes.xlsx --usuario gerente@empresa.do
    manage.py migrar_clientes clientes.xlsx --usuario gerente@empresa.do --aplicar

CSV or Excel with the columns of `plantillas_migracion`. Without --aplicar
nothing is saved; with it, all or nothing. A document already on file is
skipped, so the corrected file can be loaded again.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.accounts.models import User
from apps.core.importing import run_import
from apps.core.tabular import read_rows
from apps.core.tenancy import company_context


class Command(BaseCommand):
    help = "Migra clientes desde un CSV o Excel (F16), validando fila por fila."

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
        rows = read_rows(options["archivo"])
        if not rows:
            raise CommandError("El archivo no tiene filas.")
        with company_context(user.company_id):
            report = run_import(kind="clientes", rows=rows, user=user, apply=options["aplicar"])
        for row in report.rows:
            line = f"Fila {row.line}: {row.detail}"
            self.stdout.write(self.style.ERROR(line) if row.status == "error" else line)
        style = self.style.SUCCESS if report.applied else self.style.ERROR if report.errors else str
        self.stdout.write(style(report.summary))
