"""RLS for the phase 4 tables of customers (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "customers_branchaccessgrant",
]


class Migration(migrations.Migration):
    dependencies = [("customers", "0004_branchaccessgrant")]

    operations = [enable_rls(table) for table in TABLES]
