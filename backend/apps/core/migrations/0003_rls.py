"""Row-level security for core tenant tables (doc 05 - section 7, rule 11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = ["core_branch", "core_holiday", "core_reason", "core_sequence"]


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0002_branchevent_companyevent_holiday_holidayevent_and_more"),
    ]

    operations = [enable_rls(table) for table in TABLES]
