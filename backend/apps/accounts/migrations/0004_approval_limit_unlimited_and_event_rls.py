"""«Sin límite» approval limits, seeded defaults, and RLS on history tables.

pghistory's event tables copy every tracked column, company included, so
they need the same tenant policy as their source tables (doc 05 - 7.11).
``accounts_userevent`` and ``accounts_invitationevent`` stay open like
their source tables: users and invitations are written before a company
context exists (signup, invitation acceptance).
"""

from decimal import Decimal

from django.db import migrations, models

from apps.core.rls import enable_rls

EVENT_TABLES = [
    "accounts_roleevent",
    "accounts_membershipevent",
    "accounts_approvallimitevent",
]

# Doc 06 - section 5 example values (None = sin límite). Companies edit them.
DEFAULT_LIMITS = {
    "Gerente": {
        "approve_application": None,
        "waive_late_fee": None,
        "payoff_discount": None,
        "authorize_reversal": None,
        "expense": None,
        "cash_difference": None,
    },
    "Supervisor": {
        "approve_application": Decimal("50000"),
        "waive_late_fee": Decimal("5000"),
        "payoff_discount": Decimal("2000"),
        "authorize_reversal": Decimal("20000"),
        "expense": Decimal("5000"),
        "cash_difference": Decimal("500"),
    },
    "Cajero": {
        "waive_late_fee": Decimal("500"),
        "expense": Decimal("1000"),
    },
}


def seed_limits(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    Role = apps.get_model("accounts", "Role")
    ApprovalLimit = apps.get_model("accounts", "ApprovalLimit")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute(
                "SELECT set_config('app.current_company', %s, false)", [str(company.id)]
            )
            for role_name, limits in DEFAULT_LIMITS.items():
                role = Role.objects.filter(company=company, name=role_name).first()
                if role is None or ApprovalLimit.objects.filter(role=role).exists():
                    continue
                ApprovalLimit.objects.bulk_create(
                    ApprovalLimit(company=company, role=role, operation=op, max_amount=amount)
                    for op, amount in limits.items()
                )
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0003_rls"),
        ("core", "0004_search_extensions_and_provinces"),
    ]

    operations = [
        migrations.AlterField(
            model_name="approvallimit",
            name="max_amount",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        migrations.AlterField(
            model_name="approvallimitevent",
            name="max_amount",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=14, null=True),
        ),
        *[enable_rls(table) for table in EVENT_TABLES],
        migrations.RunPython(seed_limits, migrations.RunPython.noop),
    ]
