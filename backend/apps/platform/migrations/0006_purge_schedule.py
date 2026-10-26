"""D8 (decision 132): the nightly purge of companies cancelled 90 days ago."""

from django.db import migrations

NAME = "Borrar empresas canceladas hace 90 días"


def seed(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="45",
        hour="0",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Santo_Domingo",
    )
    PeriodicTask.objects.get_or_create(
        name=NAME,
        defaults={"task": "apps.platform.tasks.purge_closed_companies", "crontab": schedule},
    )


def unseed(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name=NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("platform", "0005_billing"),
        ("core", "0020_company_closed_at"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
