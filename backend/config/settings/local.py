from .base import *  # noqa: F403
from .base import env

DEBUG = True
# A phone on the same network, or an HTTPS tunnel, reaches Vite at another
# address: list it in DEV_EXTRA_HOSTS / DEV_EXTRA_ORIGINS (backend/DEV.md).
ALLOWED_HOSTS = ["localhost", "127.0.0.1", *env.list("DEV_EXTRA_HOSTS", default=[])]

# The Vite dev server proxies /api but the browser's Origin stays :5173.
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    *env.list("DEV_EXTRA_ORIGINS", default=[]),
]

INTERNAL_IPS = ["127.0.0.1"]
