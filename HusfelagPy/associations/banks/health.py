"""
GET /health/  — system health endpoint for UptimeRobot and superadmin dashboard.

Returns 200 if all critical services are up, 503 if any are down.
No authentication required so UptimeRobot can reach it without a token.
"""
import logging
from datetime import datetime, timezone

from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import status as http_status

from django.conf import settings

from associations.banks import cert as cert_module

logger = logging.getLogger(__name__)


def _check_redis() -> dict:
    try:
        import redis
        r = redis.from_url(settings.CELERY_BROKER_URL, socket_connect_timeout=2, socket_timeout=2)
        r.ping()
        return {"ok": True}
    except Exception as exc:
        logger.warning("Health check: Redis down: %s", exc)
        return {"ok": False, "error": str(exc)}


def _check_celery() -> dict:
    try:
        from config.celery import app as celery_app
        inspector = celery_app.control.inspect(timeout=1.5)
        active = inspector.ping()
        if active:
            worker_count = len(active)
            return {"ok": True, "workers": worker_count}
        return {"ok": False, "error": "No workers responded"}
    except Exception as exc:
        logger.warning("Health check: Celery workers down: %s", exc)
        return {"ok": False, "error": str(exc)}


def _check_cert() -> dict:
    try:
        expiry = cert_module.get_expiry()
        now_utc = datetime.now(tz=timezone.utc)
        days_remaining = (expiry - now_utc).days
        return {
            "ok": days_remaining > 0,
            "expires_at": expiry.date().isoformat(),
            "days_remaining": days_remaining,
            "warning": days_remaining < 30,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


class SystemHealthView(APIView):
    """GET /health/ — Redis, Celery worker, and mTLS cert health."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        redis_status  = _check_redis()
        celery_status = _check_celery()
        cert_status   = _check_cert()

        all_ok = redis_status["ok"] and celery_status["ok"]
        http_code = http_status.HTTP_200_OK if all_ok else http_status.HTTP_503_SERVICE_UNAVAILABLE

        return Response({
            "ok": all_ok,
            "redis":  redis_status,
            "celery": celery_status,
            "cert":   cert_status,
        }, status=http_code)
