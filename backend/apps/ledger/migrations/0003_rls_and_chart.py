"""RLS for the ledger and the seeded chart for existing companies.

New companies get the chart at signup (``register_company``); this seeds
the ones that already exist, each inside its own tenant context.
"""

from django.db import migrations

from apps.core.rls import enable_rls
from apps.ledger import chart

TABLES = [
    "ledger_ledgeraccount",
    "ledger_accountbalance",
    "ledger_financialaccount",
    "ledger_journalentry",
    "ledger_journalline",
]


def seed_chart(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    Branch = apps.get_model("core", "Branch")
    LedgerAccount = apps.get_model("ledger", "LedgerAccount")
    AccountBalance = apps.get_model("ledger", "AccountBalance")
    FinancialAccount = apps.get_model("ledger", "FinancialAccount")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute(
                "SELECT set_config('app.current_company', %s, false)", [str(company.id)]
            )
            if LedgerAccount.objects.filter(company=company).exists():
                continue
            for key, code, name, type_, allows_negative in chart.SYSTEM_ACCOUNTS:
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
            branch = Branch.objects.filter(company=company).order_by("created_at").first()
            cash = LedgerAccount.objects.create(
                company=company,
                code=f"{chart.FINANCIAL_ACCOUNT_PREFIX['cash']}-01",
                name=chart.DEFAULT_CASH_ACCOUNT_NAME,
                type=chart.ASSET,
                allows_negative=False,
            )
            AccountBalance.objects.create(company=company, account=cash, allows_negative=False)
            FinancialAccount.objects.create(
                company=company,
                name=chart.DEFAULT_CASH_ACCOUNT_NAME,
                kind="cash",
                branch=branch,
                ledger_account=cash,
            )
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [
        ("ledger", "0002_line_dimensions"),
        ("lending", "0003_applications_and_loans"),
    ]

    operations = [
        *[enable_rls(table) for table in TABLES],
        migrations.RunPython(seed_chart, migrations.RunPython.noop),
    ]
