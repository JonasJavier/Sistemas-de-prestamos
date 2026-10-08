"""RLS for the phase 4 tables of cash (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "cash_cashsession",
    "cash_cashcount",
    "cash_routesession",
    "cash_cashsessionevent",
    "cash_routesessionevent",
]


class Migration(migrations.Migration):
    dependencies = [("cash", "0001_initial")]

    operations = [enable_rls(table) for table in TABLES]
