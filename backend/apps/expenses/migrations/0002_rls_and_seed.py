"""RLS for the expenses tables and the starting categories (decision 081)
for the companies that already exist; new companies get them at signup."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "expenses_expensecategory",
    "expenses_expensecategoryevent",
    "expenses_expense",
    "expenses_expenseevent",
    "expenses_expensefile",
]

EXPENSE_ACCOUNTS = [
    ("5201", "Sueldos y salarios"),
    ("5202", "Alquiler"),
    ("5203", "Servicios: luz, agua, teléfono e internet"),
    ("5204", "Transporte y combustible"),
    ("5205", "Materiales y gastos de oficina"),
    ("5206", "Honorarios profesionales"),
    ("5207", "Impuestos y tasas"),
    ("5208", "Comisiones y cargos bancarios"),
    ("5209", "Publicidad"),
    ("5210", "Mantenimiento y reparaciones"),
    ("5299", "Otros gastos operativos"),
]
CATEGORIES = [
    ("Sueldos y salarios", "5201"),
    ("Alquiler del local", "5202"),
    ("Luz, agua, teléfono e internet", "5203"),
    ("Transporte y combustible", "5204"),
    ("Materiales de oficina", "5205"),
    ("Honorarios de abogados y notarios", "5206"),
    ("Impuestos y tasas", "5207"),
    ("Comisiones bancarias", "5208"),
    ("Publicidad", "5209"),
    ("Mantenimiento y reparaciones", "5210"),
    ("Otros gastos", "5299"),
]
INCOME = ["Otros ingresos", "Intereses bancarios", "Venta de activos"]


def seed(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    LedgerAccount = apps.get_model("ledger", "LedgerAccount")
    AccountBalance = apps.get_model("ledger", "AccountBalance")
    Category = apps.get_model("expenses", "ExpenseCategory")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            accounts = {a.code: a for a in LedgerAccount.objects.filter(company=company)}
            for code, name in EXPENSE_ACCOUNTS:
                if code not in accounts:
                    account = LedgerAccount.objects.create(
                        company=company, code=code, name=name, type="expense"
                    )
                    AccountBalance.objects.create(company=company, account=account)
                    accounts[code] = account
            if Category.objects.filter(company=company).exists():
                continue
            for name, code in CATEGORIES:
                Category.objects.create(
                    company=company, name=name, kind="expense", account=accounts[code]
                )
            owner = LedgerAccount.objects.get(company=company, system_key="owner_withdrawals")
            Category.objects.create(
                company=company,
                name="Gastos personales del dueño",
                kind="expense",
                nature="owner",
                account=owner,
            )
            other = LedgerAccount.objects.get(company=company, system_key="other_income")
            for name in INCOME:
                Category.objects.create(company=company, name=name, kind="income", account=other)
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [("expenses", "0001_initial"), ("ledger", "0008_phase6_accounts_rls")]

    operations = [
        *(enable_rls(table) for table in TABLES),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
