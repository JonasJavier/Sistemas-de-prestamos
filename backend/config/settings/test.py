from .base import *  # noqa: F403
from .base import REST_FRAMEWORK

DEBUG = False

# No Redis dependency in tests; also keeps throttle state per-process.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {
    "registration": "1000/hour",
    "invitation": "1000/hour",
    "public_receipt": "1000/minute",
    "portal": "1000/minute",
}

# Fast hashing in tests; never in production.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # noqa: S105

MAILERS = {
    "default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"},
}

CELERY_TASK_ALWAYS_EAGER = True

from .base import BASE_DIR  # noqa: E402

MEDIA_ROOT = BASE_DIR / ".pytest-media"
