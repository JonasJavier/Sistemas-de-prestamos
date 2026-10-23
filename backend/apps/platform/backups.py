"""Off-site, encrypted backups and their restoration (decision 123, doc 10 §3).

Every night the «respaldo» service dumps the whole database (as the
superuser, so row-level security hides nothing), packs the private files of
the bucket, encrypts both with the owner's PUBLIC gpg key and uploads them
to a second bucket in another region. The service cannot read what it
wrote: only the owner's private key, kept offline, decrypts a backup.

Environment of the service:

- ``BACKUP_DATABASE_URL``: the superuser connection (Railway's Postgres).
- ``BACKUP_S3_ENDPOINT``, ``BACKUP_S3_BUCKET``, ``BACKUP_S3_ACCESS_KEY``,
  ``BACKUP_S3_SECRET_KEY``, ``BACKUP_S3_REGION``: the destination bucket.
  Any S3-compatible store works (another Railway bucket today; Cloudflare
  R2 or Backblaze B2 are a four-variable change).
- ``BACKUP_PUBLIC_KEY_B64``: the armored public key, base64-encoded.
- ``BACKUP_KEEP_DAYS`` (30): older copies are deleted from the destination.
- The app's own ``AWS_*`` and ``DATABASE_URL``: the files to back up and
  the role the restored copy is checked with.
"""

# ruff: noqa: S603, S607 - pg_dump, pg_restore, psql and gpg from PATH, with fixed arguments
from __future__ import annotations

import base64
import datetime as dt
import logging
import os
import subprocess
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from django.conf import settings

log = logging.getLogger(__name__)

DB_PREFIX = "base/"
MEDIA_PREFIX = "archivos/"
STAMP = "%Y%m%dT%H%M%SZ"


class BackupError(Exception):
    pass


@dataclass(frozen=True)
class Destination:
    endpoint: str
    bucket: str
    access_key: str
    secret_key: str
    region: str | None

    @classmethod
    def from_env(cls) -> Destination:
        try:
            return cls(
                endpoint=os.environ["BACKUP_S3_ENDPOINT"],
                bucket=os.environ["BACKUP_S3_BUCKET"],
                access_key=os.environ["BACKUP_S3_ACCESS_KEY"],
                secret_key=os.environ["BACKUP_S3_SECRET_KEY"],
                region=os.environ.get("BACKUP_S3_REGION") or None,
            )
        except KeyError as exc:
            raise BackupError(
                f"Falta la variable {exc.args[0]} del destino de los respaldos."
            ) from exc

    def client(self):
        import boto3
        from botocore.config import Config

        return boto3.client(
            "s3",
            endpoint_url=self.endpoint,
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            region_name=self.region,
            config=Config(s3={"addressing_style": "virtual"}),
        )


def source_files() -> tuple[Any, str] | None:
    """The app's private bucket (production); None when files live on disk."""
    options = settings.STORAGES.get("default", {}).get("OPTIONS")
    if not options or "bucket_name" not in options:
        return None
    import boto3
    from botocore.config import Config

    client = boto3.client(
        "s3",
        endpoint_url=options.get("endpoint_url"),
        aws_access_key_id=options.get("access_key"),
        aws_secret_access_key=options.get("secret_key"),
        region_name=options.get("region_name"),
        config=Config(s3={"addressing_style": options.get("addressing_style", "virtual")}),
    )
    return client, options["bucket_name"]


def superuser_url() -> str:
    url = os.environ.get("BACKUP_DATABASE_URL", "")
    if not url:
        raise BackupError("Falta BACKUP_DATABASE_URL (la conexión de superusuario a Postgres).")
    return url


def with_database(url: str, name: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, f"/{name}", parts.query, parts.fragment))


# --- gpg ------------------------------------------------------------------------


def _gpg_home() -> Path:
    home = Path(os.environ.get("GNUPGHOME") or tempfile.gettempdir()) / "cobradia-gpg"
    home.mkdir(parents=True, exist_ok=True)
    home.chmod(0o700)
    return home


def public_key_file() -> Path:
    armored = os.environ.get("BACKUP_PUBLIC_KEY_B64", "")
    if not armored:
        raise BackupError("Falta BACKUP_PUBLIC_KEY_B64 (la llave pública de los respaldos).")
    path = _gpg_home() / "public.asc"
    path.write_bytes(base64.b64decode(armored))
    return path


