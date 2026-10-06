"""RLS on pghistory event tables: they hold full copies of personal data."""

from django.db import migrations

from apps.core.rls import enable_rls

EVENT_TABLES = [
    "customers_customerevent",
    "customers_employmentevent",
    "customers_businessevent",
    "customers_relativeevent",
    "customers_referenceevent",
    "customers_customerfileevent",
    "customers_collateralevent",
    "customers_vehicledetailevent",
    "customers_propertydetailevent",
    "customers_collateralfileevent",
]


class Migration(migrations.Migration):
    dependencies = [
        ("customers", "0002_rls"),
    ]

    operations = [enable_rls(table) for table in EVENT_TABLES]
