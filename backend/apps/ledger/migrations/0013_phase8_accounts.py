"""The phase 8 system accounts for the companies that already exist."""

from django.db import migrations

from apps.ledger import chart

KEYS = ("renewal_clearing", "recovery_income")


def seed(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    LedgerAccount = apps.get_model("ledger", "LedgerAccount")
    AccountBalance = apps.get_model("ledger", "AccountBalance")
    wanted = [row for row in chart.SYSTEM_ACCOUNTS if row[0] in KEYS]
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            for key, code, name, type_, allows_negative in wanted:
                if LedgerAccount.objects.filter(company=company, system_key=key).exists():
                    continue
                account = LedgerAccount.objects.create(
                    company=company,
                    code=code,
                    name=name,
                    type=type_,
                    system_key=key,
                    is_system=True,
                    allows_negative=allows_negative,
                )
                AccountBalance.objects.create(
                    company=company, account=account, allows_negative=allows_negative
                )
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [("ledger", "0012_fiscal_documents_rls")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
