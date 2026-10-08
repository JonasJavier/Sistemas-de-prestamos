"""RLS for the phase 4 tables of payments (doc 05 - 7.11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "payments_payment",
    "payments_paymentallocation",
    "payments_paymentreversal",
    "payments_latefeewaiver",
    "payments_payoffquote",
    "payments_paymentevent",
]


class Migration(migrations.Migration):
    dependencies = [("payments", "0001_initial")]

    operations = [enable_rls(table) for table in TABLES]
