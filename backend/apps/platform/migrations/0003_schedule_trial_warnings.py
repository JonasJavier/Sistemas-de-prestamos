"""F19 (decision 104): the end-of-trial notices, every morning."""

from django.db import migrations

NAME = "Avisar fin de la prueba"


def seed(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="0",
        hour="8",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Santo_Domingo",
    )
    PeriodicTask.objects.get_or_create(
        name=NAME, defaults={"task": "apps.platform.tasks.warn_trials", "crontab": schedule}
    )


def unseed(apps, schema_editor):
    apps.get_model("django_celery_beat", "PeriodicTask").objects.filter(name=NAME).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("platform", "0002_seed_trial_plan_and_schedule"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
