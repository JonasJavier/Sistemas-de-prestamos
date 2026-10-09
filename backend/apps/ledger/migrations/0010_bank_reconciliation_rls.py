"""RLS for the bank reconciliation tables (decision 083)."""

from django.db import migrations

from apps.core.rls import enable_rls


class Migration(migrations.Migration):
    dependencies = [("ledger", "0009_bank_reconciliation")]

    operations = [
        enable_rls("ledger_bankreconciliation"),
        enable_rls("ledger_bankstatementline"),
    ]
