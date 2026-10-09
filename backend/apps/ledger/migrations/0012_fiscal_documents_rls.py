"""RLS for the fiscal documents (decision 085)."""

from django.db import migrations

from apps.core.rls import enable_rls


class Migration(migrations.Migration):
    dependencies = [("ledger", "0011_fiscal_documents")]

    operations = [enable_rls("ledger_fiscaldocument")]
