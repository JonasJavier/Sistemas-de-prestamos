"""Yearly job (1 December): seed next year's holidays for every company."""

from django.db import migrations

NAME = "Sembrar feriados del próximo año"


def seed(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="30",
        hour="1",
        day_of_week="*",
        day_of_month="1",
        month_of_year="12",
        timezone="America/Santo_Domingo",
    )
    PeriodicTask.objects.get_or_create(
        name=NAME,
        defaults={"task": "apps.core.tasks.seed_next_year_holidays", "crontab": schedule},
    )


def unseed(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0006_company_f3_settings"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
