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
# The platform's health check probes Gunicorn directly over plain HTTP.
SECURE_REDIRECT_EXEMPT = [r"^api/v1/salud/$"]

# Decision 102: Caddy is the one proxy of ours in front of Gunicorn.
TRUSTED_PROXY_COUNT = env.int("TRUSTED_PROXY_COUNT", default=1)
ALLAUTH_TRUSTED_PROXY_COUNT = TRUSTED_PROXY_COUNT
REST_FRAMEWORK = {**REST_FRAMEWORK, "NUM_PROXIES": TRUSTED_PROXY_COUNT or None}  # noqa: F405

# Decision 101: no Django admin (it has no 2FA) and no public API schema.
ADMIN_ENABLED = env.bool("ADMIN_ENABLED", default=False)
API_DOCS = env.bool("API_DOCS", default=False)
if not API_DOCS:
    # The schema generator's hints only matter where the schema is served.
    SILENCED_SYSTEM_CHECKS = ["drf_spectacular.W001", "drf_spectacular.W002"]

# Decision 034: mandatory 2FA. Can only be disabled explicitly via env.
REQUIRE_MFA = env.bool("REQUIRE_MFA", default=True)

# Decision 035: working hours for cashiers and collectors.
ENFORCE_WORKING_HOURS = env.bool("ENFORCE_WORKING_HOURS", default=True)

# Phase 10 (decision 101): the production stack in infra/production.
DATABASES["default"]["CONN_MAX_AGE"] = env.int("DB_CONN_MAX_AGE", default=60)  # noqa: F405
DATABASES["default"]["CONN_HEALTH_CHECKS"] = True  # noqa: F405

# Decision 113: on Railway the API, the worker and the beat run apart and
# share no disk, so the private files go to an S3-compatible bucket. Never
# public: every read goes through Django or a short-lived signed URL.
if env("AWS_STORAGE_BUCKET_NAME", default=""):
    STORAGES = {
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
        "default": {
            "BACKEND": "storages.backends.s3.S3Storage",
            "OPTIONS": {
                "bucket_name": env("AWS_STORAGE_BUCKET_NAME"),
                "endpoint_url": env("AWS_S3_ENDPOINT_URL"),
                "region_name": env("AWS_S3_REGION_NAME", default=None),
                "access_key": env("AWS_ACCESS_KEY_ID"),
                "secret_key": env("AWS_SECRET_ACCESS_KEY"),
                "addressing_style": env("AWS_S3_ADDRESSING_STYLE", default="virtual"),
                "default_acl": None,
                "querystring_auth": True,
                "querystring_expire": 300,
                "file_overwrite": False,
            },
        },
    }

# The mail provider: TLS and credentials (Mailpit needs none in development).
MAILERS = {
    "default": {
        "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "OPTIONS": {
            "host": env("EMAIL_HOST"),
            "port": env.int("EMAIL_PORT", default=587),
            "username": env("EMAIL_USER", default=""),
            "password": env("EMAIL_PASSWORD", default=""),
            "use_tls": env.bool("EMAIL_USE_TLS", default=True),
            "timeout": 20,
        },
    },
}

# The SPA and the e-mail links must point at the public address.
if not FRONTEND_URL.startswith("https://"):  # noqa: F405
    raise RuntimeError("FRONTEND_URL must be the public https address of the app.")

# Logs to stdout (Docker keeps them); errors to Sentry when configured.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"plain": {"format": "%(asctime)s %(levelname)s %(name)s %(message)s"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "plain"}},
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {"django.security": {"handlers": ["console"], "level": "WARNING"}},
}

SENTRY_DSN = env("SENTRY_DSN", default="")
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=env("SENTRY_ENVIRONMENT", default="production"),
        release=env("APP_VERSION", default=None),
        send_default_pii=False,  # customers' data never leaves (doc 06 - 7)
        traces_sample_rate=0.0,
    )
