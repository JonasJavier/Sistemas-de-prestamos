"""RLS for the phase 5 tables and the default escalation rules (077) for the
companies that already exist; new companies get them at signup."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "collections_paymentpromise",
    "collections_escalationrule",
    "collections_collectiontask",
    "collections_agentassignment",
]

RULES = [(31, "review", "Supervisor"), (61, "intimation", "Gerente"), (91, "legal", "Gerente")]


def seed(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    EscalationRule = apps.get_model("collections", "EscalationRule")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            for days, action, role in RULES:
                if not EscalationRule.objects.filter(company=company, action=action).exists():
                    EscalationRule.objects.create(
                        company=company, min_days=days, action=action, role=role
                    )
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [("collections", "0004_promises_tasks_escalation")]

    operations = [
        *(enable_rls(table) for table in TABLES),
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
