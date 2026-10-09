"""The seeded chart of accounts (doc 03 - section 13; doc 05 - section 4.9).

Plain constants so both the signup service and data migrations can use
them. Names are provisional until each company's accountant validates
them (**Validar con el contador**); system accounts are referenced by
their stable ``system_key``, never by code or name.
"""

ASSET = "asset"
LIABILITY = "liability"
EQUITY = "equity"
INCOME = "income"
EXPENSE = "expense"

# (system_key, code, name, type, allows_negative)
SYSTEM_ACCOUNTS = [
    ("loan_portfolio", "1201", "Cartera de préstamos", ASSET, False),
    ("owner_equity", "3101", "Capital aportado", EQUITY, True),
    ("interest_income", "4101", "Ingresos por intereses", INCOME, True),
    ("late_fee_income", "4102", "Ingresos por mora", INCOME, True),
    ("charge_income", "4103", "Ingresos por cargos", INCOME, True),
    ("write_off_expense", "5101", "Gasto por castigo de cartera", EXPENSE, True),
    # Cash differences (F7 step 5; **Validar con el contador**): a shortage
    # is owed by the cashier, an overage is extraordinary income.
    ("cash_shortage", "1301", "Faltantes de caja por cobrar", ASSET, True),
    ("cash_overage", "4201", "Sobrantes de caja", INCOME, True),
    # F16: the portfolio brought from the previous system enters against it.
    ("opening_balance", "3201", "Saldos de apertura (migración)", EQUITY, True),
    # Phase 6 (decisions 075 and 080): accrual of the month-end close, payables,
    # the ITBIS of taxed charges, overages awaiting a claim, the owner's
    # withdrawals (never an operating expense, #12), other income and the
    # shortages the manager takes as a loss.
    ("interest_receivable", "1105", "Intereses por cobrar (devengados)", ASSET, True),
    ("payables", "2101", "Cuentas por pagar a proveedores", LIABILITY, True),
    ("itbis_payable", "2102", "ITBIS por pagar", LIABILITY, True),
    ("cash_overage_pending", "2103", "Sobrantes de caja por aclarar", LIABILITY, True),
    ("owner_withdrawals", "3102", "Retiros del dueño", EQUITY, True),
    ("other_income", "4202", "Otros ingresos", INCOME, True),
    ("cash_shortage_loss", "5301", "Pérdidas por faltantes de caja", EXPENSE, True),
]

# System accounts that keep a subsidiary record (loans, payables, cash
# differences, the accrual): only their own services post to them, never a
# manual entry, so the nightly reconciliation always holds.
SUBLEDGER_KEYS = frozenset(
    {
        "loan_portfolio",
        "interest_receivable",
        "payables",
        "cash_shortage",
        "cash_overage_pending",
        "opening_balance",
    }
)

# Operating expense accounts every company starts with (editable, phase 6);
# each expense category points to one of them.
SEED_EXPENSE_ACCOUNTS = [
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

# Financial accounts get their own ledger account under these codes:
# 1101-01 «Caja general», 1102-01 «Banco Popular ••1234», 1103-01 «Caja de
# Carmen» (a cashier's drawer), 1104-01 «Efectivo de Luis» (a collector)...
FINANCIAL_ACCOUNT_PREFIX = {"cash": "1101", "bank": "1102", "drawer": "1103", "route": "1104"}

DEFAULT_CASH_ACCOUNT_NAME = "Caja general"
