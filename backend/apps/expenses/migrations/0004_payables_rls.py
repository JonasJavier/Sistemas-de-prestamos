"""RLS for the payables tables (decision 082)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "expenses_payableseries",
    "expenses_payable",
    "expenses_payableevent",
    "expenses_payablepayment",
]


class Migration(migrations.Migration):
    dependencies = [("expenses", "0003_payables")]

    operations = [enable_rls(table) for table in TABLES]
