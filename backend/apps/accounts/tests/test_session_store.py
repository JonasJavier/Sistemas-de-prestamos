"""Two requests in flight never erase each other's session keys (decision 117)."""

from importlib import import_module

from django.conf import settings


def _store():
    return import_module(settings.SESSION_ENGINE).SessionStore


def _saved(**data) -> str:
    session = _store()()
    session.update(data)
    session.save()
    return session.session_key


def test_overlapping_requests_keep_each_others_keys(db) -> None:
    key = _saved(user="ana")
    first, second = _store()(key), _store()(key)
    first.get("user"), second.get("user")  # both read the same session

    first["secret"] = "ABC"
    first.save()
    second["seen"] = 123
    second.save()

    assert _store()(key).load() == {"user": "ana", "secret": "ABC", "seen": 123}


def test_a_key_removed_by_one_request_stays_removed(db) -> None:
    key = _saved(user="ana", secret="ABC")
    first, second = _store()(key), _store()(key)
    first.get("user"), second.get("user")

    del first["secret"]
    first.save()
    second["seen"] = 123
    second.save()

    assert _store()(key).load() == {"user": "ana", "seen": 123}


def test_a_value_changed_in_place_is_saved(db) -> None:
    key = _saved(methods=[1])
    session = _store()(key)
    methods = session["methods"]
    methods.append(2)
    session["methods"] = methods
    session.save()

    assert _store()(key).load()["methods"] == [1, 2]
