from pathlib import Path
import environ

BASE_DIR = Path(__file__).resolve().parent.parent.parent

env = environ.Env()
environ.Env.read_env(BASE_DIR / ".env")

SECRET_KEY = env("SECRET_KEY", default="dev-insecure-key-change-in-production")
DEBUG = env.bool("DJANGO_DEBUG", default=False)
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS", default=["localhost", "127.0.0.1"])

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "django_celery_beat",
    "bugsnag.django",
    "users",
    "associations",
]

MIDDLEWARE = [
    "bugsnag.django.middleware.BugsnagMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": env.db("DATABASE_URL", default="postgres://husfelag:husfelag@localhost:5432/husfelag")
}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.db.DatabaseCache",
        "LOCATION": "django_cache",
    }
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "Atlantic/Reykjavik"
USE_I18N = True
USE_TZ = True

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "users.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": "60/minute",
        "user": "300/minute",
        "login": "5/minute",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "Húsfélag API",
    "DESCRIPTION": "SaaS platform for Icelandic Building Associations",
    "VERSION": "1.0.0",
}

CELERY_BROKER_URL = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_RESULT_BACKEND = env("REDIS_URL", default="redis://localhost:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"

# Húsfjelag OIDC (id.husfjelag.is) — Authorization Code + PKCE, client_secret_basic
OIDC_CLIENT_ID = env("OIDC_CLIENT_ID", default="husfjelag-web")
OIDC_CLIENT_SECRET = env("OIDC_CLIENT_SECRET", default="")
OIDC_ISSUER = "https://id.husfjelag.is"
OIDC_AUTH_ENDPOINT = "https://id.husfjelag.is/auth"
OIDC_TOKEN_ENDPOINT = "https://id.husfjelag.is/token"
OIDC_USERINFO_ENDPOINT = "https://id.husfjelag.is/me"
OIDC_JWKS_URI = "https://id.husfjelag.is/jwks"
OIDC_END_SESSION_ENDPOINT = "https://id.husfjelag.is/session/end"  # for future RP-initiated logout
OIDC_REDIRECT_URI = env("OIDC_REDIRECT_URI", default="http://localhost:8010/auth/callback")

# Skattur Cloud — Icelandic company registry API
SKATTUR_CLOUD_API_KEY = env("SKATTUR_CLOUD_API_KEY", default="")

# Já / Gagnatorg — national person registry
JA_API_KEY = env("JA_API_KEY", default="")

# ── Bank integration ──────────────────────────────────────────────────────────
BANK_FERNET_KEY = env("BANK_FERNET_KEY", default="")

# Landsbankinn mTLS certificate — injected by Doppler (never stored in .env)
BUNADARSKILRIKI     = env("BUNADARSKILRIKI", default="")
BUNADARSKILRIKI_PWD = env("BUNADARSKILRIKI_PWD", default="")

BANK_LANDSBANKINN_AUTH_URL = env("BANK_LANDSBANKINN_AUTH_URL", default="")
BANK_LANDSBANKINN_API_BASE = env(
    "BANK_LANDSBANKINN_API_BASE",
    default="https://apisandbox.landsbankinn.is/api",
)
BANK_LANDSBANKINN_EMAIL = env("BANK_LANDSBANKINN_EMAIL", default="")

FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3010")

# Email — Resend (transactional email; event reminders). When RESEND_API_KEY is
# empty (local dev) the app logs instead of sending.
RESEND_API_KEY = env("RESEND_API_KEY", default="")
DEFAULT_FROM_EMAIL = env("DEFAULT_FROM_EMAIL", default="Húsfélag <noreply@husfjelag.is>")

# Bugsnag error monitoring
BUGSNAG = {
    "api_key": env("BUGSNAG_API_KEY", default=""),
    "project_root": str(BASE_DIR),
    "release_stage": env("DJANGO_ENV", default="development"),
    "notify_release_stages": ["production"],
}

# Celery beat — periodic tasks
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    "sync-all-bank-transactions": {
        "task": "associations.banks.tasks.sync_all_associations",
        "schedule": crontab(hour=3, minute=0),
    },
    "sync-all-claim-statuses": {
        "task": "associations.banks.tasks.sync_all_claim_statuses",
        "schedule": crontab(hour=3, minute=30),
    },
    "send-event-reminders": {
        "task": "associations.tasks.send_event_reminders",
        "schedule": crontab(hour=8, minute=0),
    },
}
