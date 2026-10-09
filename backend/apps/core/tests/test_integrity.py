"""Decision 101: the post-restore check."""

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import connection

from apps.payments.tests.test_payments import make_loan, pay


def test_the_check_passes_on_a_sound_database_and_names_a_broken_one(
    tenant, django_capture_on_commit_callbacks, capsys
) -> None:
    loan = make_loan(tenant, first_due_in=0)
    with django_capture_on_commit_callbacks(execute=True):
        pay(tenant, loan, "350")
    call_command("verificar_integridad")
    assert "Todo en orden" in capsys.readouterr().out

    with connection.cursor() as cursor:
        cursor.execute("ALTER TABLE notifications_optout NO FORCE ROW LEVEL SECURITY")
    with pytest.raises(CommandError):
        call_command("verificar_integridad")
    assert "notifications_optout" in capsys.readouterr().err


def test_the_health_check_answers_without_a_session(db, client) -> None:
    response = client.get("/api/v1/salud/")
    assert (response.status_code, response.json()["status"]) == (200, "ok")


def test_the_client_address_comes_from_our_proxy_only(rf, settings) -> None:
    from apps.core.net import client_ip

    request = rf.get("/", HTTP_X_FORWARDED_FOR="6.6.6.6, 190.80.1.2", REMOTE_ADDR="172.18.0.5")
    settings.TRUSTED_PROXY_COUNT = 0  # development: no proxy, the header is ignored
    assert client_ip(request) == "172.18.0.5"
    settings.TRUSTED_PROXY_COUNT = 1  # production: what Caddy appended, not what was sent
    assert client_ip(request) == "190.80.1.2"
    forged = rf.get("/", HTTP_X_FORWARDED_FOR="not-an-ip", REMOTE_ADDR="172.18.0.5")
    assert client_ip(forged) == "172.18.0.5"