def encrypt_command(key: Path) -> list[str]:
    return [
        "gpg",
        "--batch",
        "--yes",
        "--quiet",
        "--homedir",
        str(_gpg_home()),
        "--trust-model",
        "always",
        "--recipient-file",
        str(key),
        "--encrypt",
    ]


def import_private_key() -> None:
    """Only during a restoration: the owner lends the private key through
    ``BACKUP_PRIVATE_KEY_B64`` and removes the variable afterwards."""
    armored = os.environ.get("BACKUP_PRIVATE_KEY_B64", "")
    if not armored:
        raise BackupError(
            "Falta BACKUP_PRIVATE_KEY_B64: la llave privada, solo mientras dura la restauración."
        )
    subprocess.run(
        ["gpg", "--batch", "--quiet", "--homedir", str(_gpg_home()), "--import"],
        input=base64.b64decode(armored),
        check=True,
    )


def decrypt_command() -> list[str]:
    return ["gpg", "--batch", "--quiet", "--homedir", str(_gpg_home()), "--decrypt"]


# --- backing up ---------------------------------------------------------------


@dataclass(frozen=True)
class Copy:
    key: str
    size: int


def _upload_stream(destination: Destination, key: str, stream) -> int:
    client = destination.client()
    counted = _Counting(stream)
    client.upload_fileobj(counted, destination.bucket, key)
    return counted.total


class _Counting:
    """Counts the bytes a stream yields (boto3 reads it in chunks)."""

    def __init__(self, stream) -> None:
        self.stream = stream
        self.total = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self.stream.read(size)
        self.total += len(chunk)
        return chunk


def backup_database(destination: Destination, stamp: str) -> Copy:
    """pg_dump → gpg → bucket, streamed: nothing touches the disk."""
    key = public_key_file()
    dump = subprocess.Popen(
        ["pg_dump", "--format", "custom", "--no-owner", "--no-privileges", superuser_url()],
        stdout=subprocess.PIPE,
    )
    gpg = subprocess.Popen(encrypt_command(key), stdin=dump.stdout, stdout=subprocess.PIPE)
    dump.stdout.close()  # type: ignore[union-attr]
    name = f"{DB_PREFIX}cobradia-db-{stamp}.dump.gpg"
    try:
        size = _upload_stream(destination, name, gpg.stdout)
    finally:
        gpg.stdout.close()  # type: ignore[union-attr]
    if gpg.wait() != 0 or dump.wait() != 0:
        raise BackupError("pg_dump o gpg fallaron: el respaldo de la base no se completó.")
    return Copy(name, size)


def backup_files(destination: Destination, stamp: str) -> Copy | None:
    """Every object of the app's bucket into one encrypted tar.gz. None
    when the installation keeps files on disk (development)."""
    source = source_files()
    if source is None:
        return None
    client, bucket = source
    key = public_key_file()
    with tempfile.TemporaryFile() as archive:
        with tarfile.open(fileobj=archive, mode="w|gz") as tar:
            pages = client.get_paginator("list_objects_v2").paginate(Bucket=bucket)
            for page in pages:
                for item in page.get("Contents", []):
                    body = client.get_object(Bucket=bucket, Key=item["Key"])["Body"]
                    info = tarfile.TarInfo(item["Key"])
                    info.size = item["Size"]
                    info.mtime = int(item["LastModified"].timestamp())
                    tar.addfile(info, body)
        archive.seek(0)
        gpg = subprocess.Popen(encrypt_command(key), stdin=archive, stdout=subprocess.PIPE)
        name = f"{MEDIA_PREFIX}cobradia-archivos-{stamp}.tar.gz.gpg"
        try:
            size = _upload_stream(destination, name, gpg.stdout)
        finally:
            gpg.stdout.close()  # type: ignore[union-attr]
    if gpg.wait() != 0:
        raise BackupError("gpg falló: el respaldo de los archivos no se completó.")
    return Copy(name, size)


