from .base import *  # noqa: F403
from .base import REST_FRAMEWORK

DEBUG = False

# No Redis dependency in tests; also keeps throttle state per-process.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "registration": "1000/hour",
    "invitation": "1000/hour",
}

# Fast hashing in tests; never in production.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # noqa: S105

MAILERS = {
    "default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"},
}

CELERY_TASK_ALWAYS_EAGER = True
