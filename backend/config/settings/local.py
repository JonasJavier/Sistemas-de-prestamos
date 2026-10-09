from .base import *  # noqa: F403
from .base import env

DEBUG = True
# A phone on the same network, or an HTTPS tunnel, reaches Vite at another
# address: list it in DEV_EXTRA_HOSTS / DEV_EXTRA_ORIGINS (backend/DEV.md).
ALLOWED_HOSTS = ["localhost", "127.0.0.1", *env.list("DEV_EXTRA_HOSTS", default=[])]

# The Vite dev server proxies /api but the browser's Origin stays Vite's:
# any local port is trusted (config.dev); a phone or a tunnel is listed.
CSRF_TRUSTED_ORIGINS = env.list("DEV_EXTRA_ORIGINS", default=[])
MIDDLEWARE = [  # noqa: F405
    "config.dev.LoopbackCsrfMiddleware" if m.endswith(".CsrfViewMiddleware") else m
    for m in MIDDLEWARE  # noqa: F405
]
REST_FRAMEWORK = {  # noqa: F405
    **REST_FRAMEWORK,  # noqa: F405
    "DEFAULT_AUTHENTICATION_CLASSES": ["config.dev.LoopbackSessionAuthentication"],
}

INTERNAL_IPS = ["127.0.0.1"]

# Without a worker running, tasks (report exports) run in the request's
# process right after it commits; CELERY_EAGER=false to try a real worker.
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_EAGER", default=True)
