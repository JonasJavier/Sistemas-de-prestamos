"""RLS for the phase 4 tables of accounts (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "accounts_hoursextension",
]


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_hoursextension_remove_user_insert_insert_and_more")]

    operations = [enable_rls(table) for table in TABLES]
