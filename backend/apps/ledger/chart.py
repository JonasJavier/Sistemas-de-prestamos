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
]

# Financial accounts get their own ledger account under these codes:
# 1101-01 «Caja general», 1102-01 «Banco Popular ••1234»...
FINANCIAL_ACCOUNT_PREFIX = {"cash": "1101", "bank": "1102"}

DEFAULT_CASH_ACCOUNT_NAME = "Caja general"
