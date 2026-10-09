"""RLS for the messaging tables (decision 097)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "notifications_messagetemplate",
    "notifications_messagetemplateevent",
    "notifications_outboundmessage",
    "notifications_optout",
]


class Migration(migrations.Migration):
    dependencies = [("notifications", "0006_messaging")]

    operations = [enable_rls(table) for table in TABLES]
