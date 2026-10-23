"""Sessions that two requests in flight cannot erase for each other (decision 117).

Django writes back the whole session a request read. When two requests
overlap, the one that finishes last wipes whatever the other added: the
screens ask several things at once, and the once-a-minute touch of
``SessionTimeoutMiddleware`` made the authenticator setup lose its secret
(the right code was refused). This store saves only what this request
changed, merged over the row as it is now, under a row lock.
"""

import copy

from django.contrib.sessions.backends import db
from django.db import router, transaction


class SessionStore(db.SessionStore):
    def __init__(self, session_key: str | None = None) -> None:
        super().__init__(session_key)
        self._loaded: dict | None = None

    def load(self) -> dict:
        data = super().load()
        # A deep copy: a list changed in place still reads as a change.
        self._loaded = copy.deepcopy(data)
        return data

    def save(self, must_create: bool = False) -> None:
        if must_create or self.session_key is None or self._loaded is None:
            return super().save(must_create)
        using = router.db_for_write(self.model)
        with transaction.atomic(using=using):
            row = (
                self.model.objects.using(using)
                .select_for_update()
                .filter(session_key=self.session_key)
                .first()
            )
            if row is not None:
                self._session_cache = self._merge(self.decode(row.session_data))
            super().save()
        self._loaded = copy.deepcopy(self._session_cache)
        return None

    def _merge(self, stored: dict) -> dict:
        loaded = self._loaded or {}
        mine = self._session
        for key, value in mine.items():
            if key not in loaded or loaded[key] != value:
                stored[key] = value
        for key in loaded.keys() - mine.keys():
            stored.pop(key, None)
        return stored
