"""RLS on pghistory event tables of tenant data (doc 05 - section 7, rule 11)."""

from django.db import migrations

from apps.core.rls import enable_rls

EVENT_TABLES = [
    "core_branchevent",
    "core_holidayevent",
    "core_reasonevent",
]


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_search_extensions_and_provinces"),
    ]

    operations = [enable_rls(table) for table in EVENT_TABLES]
