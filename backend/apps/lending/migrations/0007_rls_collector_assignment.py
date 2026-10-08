"""RLS for the phase 4 tables of lending (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "lending_collectorassignment",
]


class Migration(migrations.Migration):
    dependencies = [("lending", "0006_collectorassignment_and_more")]

    operations = [enable_rls(table) for table in TABLES]
