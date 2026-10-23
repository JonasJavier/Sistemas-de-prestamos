"""Decision 123: restoring a backup, as a drill or for real.

    manage.py restaurar --listar                      # what the destination holds
    manage.py restaurar                               # drill: latest → cobradia_restore + check
    manage.py restaurar --clave base/cobradia-db-….dump.gpg --base cobradia_restore
    manage.py restaurar --produccion --clave … [--archivos archivos/…tar.gz.gpg]

Needs the PRIVATE key in BACKUP_PRIVATE_KEY_B64 while it runs; the owner
sets it just before and removes it right after. A real recovery stops
api, worker and beat first and targets the «cobradia» database.
"""

from django.core.management.base import BaseCommand, CommandError

from apps.platform import backups

DRILL_DATABASE = "cobradia_restore"
PRODUCTION_DATABASE = "cobradia"


class Command(BaseCommand):
    help = "Restaura un respaldo en una base aparte (simulacro) o en producción."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--listar", action="store_true", help="Solo lista las copias.")
        parser.add_argument("--clave", default="", help="La copia de la base; la última si falta.")
        parser.add_argument(
            "--archivos", default="", help="La copia de archivos a devolver al bucket."
        )
        parser.add_argument("--base", default=DRILL_DATABASE, help="Base destino del simulacro.")
        parser.add_argument(
            "--produccion",
            action="store_true",
            help="Recuperación real sobre «cobradia» (api, worker y beat detenidos antes).",
        )
        parser.add_argument(
            "--conservar",
            action="store_true",
            help="Deja la base del simulacro en lugar de borrarla.",
        )

    def handle(self, *args, **options) -> None:
        try:
            destination = backups.Destination.from_env()
            if options["listar"]:
                self._list(destination)
                return
            backups.import_private_key()
            key = options["clave"] or self._latest(destination)
            into = PRODUCTION_DATABASE if options["produccion"] else options["base"]
            if into == PRODUCTION_DATABASE and not options["produccion"]:
                raise CommandError("Para tocar «cobradia» usa --produccion.")
            self.stdout.write(f"Restaurando {key} en «{into}»…")
            backups.restore_database(destination, key, into)
            self.stdout.write("Base restaurada. Comprobando que sigue siendo el mismo sistema…")
            backups.check_restored(into)
            if options["archivos"]:
                count = backups.restore_files(destination, options["archivos"])
                self.stdout.write(f"Archivos devueltos al bucket: {count}")
            if not options["produccion"] and not options["conservar"]:
                backups._psql(  # noqa: SLF001 - the drill cleans after itself
                    backups.with_database(backups.superuser_url(), "postgres"),
                    f"DROP DATABASE IF EXISTS {into} WITH (FORCE)",
                )
                self.stdout.write(f"Simulacro terminado: «{into}» borrada.")
        except backups.BackupError as exc:
            raise CommandError(str(exc)) from exc
        self.stdout.write(self.style.SUCCESS("Restauración correcta."))

    def _latest(self, destination: backups.Destination) -> str:
        rows = backups.list_copies(destination)
        if not rows:
            raise CommandError("El destino no tiene ninguna copia de la base.")
        return rows[-1]["Key"]

    def _list(self, destination: backups.Destination) -> None:
        for prefix in (backups.DB_PREFIX, backups.MEDIA_PREFIX):
            for row in backups.list_copies(destination, prefix):
                self.stdout.write(
                    f"{row['LastModified']:%d/%m/%Y %H:%M}  {row['Size'] / 1_048_576:8.1f} MB  "
                    f"{row['Key']}"
                )
