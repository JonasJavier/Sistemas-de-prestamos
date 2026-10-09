"""F16 (decision 107): load the customers of the previous system.

    manage.py migrar_clientes clientes.xlsx --usuario gerente@empresa.do
    manage.py migrar_clientes clientes.xlsx --usuario gerente@empresa.do --aplicar

CSV or Excel with the columns of `plantillas_migracion`. Without --aplicar
nothing is saved; with it, all or nothing. A document already on file is
skipped, so the corrected file can be loaded again.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.core.models import Branch
from apps.core.tabular import read_rows
from apps.core.tenancy import company_context
from apps.core.text import plural
from apps.customers.migration import CustomerRowError, migrate_customer


class _DryRun(Exception):
    pass


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
        created = skipped = errors = 0
        with company_context(user.company_id):
            branches = {b.code.upper(): b for b in Branch.objects.filter(is_active=True)}
            try:
                with transaction.atomic():
                    for line, raw in enumerate(rows, start=2):
                        try:
                            with transaction.atomic():
                                customer, new = migrate_customer(raw, branches, user)
                        except CustomerRowError as exc:
                            errors += 1
                            self.stdout.write(self.style.ERROR(f"Fila {line}: {exc}"))
                            continue
                        if new:
                            created += 1
                            self.stdout.write(f"Fila {line}: {customer.display_name}")
                        else:
                            skipped += 1
                            self.stdout.write(f"Fila {line}: ya existe ({customer.display_name})")
                    if not options["aplicar"] or errors:
                        raise _DryRun
            except _DryRun:
                pass
        summary = (
            f"{plural(created, 'cliente nuevo', 'clientes nuevos')}, {skipped} ya existían, "
            f"{errors} con errores."
        )
        if options["aplicar"] and not errors:
            self.stdout.write(self.style.SUCCESS(f"Migración aplicada: {summary}"))
        elif options["aplicar"]:
            self.stdout.write(self.style.ERROR(f"Nada se guardó: {summary} Corrige y repite."))
        else:
            self.stdout.write(f"Ensayo sin guardar: {summary} Usa --aplicar para cargar.")
