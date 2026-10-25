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
    "allauth.socialaccount",  # decision 118: «Continuar con Google»
    "allauth.socialaccount.providers.google",
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
    "apps.platform.middleware.SupportReadOnlyMiddleware",
    "apps.accounts.middleware.WorkingHoursMiddleware",
    "apps.accounts.middleware.MFARequiredMiddleware",
    "apps.platform.features.PlanFeatureMiddleware",  # decision 124
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
# ports (54320/16379) so it never clashes with a locally installed service.
DATABASES = {
    "default": env.db(
        "DATABASE_URL",
        default="postgres://cobradia:cobradia@localhost:54320/cobradia",
    ),
}
DATABASES["default"]["ATOMIC_REQUESTS"] = True

CACHES = {
    "default": env.cache("REDIS_CACHE_URL", default="redis://localhost:16379/0"),
}

# Authentication -------------------------------------------------------------
AUTH_USER_MODEL = "accounts.User"

AUTHENTICATION_BACKENDS = [
    "django.contrib.auth.backends.ModelBackend",
    "allauth.account.auth_backends.AuthenticationBackend",
]

# allauth: email-only login, 2FA via authenticator app (decision 034)
ACCOUNT_LOGIN_METHODS = {"email"}
ACCOUNT_USER_MODEL_USERNAME_FIELD = None  # the email is the username
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
    "socialaccount_login_error": f"{FRONTEND_URL}/entrar/google",
}

# Decision 118: allauth's own signup stays closed (a person only joins with
# their company, /registro, or an invitation); Google completes one of those.
ACCOUNT_ADAPTER = "apps.accounts.adapters.AccountAdapter"
SOCIALACCOUNT_ADAPTER = "apps.accounts.adapters.SocialAccountAdapter"
ACCOUNT_SIGNUP_FORM_CLASS = "apps.accounts.forms.JoinFields"
# An existing person whose Google address matches (Google verifies it) just
# signs in; a new one is asked which company they join.
SOCIALACCOUNT_EMAIL_AUTHENTICATION = True
SOCIALACCOUNT_EMAIL_AUTHENTICATION_AUTO_CONNECT = True
SOCIALACCOUNT_AUTO_SIGNUP = False
SOCIALACCOUNT_PROVIDERS: dict = {
    "google": {
        "SCOPE": ["profile", "email"],
        "AUTH_PARAMS": {"access_type": "online"},
        "OAUTH_PKCE_ENABLED": True,
        # Off until the owner creates the OAuth client (infra/railway/README.md).
        "APPS": [
            {
                "client_id": env("GOOGLE_CLIENT_ID", default=""),
                "secret": env("GOOGLE_CLIENT_SECRET", default=""),
            }
        ]
        if env("GOOGLE_CLIENT_ID", default="")
        else [],
    }
}

# Decision 121: passkeys (WebAuthn) beside the authenticator app. A passkey
# alone signs the person in (no password, no code) and also serves as the
# second step after the password. The browser only talks WebAuthn over
# HTTPS or localhost; the insecure flag is for development behind Vite.
MFA_SUPPORTED_TYPES = ["totp", "recovery_codes", "webauthn"]
MFA_PASSKEY_LOGIN_ENABLED = True
MFA_WEBAUTHN_ALLOW_INSECURE_ORIGIN = env.bool("MFA_WEBAUTHN_ALLOW_INSECURE_ORIGIN", default=False)
# Decision 118: after the code, «confiar en este dispositivo» skips it there for
# 30 days. Critical actions still ask for it (apps/accounts/reauth.py), and a
# new password or authenticator voids every trusted browser.
MFA_TRUST_ENABLED = True
MFA_TRUST_COOKIE_AGE = 30 * 24 * 60 * 60
# Decision 117: a code from the previous (or next) 30 seconds still counts, so
# a phone a few seconds off or a code typed as it changes is not refused.
# allauth still refuses a code that was already used to sign in.
MFA_TOTP_TOLERANCE = 1

# Decision 034: 2FA is mandatory for every user. Enforced by
# MFARequiredMiddleware; off by default in development so seeded test
# accounts stay usable, and on in production.
REQUIRE_MFA = env.bool("REQUIRE_MFA", default=False)

