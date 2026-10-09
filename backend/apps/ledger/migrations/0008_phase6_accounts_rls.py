"""Phase 6: RLS for the accounting periods and the new system accounts
(decisions 075 and 080) for the companies that already exist."""

from django.db import migrations

from apps.core.rls import enable_rls

NEW_ACCOUNTS = [
    ("interest_receivable", "1105", "Intereses por cobrar (devengados)", "asset"),
    ("payables", "2101", "Cuentas por pagar a proveedores", "liability"),
    ("itbis_payable", "2102", "ITBIS por pagar", "liability"),
    ("cash_overage_pending", "2103", "Sobrantes de caja por aclarar", "liability"),
    ("owner_withdrawals", "3102", "Retiros del dueño", "equity"),
    ("other_income", "4202", "Otros ingresos", "income"),
    ("cash_shortage_loss", "5301", "Pérdidas por faltantes de caja", "expense"),
]


def seed(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    LedgerAccount = apps.get_model("ledger", "LedgerAccount")
    AccountBalance = apps.get_model("ledger", "AccountBalance")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            for key, code, name, type_ in NEW_ACCOUNTS:
                if LedgerAccount.objects.filter(company=company, system_key=key).exists():
                    continue
                account = LedgerAccount.objects.create(
                    company=company,
                    code=code,
                    name=name,
                    type=type_,
                    system_key=key,
                    is_system=True,
                    allows_negative=True,
                )
                AccountBalance.objects.create(company=company, account=account, allows_negative=True)
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [("ledger", "0007_phase6_chart_periods")]

    operations = [
        enable_rls("ledger_accountingperiod"),
        enable_rls("ledger_accountingperiodevent"),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
