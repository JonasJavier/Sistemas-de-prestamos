from django.db import migrations

from apps.core.rls import enable_rls


class Migration(migrations.Migration):
    dependencies = [
        ("audit", "0003_domainevent"),
    ]

    operations = [enable_rls("audit_domainevent")]
