"""RLS for the fraud rules and alerts (decision 090)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = ["audit_fraudrule", "audit_fraudruleevent", "audit_fraudalert"]


class Migration(migrations.Migration):
    dependencies = [("audit", "0007_fraud")]

    operations = [enable_rls(table) for table in TABLES]
