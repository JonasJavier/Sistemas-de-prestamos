"""RLS for the phase 4 tables of notifications (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "notifications_notification",
]


class Migration(migrations.Migration):
    dependencies = [("notifications", "0001_initial")]

    operations = [enable_rls(table) for table in TABLES]
