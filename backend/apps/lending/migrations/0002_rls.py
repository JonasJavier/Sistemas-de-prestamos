"""Row-level security for the lending tables (doc 05 - section 7, rule 11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "lending_loanproduct",
    "lending_latefeepolicy",
    "lending_productcharge",
]


class Migration(migrations.Migration):
    dependencies = [
        ("lending", "0001_initial"),
    ]

    operations = [enable_rls(table) for table in TABLES]
