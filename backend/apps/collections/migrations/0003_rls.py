"""RLS for the phase 4 tables of collections (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "collections_collectionaction",
    "collections_routestop",
    "collections_locationping",
    "collections_delinquencysnapshot",
]


class Migration(migrations.Migration):
    dependencies = [("collections", "0002_initial")]

    operations = [enable_rls(table) for table in TABLES]
