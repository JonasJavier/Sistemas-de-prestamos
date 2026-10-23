"""Decision 123: the off-site backup and its restoration, without a bucket."""

import datetime as dt
from unittest import mock

import pytest

from apps.platform import backups
from apps.platform.management.commands.respaldar import SANTO_DOMINGO, next_run


def test_the_next_run_is_the_next_three_in_santo_domingo() -> None:
    # 20:00 UTC = 16:00 in Santo Domingo: tomorrow at 3.
    at = next_run(dt.datetime(2026, 10, 23, 20, 0, tzinfo=dt.UTC), 3)
    assert at == dt.datetime(2026, 10, 24, 3, 0, tzinfo=SANTO_DOMINGO)
    # 06:30 UTC = 02:30: today at 3.
    at = next_run(dt.datetime(2026, 10, 23, 6, 30, tzinfo=dt.UTC), 3)
    assert at == dt.datetime(2026, 10, 23, 3, 0, tzinfo=SANTO_DOMINGO)


def test_the_database_name_is_swapped_and_the_rest_kept() -> None:
    url = "postgres://postgres:s3cr3t@postgres.railway.internal:5432/railway?sslmode=prefer"
    assert (
        backups.with_database(url, "cobradia_restore")
        == "postgres://postgres:s3cr3t@postgres.railway.internal:5432/cobradia_restore?sslmode=prefer"
    )


def test_a_missing_destination_variable_is_said_in_words(monkeypatch) -> None:
    monkeypatch.delenv("BACKUP_S3_ENDPOINT", raising=False)
    with pytest.raises(backups.BackupError, match="BACKUP_S3_ENDPOINT"):
        backups.Destination.from_env()


def test_old_copies_are_pruned_and_fresh_ones_kept() -> None:
    now = dt.datetime(2026, 10, 23, 8, 0, tzinfo=dt.UTC)
    rows = [
        {"Key": "base/cobradia-db-old.dump.gpg", "LastModified": now - dt.timedelta(days=31)},
        {"Key": "base/cobradia-db-new.dump.gpg", "LastModified": now - dt.timedelta(days=1)},
    ]
    client = mock.Mock()
    client.get_paginator.return_value.paginate.return_value = [{"Contents": rows}]
    destination = backups.Destination("https://s3", "respaldos", "k", "s", None)
    with mock.patch.object(backups.Destination, "client", return_value=client):
        gone = backups.prune(destination, keep_days=30, now=now)
    # Both prefixes are walked with the same fake pages: the old one goes each time.
    assert gone == ["base/cobradia-db-old.dump.gpg"] * 2
    client.delete_object.assert_called_with(Bucket="respaldos", Key="base/cobradia-db-old.dump.gpg")


def test_a_drill_refuses_a_bad_database_name() -> None:
    destination = backups.Destination("https://s3", "respaldos", "k", "s", None)
    with pytest.raises(backups.BackupError, match="inválido"):
        backups.restore_database(destination, "base/x.dump.gpg", "Cobradia; DROP")
