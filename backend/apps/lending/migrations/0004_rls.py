"""RLS for applications, loans and their history tables (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "lending_application",
    "lending_applicationbudgetitem",
    "lending_applicationguarantor",
    "lending_applicationcollateral",
    "lending_applicationfile",
    "lending_applicationrequirement",
    "lending_loan",
    "lending_loanterms",
    "lending_installment",
    "lending_loancharge",
    "lending_loanguarantor",
    "lending_loancollateral",
    "lending_disbursement",
    "lending_loanfile",
    # pghistory copies (product tables from phase 3 part 1 included)
    "lending_applicationevent",
    "lending_applicationrequirementevent",
    "lending_loanevent",
    "lending_loanproductevent",
    "lending_latefeepolicyevent",
    "lending_productchargeevent",
]


class Migration(migrations.Migration):
    dependencies = [
        ("lending", "0003_applications_and_loans"),
        ("ledger", "0002_line_dimensions"),
    ]

    operations = [enable_rls(table) for table in TABLES]
