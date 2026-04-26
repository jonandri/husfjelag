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
    "users",
    "associations",
]

MIDDLEWARE = [
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

# Kenni OIDC
KENNI_CLIENT_ID = env("KENNI_CLIENT_ID", default="@digit.is/husfjelag")
KENNI_CLIENT_SECRET = env("KENNI_CLIENT_SECRET", default="")
KENNI_ISSUER = "https://idp.kenni.is/digit.is"
KENNI_AUTH_ENDPOINT = "https://idp.kenni.is/digit.is/oidc/auth"
KENNI_TOKEN_ENDPOINT = "https://idp.kenni.is/digit.is/oidc/token"
KENNI_JWKS_URI = "https://idp.kenni.is/digit.is/oidc/jwks"
KENNI_REDIRECT_URI = env("KENNI_REDIRECT_URI", default="http://localhost:8003/auth/callback")

# Skattur Cloud — Icelandic company registry API
SKATTUR_CLOUD_API_KEY = env("SKATTUR_CLOUD_API_KEY", default="")

# ── Bank integration ──────────────────────────────────────────────────────────
BANK_FERNET_KEY = env("BANK_FERNET_KEY", default="")

BANK_LANDSBANKINN_ENABLED = env.bool("BANK_LANDSBANKINN_ENABLED", default=False)
BANK_LANDSBANKINN_API_KEY = env("BANK_LANDSBANKINN_API_KEY", default="")
BANK_LANDSBANKINN_CERT_PATH = env("BANK_LANDSBANKINN_CERT_PATH", default="")
BANK_LANDSBANKINN_CERT_PASSWORD = env("BANK_LANDSBANKINN_CERT_PASSWORD", default="")
BANK_LANDSBANKINN_AUTH_URL = env(
    "BANK_LANDSBANKINN_AUTH_URL",
    default="https://mtls-auth.landsbankinn.is/connect/token",
)
BANK_LANDSBANKINN_API_BASE = env(
    "BANK_LANDSBANKINN_API_BASE",
    default="https://apisandbox.landsbankinn.is/api",
)

FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3010")

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
}
