"""Cash difference accounts (F7 step 5) for the companies that already exist.

New companies get them with the rest of the chart at signup.
"""

from django.db import migrations

NEW_ACCOUNTS = [
    ("cash_shortage", "1301", "Faltantes de caja por cobrar", "asset", True),
    ("cash_overage", "4201", "Sobrantes de caja", "income", True),
]


def seed(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    LedgerAccount = apps.get_model("ledger", "LedgerAccount")
    AccountBalance = apps.get_model("ledger", "AccountBalance")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            for key, code, name, type_, allows_negative in NEW_ACCOUNTS:
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
    dependencies = [("ledger", "0004_financialaccount_holder_journalline_cash_session_and_more")]

    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
