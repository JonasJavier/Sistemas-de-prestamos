"""The opening-balance account of F16 for the companies that already exist."""

from django.db import migrations


def seed(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    LedgerAccount = apps.get_model("ledger", "LedgerAccount")
    AccountBalance = apps.get_model("ledger", "AccountBalance")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            if LedgerAccount.objects.filter(company=company, system_key="opening_balance").exists():
                continue
            account = LedgerAccount.objects.create(
                company=company,
                code="3201",
                name="Saldos de apertura (migración)",
                type="equity",
                system_key="opening_balance",
                is_system=True,
                allows_negative=True,
            )
            AccountBalance.objects.create(company=company, account=account, allows_negative=True)
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [("ledger", "0005_cash_difference_accounts")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
