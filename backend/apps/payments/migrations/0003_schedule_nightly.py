"""The nightly portfolio job at 00:30, Santo Domingo time (F8 step 1)."""

from django.db import migrations

NAME = "Cartera nocturna: mora, atrasos y conciliación"


def seed(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="30",
        hour="0",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Santo_Domingo",
    )
    PeriodicTask.objects.get_or_create(
        name=NAME,
        defaults={"task": "apps.payments.tasks.nightly_portfolio", "crontab": schedule},
    )


def unseed(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("payments", "0002_rls"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
