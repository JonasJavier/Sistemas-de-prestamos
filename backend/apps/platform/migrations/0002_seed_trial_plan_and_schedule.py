"""Seed the trial plan (F19 limits) and the nightly trial-expiry job."""

from django.db import migrations


def seed(apps, schema_editor):
    Plan = apps.get_model("platform", "Plan")
    Plan.objects.get_or_create(
        name="Prueba",
        defaults={
            "monthly_price": 0,
            "currency": "DOP",
            "max_users": 5,
            "max_branches": 1,
            "max_active_loans": 100,
            "is_trial": True,
            "is_active": True,
        },
    )

    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    schedule, _ = CrontabSchedule.objects.get_or_create(
        minute="15",
        hour="0",
        day_of_week="*",
        day_of_month="*",
        month_of_year="*",
        timezone="America/Santo_Domingo",
    )
    PeriodicTask.objects.get_or_create(
        name="Suspender pruebas vencidas",
        defaults={
            "task": "apps.platform.tasks.expire_trials",
            "crontab": schedule,
        },
    )


def unseed(apps, schema_editor):
    Plan = apps.get_model("platform", "Plan")
    Plan.objects.filter(name="Prueba", is_trial=True).delete()
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name="Suspender pruebas vencidas").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("platform", "0001_initial"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