def prune(destination: Destination, keep_days: int, now: dt.datetime | None = None) -> list[str]:
    """Copies older than keep_days leave the destination."""
    now = now or dt.datetime.now(dt.UTC)
    limit = now - dt.timedelta(days=keep_days)
    client = destination.client()
    gone: list[str] = []
    for prefix in (DB_PREFIX, MEDIA_PREFIX):
        pages = client.get_paginator("list_objects_v2").paginate(
            Bucket=destination.bucket, Prefix=prefix
        )
        for page in pages:
            for item in page.get("Contents", []):
                if item["LastModified"] < limit:
                    client.delete_object(Bucket=destination.bucket, Key=item["Key"])
                    gone.append(item["Key"])
    return gone


def run_backup(keep_days: int | None = None, files: bool = True) -> dict:
    destination = Destination.from_env()
    keep = keep_days or int(os.environ.get("BACKUP_KEEP_DAYS", "30"))
    stamp = dt.datetime.now(dt.UTC).strftime(STAMP)
    database = backup_database(destination, stamp)
    archive = backup_files(destination, stamp) if files else None
    removed = prune(destination, keep)
    return {"stamp": stamp, "database": database, "files": archive, "removed": removed}


def list_copies(destination: Destination, prefix: str = DB_PREFIX) -> list[dict]:
    client = destination.client()
    rows: list[dict] = []
    for page in client.get_paginator("list_objects_v2").paginate(
        Bucket=destination.bucket, Prefix=prefix
    ):
        rows.extend(page.get("Contents", []))
    return sorted(rows, key=lambda item: item["Key"])


# --- restoring ----------------------------------------------------------------


def _download(destination: Destination, key: str, target: Path) -> None:
    destination.client().download_file(destination.bucket, key, str(target))


def _psql(url: str, sql: str) -> None:
    subprocess.run(["psql", "--quiet", "-v", "ON_ERROR_STOP=1", url, "-c", sql], check=True)


def restore_database(
    destination: Destination, key: str, into: str, *, role: str = "cobradia"
) -> None:
    """The dump into a fresh database owned by the app role, with every
    table owned by it (so RLS is forced on the app as in production)."""
    if not into.replace("_", "").isalnum() or not into.islower():
        raise BackupError(f"Nombre de base inválido: {into}")
    admin = superuser_url()
    with tempfile.TemporaryDirectory() as folder:
        encrypted = Path(folder) / "db.dump.gpg"
        _download(destination, key, encrypted)
        _psql(with_database(admin, "postgres"), f"DROP DATABASE IF EXISTS {into} WITH (FORCE)")
        _psql(with_database(admin, "postgres"), f"CREATE DATABASE {into} OWNER {role}")
        with (Path(folder) / "db.dump").open("wb") as plain:
            subprocess.run([*decrypt_command(), str(encrypted)], stdout=plain, check=True)
        subprocess.run(
            [
                "pg_restore",
                "--no-owner",
                "--no-privileges",
                "--role",
                role,
                "--exit-on-error",
                "--dbname",
                with_database(admin, into),
                str(Path(folder) / "db.dump"),
            ],
            check=True,
        )


def restore_files(destination: Destination, key: str) -> int:
    """Puts every file of the archive back in the app's bucket."""
    source = source_files()
    if source is None:
        raise BackupError(
            "Esta instalación guarda los archivos en disco; nada que restaurar al bucket."
        )
    client, bucket = source
    count = 0
    with tempfile.TemporaryDirectory() as folder:
        encrypted = Path(folder) / "archivos.tar.gz.gpg"
        _download(destination, key, encrypted)
        plain = Path(folder) / "archivos.tar.gz"
        with plain.open("wb") as out:
            subprocess.run([*decrypt_command(), str(encrypted)], stdout=out, check=True)
        with tarfile.open(plain, "r:gz") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                body = tar.extractfile(member)
                if body is None:
                    continue
                client.upload_fileobj(body, bucket, member.name)
                count += 1
    return count


def check_restored(into: str) -> None:
    """The restored copy must still be the same system (verificar_integridad)."""
    app_url = os.environ.get("DATABASE_URL", "")
    if not app_url:
        raise BackupError("Falta DATABASE_URL (la conexión de la app) para comprobar la copia.")
    env = {**os.environ, "DATABASE_URL": with_database(app_url, into)}
    subprocess.run(["python", "manage.py", "verificar_integridad"], env=env, check=True)
