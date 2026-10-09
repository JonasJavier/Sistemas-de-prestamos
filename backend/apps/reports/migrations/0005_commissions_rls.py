"""RLS for the commission tables (decision 089)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "reports_commissionrule",
    "reports_commissionruleevent",
    "reports_commissionrun",
    "reports_commissionline",
]


class Migration(migrations.Migration):
    dependencies = [("reports", "0004_commissions")]

    operations = [enable_rls(table) for table in TABLES]
