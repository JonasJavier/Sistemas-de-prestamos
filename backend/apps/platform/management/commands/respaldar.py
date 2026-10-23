"""Decision 123: the nightly, encrypted, off-site backup.

manage.py respaldar            # once, now
manage.py respaldar --diario   # stays up: every day at BACKUP_HOUR (RD)
"""

import datetime as dt
import os
import time
import zoneinfo

from django.core.management.base import BaseCommand, CommandError

from apps.platform import backups

SANTO_DOMINGO = zoneinfo.ZoneInfo("America/Santo_Domingo")


def next_run(now: dt.datetime, hour: int) -> dt.datetime:
    """The next «hour» o'clock in Santo Domingo, at least a minute away."""
    local = now.astimezone(SANTO_DOMINGO)
    candidate = local.replace(hour=hour, minute=0, second=0, microsecond=0)
    if candidate <= local + dt.timedelta(minutes=1):
        candidate += dt.timedelta(days=1)
    return candidate


class Command(BaseCommand):
    help = "Respalda la base y los archivos, cifrados, en el bucket de respaldos."

    def add_arguments(self, parser) -> None:
        parser.add_argument(
            "--diario",
            action="store_true",
            help="Queda corriendo y respalda cada día a la hora BACKUP_HOUR (3 por defecto).",
        )
        parser.add_argument(
            "--sin-archivos", action="store_true", help="Solo la base, sin el bucket de archivos."
        )

    def handle(self, *args, **options) -> None:
        if not options["diario"]:
            self._once(files=not options["sin_archivos"])
            return
        hour = int(os.environ.get("BACKUP_HOUR", "3"))
        while True:
            at = next_run(dt.datetime.now(dt.UTC), hour)
            self.stdout.write(f"Próximo respaldo: {at:%d/%m/%Y %H:%M} (Santo Domingo)")
            time.sleep(max((at - dt.datetime.now(SANTO_DOMINGO)).total_seconds(), 60))
            try:
                self._once(files=not options["sin_archivos"])
            except Exception as exc:  # noqa: BLE001 - the loop must survive a bad night
                self._report(exc)

    def _once(self, *, files: bool) -> None:
        try:
            result = backups.run_backup(files=files)
        except backups.BackupError as exc:
            raise CommandError(str(exc)) from exc
        db = result["database"]
        self.stdout.write(f"Base: {db.key} ({db.size / 1_048_576:.1f} MB)")
        if result["files"]:
            self.stdout.write(
                f"Archivos: {result['files'].key} ({result['files'].size / 1_048_576:.1f} MB)"
            )
        else:
            self.stdout.write("Archivos: ninguno (esta instalación los guarda en disco).")
        if result["removed"]:
            self.stdout.write(f"Copias antiguas borradas: {len(result['removed'])}")
        self.stdout.write(self.style.SUCCESS(f"Respaldo listo: {result['stamp']}"))

    def _report(self, exc: Exception) -> None:
        self.stderr.write(f"El respaldo falló: {exc}")
        try:
            import sentry_sdk

            sentry_sdk.capture_exception(exc)
        except Exception as reporting:  # noqa: BLE001 - without Sentry the log is the record
            self.stderr.write(f"(sin Sentry: {reporting})")
