from .base import *  # noqa: F403
from .base import env

DEBUG = False

# Required in production: the deploy fails loudly if they are missing.
SECRET_KEY = env("DJANGO_SECRET_KEY")
ALLOWED_HOSTS = env.list("DJANGO_ALLOWED_HOSTS")

# HTTPS everywhere (Caddy terminates TLS).
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

# Decision 034: mandatory 2FA. Can only be disabled explicitly via env.
REQUIRE_MFA = env.bool("REQUIRE_MFA", default=True)
