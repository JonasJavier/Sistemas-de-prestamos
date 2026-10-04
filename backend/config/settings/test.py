from .base import *  # noqa: F403

DEBUG = False

# Fast hashing in tests; never in production.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]  # noqa: S105

MAILERS = {
    "default": {"BACKEND": "django.core.mail.backends.locmem.EmailBackend"},
}

CELERY_TASK_ALWAYS_EAGER = True
