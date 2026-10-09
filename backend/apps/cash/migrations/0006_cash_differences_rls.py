"""RLS for the cash differences (decision 075) and the differences closings
already recorded: shortages stay open (they are owed); overages were posted
straight to income before phase 6, so they count as already resolved."""

from django.db import migrations

from apps.core.rls import enable_rls


def backfill(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    CashSession = apps.get_model("cash", "CashSession")
    RouteSession = apps.get_model("cash", "RouteSession")
    Difference = apps.get_model("cash", "CashDifference")
    Action = apps.get_model("cash", "CashDifferenceAction")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            sources = [
                (s, "cash_session", s.cashier_id, s.business_date)
                for s in CashSession.objects.filter(company=company).exclude(difference__isnull=True)
                if s.difference
            ] + [
                (r, "route_session", r.collector_id, r.business_date)
                for r in RouteSession.objects.filter(company=company).exclude(difference__isnull=True)
                if r.difference
            ]
            for source, field, person_id, day in sources:
                shortage = source.difference < 0
                amount = abs(source.difference)
                difference = Difference.objects.create(
                    company=company,
                    kind="shortage" if shortage else "overage",
                    amount=amount,
                    resolved=0 if shortage else amount,
                    status="open" if shortage else "resolved",
                    person_id=person_id,
                    branch_id=source.branch_id,
                    occurred_on=day,
                    **{field: source},
                )
                if not shortage:
                    Action.objects.create(
                        company=company,
                        difference=difference,
                        action="income",
                        amount=amount,
                        note="Registrado como ingreso antes de la fase 6",
                    )
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [("cash", "0005_cash_differences")]

    operations = [
        enable_rls("cash_cashdifference"),
        enable_rls("cash_cashdifferenceaction"),
        migrations.RunPython(backfill, migrations.RunPython.noop),
    ]
