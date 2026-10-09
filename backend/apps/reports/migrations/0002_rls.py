"""RLS for the report exports (decision 087)."""

from django.db import migrations

from apps.core.rls import enable_rls


class Migration(migrations.Migration):
    dependencies = [("reports", "0001_initial")]

    operations = [enable_rls("reports_exportjob")]
