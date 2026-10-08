"""RLS for the phase 4 tables of core (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "core_approvalrequest",
]


class Migration(migrations.Migration):
    dependencies = [("core", "0008_approvalrequest_remove_branch_insert_insert_and_more")]

    operations = [enable_rls(table) for table in TABLES]
