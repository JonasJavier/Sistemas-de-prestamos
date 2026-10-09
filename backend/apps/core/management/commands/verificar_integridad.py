"""Decision 101: after restoring a backup (and before launching), the
database must still be the same system: row-level security in force on
every company table, and the books of every company reconciled."""

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

from apps.core.models import Company
from apps.core.rls import RLS_EXEMPT
from apps.core.tenancy import company_context
from apps.ledger import reconciliation

# Every table with a company column must force RLS (doc 06 - 8, decision 042),
# but the few documented exceptions.
UNPROTECTED = """
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'company_id' AND NOT a.attisdropped
    WHERE c.relkind = 'r'
      AND NOT (c.relrowsecurity AND c.relforcerowsecurity
               AND EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid))
    ORDER BY c.relname
"""


def unprotected_tables() -> list[str]:
    with connection.cursor() as cursor:
        cursor.execute(UNPROTECTED)
        return [row[0] for row in cursor.fetchall() if row[0] not in RLS_EXEMPT]


class Command(BaseCommand):
    help = "Revisa la seguridad por empresa y que el libro de cada empresa cuadre."

    def handle(self, *args, **options) -> None:
        problems = [f"Tabla sin RLS forzado: {name}" for name in unprotected_tables()]
        companies = list(Company.objects.order_by("legal_name"))
        for company in companies:
            with company_context(company.id):
                problems += [f"{company}: {line}" for line in reconciliation.check(company.id)]
        for line in problems:
            self.stderr.write(line)
        if problems:
            raise CommandError(f"{len(problems)} problema(s): la base no está lista.")
        self.stdout.write(
            self.style.SUCCESS(
                f"Todo en orden: RLS en todas las tablas y el libro cuadra en "
                f"{len(companies)} empresa(s)."
            )
        )
