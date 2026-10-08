"""Base settings shared by every environment.

Environment-specific modules (local, test, production) import * from here
and override what they need. Secrets always come from the environment.
"""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent  # backend/

env = environ.Env()
# overwrite=True: this machine carries global env vars from other projects
# (EMAIL_HOST, DEFAULT_FROM_EMAIL, ...); our .env must always win locally.
environ.Env.read_env(BASE_DIR / ".env", overwrite=True)

SECRET_KEY = env("DJANGO_SECRET_KEY", default="dev-insecure-key-change-me")
DEBUG = False
ALLOWED_HOSTS: list[str] = env.list("DJANGO_ALLOWED_HOSTS", default=[])

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.postgres",  # unaccent/trigram lookups for search (doc 05 - section 8)
    # Third party
    "rest_framework",
    "django_filters",
    "drf_spectacular",
    "allauth",
    "allauth.account",
    "allauth.mfa",
    "allauth.headless",
    "allauth.usersessions",  # doc 06 - 6: see and close your open sessions
    "django_celery_beat",
    "pgtrigger",
    "pghistory",
    # Cobradia
    "apps.platform",
    "apps.core",
    "apps.accounts",
    "apps.customers",
    "apps.lending",
    "apps.payments",
    "apps.cash",
    "apps.collections",
    "apps.ledger",
    "apps.expenses",
    "apps.documents",
    "apps.reports",
    "apps.notifications",
    "apps.audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "allauth.account.middleware.AccountMiddleware",
    "apps.accounts.middleware.SessionTimeoutMiddleware",
    "apps.core.tenancy.TenantMiddleware",
    "apps.accounts.middleware.WorkingHoursMiddleware",
    "apps.accounts.middleware.MFARequiredMiddleware",
    "pghistory.middleware.HistoryMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

# Default ports point at infra/compose.yml, which maps to non-standard host
# ports (54320/63790) so it never clashes with a locally installed service.
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://cobradia:cobradia@localhost:54320/cobradia",
    ),
}
DATABASES["default"]["ATOMIC_REQUESTS"] = True

CACHES = {
    "default": env.cache("REDIS_CACHE_URL", default="redis://localhost:63790/0"),
}

# Authentication -------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# allauth: email-only login, 2FA via authenticator app (decision 034)
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_SIGNUP_FIELDS = ["email*", "password1*"]
ACCOUNT_EMAIL_VERIFICATION = "mandatory"
ACCOUNT_UNIQUE_EMAIL = True
HEADLESS_ONLY = True

# Where the SPA lives. Empty means same origin (production behind Caddy);
# in development it points at the Vite server so emailed links land there.
FRONTEND_URL = env("FRONTEND_URL", default="").rstrip("/")

# Routes in the SPA that allauth links to from its emails (doc 07 routes).
HEADLESS_FRONTEND_URLS = {
    "account_confirm_email": f"{FRONTEND_URL}/verificar-correo/{{key}}",
    "account_reset_password": f"{FRONTEND_URL}/recuperar",
    "account_reset_password_from_key": f"{FRONTEND_URL}/recuperar/{{key}}",
    "account_signup": f"{FRONTEND_URL}/registro",
}
MFA_SUPPORTED_TYPES = ["totp", "recovery_codes"]

# Decision 034: 2FA is mandatory for every user. Enforced by
# MFARequiredMiddleware; off by default in development so seeded test
# accounts stay usable, and on in production.
REQUIRE_MFA = env.bool("REQUIRE_MFA", default=False)

# Decision 035: cashiers and collectors only work within their branch's
# hours. Off by default in development (demos happen at any hour) and in
# tests that do not ask for it; on in production.
ENFORCE_WORKING_HOURS = env.bool("ENFORCE_WORKING_HOURS", default=False)

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},  # decision 036 (06 - section 6)
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Doc 06 - section 6: 5 failed logins lock the address for 15 minutes,
# plus a per-IP limit (allauth keeps the counters in the cache, Redis).
ACCOUNT_RATE_LIMITS = {"login_failed": "10/m/ip,5/15m/key"}

# Doc 06 - section 6: closes after 30 minutes idle and 12 hours in any case
# (SessionTimeoutMiddleware renews the idle window while the user works).
SESSION_COOKIE_AGE = 30 * 60
SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# API ------------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        # 401 (not DRF's default 403) when the session is gone, so the SPA
        # can tell «sesión vencida» apart from «sin permiso».
        "apps.accounts.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
        # Suspended companies keep read access only (F19 step 3).
        "apps.core.api.permissions.CompanyNotSuspendedOrReadOnly",
    ],
    "DEFAULT_FILTER_BACKENDS": [
        "django_filters.rest_framework.DjangoFilterBackend",
        "rest_framework.filters.OrderingFilter",
    ],
    "DEFAULT_PAGINATION_CLASS": "apps.core.api.pagination.Pagination",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_THROTTLE_RATES": {
        "registration": "5/hour",  # F19: public signup, per IP
        "invitation": "30/hour",  # F17: public invitation lookup/accept, per IP
        "public_receipt": "60/minute",  # decision 024: the WhatsApp receipt link, per IP
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Cobradía API",
    "DESCRIPTION": "API del sistema de préstamos multiempresa Cobradía.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Celery ---------------------------------------------------------------------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:63790/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:63790/2")
CELERY_TIMEZONE = "America/Santo_Domingo"
CELERY_BEAT_SCHEDULER = "django_celery_beat.schedulers:DatabaseScheduler"

# I18N / L10N (decision 010: code in English, product in Spanish) -------------
LANGUAGE_CODE = "es-do"
TIME_ZONE = "America/Santo_Domingo"
USE_I18N = True
USE_TZ = True

# Static & media ---------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "media/"
MEDIA_ROOT = BASE_DIR / "media"  # private storage backend arrives in phase 2

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Django 6.1 MAILERS setting (EMAIL_HOST and friends are deprecated).
MAILERS = {
    "default": {
        "BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "OPTIONS": {
            "host": env("EMAIL_HOST", default="localhost"),
            "port": env.int("EMAIL_PORT", default=1025),  # Mailpit in development
        },
    },
}
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Cobradía <no-responder@cobradia.com>")