# Decision 101: Django's admin and the API schema, on in development only.
ADMIN_ENABLED = env.bool("ADMIN_ENABLED", default=True)
APP_VERSION = env("APP_VERSION", default="dev")
API_DOCS = env.bool("API_DOCS", default=True)

# Decision 035: cashiers and collectors only work within their branch's
# hours. Off by default in development (demos happen at any hour) and in
# tests that do not ask for it; on in production.
ENFORCE_WORKING_HOURS = env.bool("ENFORCE_WORKING_HOURS", default=False)

# Decision 075: the legal ceiling on a loan's annual effective cost, for
# every company, once the usury law (TC/0235/26) or the Junta Monetaria sets
# one. A fraction (2.5 = 250 %); empty means no legal ceiling yet. Each
# company may set a stricter one of its own.
LEGAL_MAX_EFFECTIVE_ANNUAL_RATE = env.str("LEGAL_MAX_EFFECTIVE_ANNUAL_RATE", default="") or None

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 12},  # decision 036 (06 - section 6)
    },
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Decision 102: how many proxies of ours stand in front of Django (Caddy in
# production). Their X-Forwarded-For gives the visitor's address to the
# throttles, the login limits and the audit; 0 trusts no header.
TRUSTED_PROXY_COUNT = env.int("TRUSTED_PROXY_COUNT", default=0)

# Decision 103: the terms of service and privacy notice in force (cobradia.com);
# bump it whenever either text changes.
LEGAL_TERMS_VERSION = "2026-10-09"
ALLAUTH_TRUSTED_PROXY_COUNT = TRUSTED_PROXY_COUNT

# Doc 06 - section 6: 5 failed logins lock the address for 15 minutes,
# plus a per-IP limit (allauth keeps the counters in the cache, Redis).
ACCOUNT_RATE_LIMITS = {"login_failed": "10/m/ip,5/15m/key"}

# Doc 06 - section 6: closes after 30 minutes idle and 12 hours in any case
# (SessionTimeoutMiddleware renews the idle window while the user works).
SESSION_COOKIE_AGE = 30 * 60
SESSION_ABSOLUTE_SECONDS = 12 * 60 * 60
# Decision 118: «Mantenerme conectado» at sign-in, for a personal device:
# closes after 7 days without use and after 30 days in any case. Without it
# the session also ends when the browser closes.
SESSION_REMEMBER_IDLE_SECONDS = 7 * 24 * 60 * 60
SESSION_REMEMBER_ABSOLUTE_SECONDS = 30 * 24 * 60 * 60
# Decision 117: two requests in flight never erase each other's session keys.
SESSION_ENGINE = "apps.accounts.session_store"
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
    "EXCEPTION_HANDLER": "apps.core.api.errors.exception_handler",
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "NUM_PROXIES": TRUSTED_PROXY_COUNT or None,
    "DEFAULT_THROTTLE_RATES": {
        "registration": "5/hour",  # F19: public signup, per IP
        "invitation": "30/hour",  # F17: public invitation lookup/accept, per IP
        "public_receipt": "60/minute",  # decision 024: the WhatsApp receipt link, per IP
        "portal": "30/minute",  # decision 099: the customer portal, per IP
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Cobradía API",
    "DESCRIPTION": "API del sistema de préstamos multiempresa Cobradía.",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# Celery ---------------------------------------------------------------------
CELERY_BROKER_URL = env("CELERY_BROKER_URL", default="redis://localhost:16379/1")
CELERY_RESULT_BACKEND = env("CELERY_RESULT_BACKEND", default="redis://localhost:16379/2")
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

# F18 (decision 097): who delivers WhatsApp and SMS. «registro» records the
# message without sending it until a provider is contracted («twilio»).
MESSAGING_PROVIDERS = {
    "whatsapp": env("MESSAGING_WHATSAPP_PROVIDER", default="registro"),
    "sms": env("MESSAGING_SMS_PROVIDER", default="registro"),
}
TWILIO_ACCOUNT_SID = env("TWILIO_ACCOUNT_SID", default="")
TWILIO_AUTH_TOKEN = env("TWILIO_AUTH_TOKEN", default="")
TWILIO_FROM_WHATSAPP = env("TWILIO_FROM_WHATSAPP", default="")
TWILIO_FROM_SMS = env("TWILIO_FROM_SMS", default="")
