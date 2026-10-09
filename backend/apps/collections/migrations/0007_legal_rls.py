"""RLS for the legal tables (decision 095)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "collections_legalprofessional",
    "collections_legalprofessionalevent",
    "collections_legalcase",
    "collections_legalcaseevent",
    "collections_legalcost",
]


class Migration(migrations.Migration):
    dependencies = [("collections", "0006_legal")]

    operations = [enable_rls(table) for table in TABLES]
