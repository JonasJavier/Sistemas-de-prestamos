"""D11 (decision 136): the renewal notices each morning and the lapse to
read-only each night."""

from django.db import migrations

JOBS = [
    ("Avisar renovaciones de suscripción", "apps.platform.tasks.warn_renewals", "30", "8"),
    ("Suspender suscripciones vencidas", "apps.platform.tasks.expire_subscriptions", "20", "0"),
]


def seed(apps, schema_editor):
    CrontabSchedule = apps.get_model("django_celery_beat", "CrontabSchedule")
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    for name, task, minute, hour in JOBS:
        schedule, _ = CrontabSchedule.objects.get_or_create(
            minute=minute,
            hour=hour,
            day_of_week="*",
            day_of_month="*",
            month_of_year="*",
            timezone="America/Santo_Domingo",
        )
        PeriodicTask.objects.get_or_create(name=name, defaults={"task": task, "crontab": schedule})


def unseed(apps, schema_editor):
    PeriodicTask = apps.get_model("django_celery_beat", "PeriodicTask")
    PeriodicTask.objects.filter(name__in=[name for name, *_ in JOBS]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("platform", "0007_renewal_warned_on"),
        ("django_celery_beat", "0019_alter_periodictasks_options"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
