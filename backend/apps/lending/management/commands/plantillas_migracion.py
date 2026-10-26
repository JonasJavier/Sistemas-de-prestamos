"""F16 (decision 107): the Excel templates the customer fills in.

    manage.py plantillas_migracion carpeta/

Writes clientes.xlsx and prestamos.xlsx (the same files the app offers in
Ajustes → Importar cartera, decision 131).
"""

from pathlib import Path

from django.core.management.base import BaseCommand

from apps.core.import_templates import template_bytes


class Command(BaseCommand):
    help = "Escribe las plantillas de Excel de la migración (clientes y préstamos)."

    def add_arguments(self, parser) -> None:
        parser.add_argument("carpeta")

    def handle(self, *args, **options) -> None:
        folder = Path(options["carpeta"])
        folder.mkdir(parents=True, exist_ok=True)
        for kind in ("clientes", "prestamos"):
            (folder / f"{kind}.xlsx").write_bytes(template_bytes(kind))
        done = f"Plantillas en {folder}: clientes.xlsx y prestamos.xlsx"
        self.stdout.write(self.style.SUCCESS(done))
