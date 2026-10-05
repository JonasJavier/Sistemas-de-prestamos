"""Search extensions (pg_trgm + unaccent, both trusted) and the province
catalog of the Dominican Republic (31 provinces + Distrito Nacional).
Municipalities and sectors are loaded later with the official catalog.
"""

from django.contrib.postgres.operations import TrigramExtension, UnaccentExtension
from django.db import migrations

PROVINCES = [
    "Azua",
    "Bahoruco",
    "Barahona",
    "Dajabón",
    "Distrito Nacional",
    "Duarte",
    "El Seibo",
    "Elías Piña",
    "Espaillat",
    "Hato Mayor",
    "Hermanas Mirabal",
    "Independencia",
    "La Altagracia",
    "La Romana",
    "La Vega",
    "María Trinidad Sánchez",
    "Monseñor Nouel",
    "Monte Cristi",
    "Monte Plata",
    "Pedernales",
    "Peravia",
    "Puerto Plata",
    "Samaná",
    "San Cristóbal",
    "San José de Ocoa",
    "San Juan",
    "San Pedro de Macorís",
    "Sánchez Ramírez",
    "Santiago",
    "Santiago Rodríguez",
    "Santo Domingo",
    "Valverde",
]


def seed_provinces(apps, schema_editor):
    Province = apps.get_model("core", "Province")
    for name in PROVINCES:
        Province.objects.get_or_create(name=name)


def unseed_provinces(apps, schema_editor):
    Province = apps.get_model("core", "Province")
    Province.objects.filter(name__in=PROVINCES).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0003_rls"),
    ]

    operations = [
        TrigramExtension(),
        UnaccentExtension(),
        migrations.RunPython(seed_provinces, unseed_provinces),
    ]
