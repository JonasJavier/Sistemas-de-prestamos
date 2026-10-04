from .base import *  # noqa: F403

DEBUG = True
ALLOWED_HOSTS = ["localhost", "127.0.0.1"]

# The Vite dev server proxies /api but the browser's Origin stays :5173.
CSRF_TRUSTED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]

INTERNAL_IPS = ["127.0.0.1"]
