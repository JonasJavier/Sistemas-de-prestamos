"""The DGII 606 type of the starting categories (decision 085)."""

from django.db import migrations

TYPES = {
    "Sueldos y salarios": "01",
    "Alquiler del local": "03",
    "Impuestos y tasas": "06",
    "Comisiones bancarias": "07",
}


def set_types(apps, schema_editor):
    Company = apps.get_model("core", "Company")
    Category = apps.get_model("expenses", "ExpenseCategory")
    with schema_editor.connection.cursor() as cursor:
        for company in Company.objects.all():
            cursor.execute("SELECT set_config('app.current_company', %s, false)", [str(company.id)])
            for name, code in TYPES.items():
                Category.objects.filter(company=company, name=name).update(dgii_type=code)
        cursor.execute("RESET app.current_company")


class Migration(migrations.Migration):
    dependencies = [("expenses", "0005_category_dgii_type")]

    operations = [migrations.RunPython(set_types, migrations.RunPython.noop)]
