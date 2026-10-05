"""Row-level security for the sensitive-read log."""

from django.db import migrations

from apps.core.rls import enable_rls


class Migration(migrations.Migration):
    dependencies = [
        ("audit", "0001_initial"),
    ]

    operations = [enable_rls("audit_sensitiveaccesslog")]
