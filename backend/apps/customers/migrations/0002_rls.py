"""Row-level security for every customers table (doc 05 - section 7, rule 11)."""

from django.db import migrations

from apps.core.rls import enable_rls

TABLES = [
    "customers_customer",
    "customers_employment",
    "customers_business",
    "customers_relative",
    "customers_reference",
    "customers_customerfile",
    "customers_collateral",
    "customers_vehicledetail",
    "customers_propertydetail",
    "customers_collateralfile",
]


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0001_initial"),
    ]

    operations = [enable_rls(table) for table in TABLES]
