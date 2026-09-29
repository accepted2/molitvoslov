from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent.parent


# =========================================================
# ENVIRONMENT
# =========================================================

IS_PRODUCTION = os.environ.get("RENDER") is not None or os.environ.get("DJANGO_ENV") == "production"

DEBUG = not IS_PRODUCTION


# =========================================================
# SECURITY
# =========================================================

if IS_PRODUCTION:
    SECRET_KEY = os.environ.get("SECRET_KEY")

    if not SECRET_KEY:
        raise RuntimeError("SECRET_KEY is required in production")
else:
    SECRET_KEY = "django-insecure-local-development-only"


ALLOWED_HOSTS = [
    "127.0.0.1",
    "localhost",
    "10.0.2.2",
]

RENDER_EXTERNAL_HOSTNAME = os.environ.get("RENDER_EXTERNAL_HOSTNAME")

if RENDER_EXTERNAL_HOSTNAME:
    ALLOWED_HOSTS.append(RENDER_EXTERNAL_HOSTNAME)

EXTRA_ALLOWED_HOSTS = os.environ.get(
    "DJANGO_ALLOWED_HOSTS",
    "",
)

if EXTRA_ALLOWED_HOSTS:
    ALLOWED_HOSTS.extend(host.strip() for host in EXTRA_ALLOWED_HOSTS.split(",") if host.strip())


# =========================================================
# APPLICATIONS
# =========================================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework.authtoken",
    "corsheaders",
    "api",
]


MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]


ROOT_URLCONF = "backend.urls"


TEMPLATES = [
    {
        "BACKEND": ("django.template.backends." "django.DjangoTemplates"),
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                ("django.template.context_processors." "request"),
                ("django.contrib.auth.context_processors." "auth"),
                ("django.contrib.messages." "context_processors.messages"),
            ],
        },
    },
]


WSGI_APPLICATION = "backend.wsgi.application"


# =========================================================
# DATABASE
# =========================================================

SUPABASE_DB_PASSWORD = os.environ.get("SUPABASE_DB_PASSWORD")

if SUPABASE_DB_PASSWORD:
    DATABASES = {
        "default": {
            "ENGINE": ("django.db.backends.postgresql"),
            "NAME": os.environ.get(
                "SUPABASE_DB_NAME",
                "postgres",
            ),
            "USER": os.environ.get(
                "SUPABASE_DB_USER",
                "postgres.gguwppijpnpjpmpkiumd",
            ),
            "PASSWORD": SUPABASE_DB_PASSWORD,
            "HOST": os.environ.get(
                "SUPABASE_DB_HOST",
                ("aws-1-eu-central-1." "pooler.supabase.com"),
            ),
            "PORT": os.environ.get(
                "SUPABASE_DB_PORT",
                "5432",
            ),
            "CONN_MAX_AGE": 60,
            "CONN_HEALTH_CHECKS": True,
            "OPTIONS": {
                "sslmode": "require",
            },
        }
    }

elif IS_PRODUCTION:
    raise RuntimeError("SUPABASE_DB_PASSWORD is required " "in production")

else:
    DATABASES = {
        "default": {
            "ENGINE": ("django.db.backends.sqlite3"),
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }


# =========================================================
# PASSWORD VALIDATION
# =========================================================

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": ("django.contrib.auth.password_validation." "UserAttributeSimilarityValidator"),
    },
    {
        "NAME": ("django.contrib.auth.password_validation." "MinimumLengthValidator"),
    },
    {
        "NAME": ("django.contrib.auth.password_validation." "CommonPasswordValidator"),
    },
    {
        "NAME": ("django.contrib.auth.password_validation." "NumericPasswordValidator"),
    },
]


# =========================================================
# INTERNATIONALIZATION
# =========================================================

LANGUAGE_CODE = "ru"

TIME_ZONE = "Europe/Kyiv"

USE_I18N = True
USE_TZ = True


# =========================================================
# STATIC
# =========================================================

STATIC_URL = "/static/"

STATIC_ROOT = BASE_DIR / "staticfiles"


STORAGES = {
    "default": {
        "BACKEND": ("django.core.files.storage." "FileSystemStorage"),
    },
    "staticfiles": {
        "BACKEND": ("whitenoise.storage." "CompressedManifestStaticFilesStorage"),
    },
}


# =========================================================
# REST FRAMEWORK
# =========================================================

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        ("rest_framework.authentication." "TokenAuthentication"),
        ("rest_framework.authentication." "SessionAuthentication"),
    ]
}


# =========================================================
# GOOGLE AUTH
# =========================================================

GOOGLE_OAUTH_WEB_CLIENT_ID = os.environ.get(
    "GOOGLE_OAUTH_WEB_CLIENT_ID",
    "",
)

if IS_PRODUCTION and not GOOGLE_OAUTH_WEB_CLIENT_ID:
    raise RuntimeError("GOOGLE_OAUTH_WEB_CLIENT_ID is required " "in production")




# =========================================================
# SUPABASE STORAGE / ПОМЯННИК
# =========================================================

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL",
    "",
).rstrip("/")

# Предпочитаем новый Supabase secret key.
# Legacy service_role оставлен как совместимый fallback.
SUPABASE_STORAGE_SECRET_KEY = (
    os.environ.get("SUPABASE_SECRET_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or ""
)

MEMORIAL_STORAGE_BUCKET = os.environ.get(
    "MEMORIAL_STORAGE_BUCKET",
    "memorials",
)

MEMORIAL_PHOTO_MAX_BYTES = int(
    os.environ.get(
        "MEMORIAL_PHOTO_MAX_BYTES",
        str(12 * 1024 * 1024),
    )
)

# =========================================================
# HTTPS / PRODUCTION SECURITY
# =========================================================

if IS_PRODUCTION:
    SECURE_PROXY_SSL_HEADER = (
        "HTTP_X_FORWARDED_PROTO",
        "https",
    )

    SECURE_SSL_REDIRECT = True

    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    SECURE_CONTENT_TYPE_NOSNIFF = True

    X_FRAME_OPTIONS = "DENY"


# =========================================================
# EMAIL
# =========================================================

MAILERS = {
    "default": {
        "BACKEND": ("django.core.mail.backends." "console.EmailBackend"),
    },
}
