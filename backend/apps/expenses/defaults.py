"""What every company starts with (decision 081): operating expense
accounts, the expense categories that point to them, and income categories.
All of it is editable; system accounts are referenced by key."""

from apps.ledger import chart

# (category, expense account code from chart.SEED_EXPENSE_ACCOUNTS, 606 type)
EXPENSE_CATEGORIES = [
    ("Sueldos y salarios", "5201", "01"),
    ("Alquiler del local", "5202", "03"),
    ("Luz, agua, teléfono e internet", "5203", "02"),
    ("Transporte y combustible", "5204", "02"),
    ("Materiales de oficina", "5205", "02"),
    ("Honorarios de abogados y notarios", "5206", "02"),
    ("Impuestos y tasas", "5207", "06"),
    ("Comisiones bancarias", "5208", "07"),
    ("Publicidad", "5209", "02"),
    ("Mantenimiento y reparaciones", "5210", "02"),
    ("Otros gastos", "5299", "02"),
]
OWNER_CATEGORY = "Gastos personales del dueño"
INCOME_CATEGORIES = ["Otros ingresos", "Intereses bancarios", "Venta de activos"]


def seed_expense_setup(company_id) -> None:
    """Accounts and categories, idempotent (signup and the data migration)."""
    from apps.expenses.models import ExpenseCategory, Kind
    from apps.ledger import services as ledger
    from apps.ledger.models import LedgerAccount

    accounts = {a.code: a for a in LedgerAccount.objects.filter(company_id=company_id)}
    for code, name in chart.SEED_EXPENSE_ACCOUNTS:
        if code not in accounts:
            accounts[code] = ledger._create_account(  # noqa: SLF001 - same module family
                company_id, code=code, name=name, type=LedgerAccount.Type.EXPENSE
            )
    existing = set(ExpenseCategory.objects.values_list("kind", "name"))
    rows = [
        ExpenseCategory(
            company_id=company_id,
            name=name,
            kind=Kind.EXPENSE,
            account=accounts[code],
            dgii_type=dgii_type,
        )
        for name, code, dgii_type in EXPENSE_CATEGORIES
        if (Kind.EXPENSE, name) not in existing
    ]
    if (Kind.EXPENSE, OWNER_CATEGORY) not in existing:
        rows.append(
            ExpenseCategory(
                company_id=company_id,
                name=OWNER_CATEGORY,
                kind=Kind.EXPENSE,
                nature=ExpenseCategory.Nature.OWNER,
                account=ledger.system_account(company_id, "owner_withdrawals"),
            )
        )
    other_income = ledger.system_account(company_id, "other_income")
    rows += [
        ExpenseCategory(company_id=company_id, name=name, kind=Kind.INCOME, account=other_income)
        for name in INCOME_CATEGORIES
        if (Kind.INCOME, name) not in existing
    ]
    ExpenseCategory.objects.bulk_create(rows)
