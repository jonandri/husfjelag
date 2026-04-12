import secrets
from datetime import datetime, timezone, timedelta, date

from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny

from associations.models import (
    Association, AssociationAccess, AssociationRole,
    BankConsent, BankApiAuditLog, BankNotificationLog,
)
from associations.banks.oauth_client import generate_pkce_pair, store_oauth_state, pop_oauth_state
from associations.banks.consent_store import encrypt_token, decrypt_token


def _require_chair_or_cfo(request, association):
    """Returns 403 Response if user is not CHAIR, CFO, or superadmin for this association."""
    user = request.user
    if user.is_superadmin:
        return None
    access = AssociationAccess.objects.filter(
        user=user, association=association, active=True,
        role__in=[AssociationRole.CHAIR, AssociationRole.CFO],
    ).exists()
    if not access:
        return Response(
            {"detail": "Aðeins stjórnendur félagsins hafa aðgang að þessari aðgerð."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None


def _get_provider(bank: str):
    if bank == "LANDSBANKINN":
        from associations.banks.landsbankinn import LandsbankinnProvider
        return LandsbankinnProvider()
    raise ValueError(f"Unknown bank: {bank}")


class BankConnectView(APIView):
    """GET /associations/{id}/bank/connect?bank=LANDSBANKINN"""
    permission_classes = [IsAuthenticated]

    def get(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        bank = request.query_params.get("bank", "LANDSBANKINN").upper()
        if not getattr(settings, f"BANK_{bank}_ENABLED", False):
            return Response(
                {"detail": f"{bank} samþætting er ekki virk."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        verifier, challenge = generate_pkce_pair()
        state = secrets.token_urlsafe(32)
        store_oauth_state(state, {
            "association_id": association_id,
            "bank": bank,
            "user_id": request.user.id,
            "verifier": verifier,
        })

        provider = _get_provider(bank)
        url = provider.get_authorization_url(state=state, code_challenge=challenge)
        return HttpResponseRedirect(url)


class BankCallbackView(APIView):
    """GET /bank/callback/{bank} — open endpoint, no JWT"""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, bank):
        bank = bank.upper()
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        frontend_base = getattr(settings, "FRONTEND_URL", "http://localhost:3010")

        if not code or not state:
            return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=error&reason=missing_params")

        payload = pop_oauth_state(state)
        if not payload:
            return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=error&reason=invalid_state")

        association_id = payload["association_id"]
        verifier = payload["verifier"]

        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=error&reason=assoc_not_found")

        try:
            provider = _get_provider(bank)
            token_data = provider.exchange_code(code=code, code_verifier=verifier)
        except Exception:
            return HttpResponseRedirect(
                f"{frontend_base}/bank-settings?status=error&reason=token_exchange_failed"
            )

        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = int(token_data.get("expires_in", 3600))
        consent_id = token_data.get("consent_id", "")

        token_expires_at = datetime.now(tz=timezone.utc) + timedelta(seconds=expires_in)
        consent_expires_at = date.today() + timedelta(days=90)

        BankConsent.objects.update_or_create(
            association=association,
            defaults={
                "bank": bank,
                "consent_id": consent_id,
                "access_token": encrypt_token(access_token),
                "refresh_token": encrypt_token(refresh_token) if refresh_token else "",
                "token_expires_at": token_expires_at,
                "consent_expires_at": consent_expires_at,
                "is_active": True,
                "renewal_notified_at": None,
            },
        )

        return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=ok&assoc={association_id}")


class BankStatusView(APIView):
    """GET /associations/{id}/bank/status"""
    permission_classes = [IsAuthenticated]

    def get(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            consent = BankConsent.objects.get(association=association, is_active=True)
        except BankConsent.DoesNotExist:
            return Response({"detail": "Engin virk bankatengind."}, status=status.HTTP_404_NOT_FOUND)

        days_left = (consent.consent_expires_at - date.today()).days
        return Response({
            "bank": consent.bank,
            "bank_display": consent.get_bank_display(),
            "consent_expires_at": consent.consent_expires_at.isoformat(),
            "days_until_expiry": days_left,
            "is_expiring_soon": days_left <= 10,
            "updated_at": consent.updated_at.isoformat(),
        })


class BankDisconnectView(APIView):
    """DELETE /associations/{id}/bank/disconnect"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            consent = BankConsent.objects.get(association=association, is_active=True)
        except BankConsent.DoesNotExist:
            return Response({"detail": "Engin virk bankatengind."}, status=status.HTTP_404_NOT_FOUND)

        consent.is_active = False
        consent.access_token = ""
        consent.refresh_token = ""
        consent.save(update_fields=["is_active", "access_token", "refresh_token", "updated_at"])
        return Response({"detail": "Bankatengind aftengt."})


class AdminBankSyncView(APIView):
    """POST /admin/associations/{id}/bank/sync — superadmin only"""
    permission_classes = [IsAuthenticated]

    def post(self, request, association_id):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)

        from associations.banks.tasks import sync_transactions
        sync_transactions.delay(association_id)
        return Response({"detail": "Samstilling hafin."}, status=status.HTTP_202_ACCEPTED)


class AdminBankHealthView(APIView):
    """GET /admin/bank/health — superadmin only"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)

        today = date.today()
        in_14 = today + timedelta(days=14)

        consents = BankConsent.objects.select_related("association").filter(is_active=True)
        active = consents.count()
        expiring_14 = consents.filter(consent_expires_at__lte=in_14).count()
        expired = BankConsent.objects.filter(is_active=True, consent_expires_at__lt=today).count()

        from django.utils.timezone import now
        month_start = now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        notifications_this_month = BankNotificationLog.objects.filter(
            sent_at__gte=month_start, success=True
        ).count()

        rows = []
        for c in consents.order_by("consent_expires_at"):
            days_left = (c.consent_expires_at - today).days
            last_sync = (
                c.association.bank_audit_logs
                .filter(http_method="GET")
                .order_by("-timestamp")
                .values_list("timestamp", flat=True)
                .first()
            )
            last_notif = (
                c.association.bank_notification_logs
                .order_by("-sent_at")
                .values_list("sent_at", flat=True)
                .first()
            )
            rows.append({
                "association_id": c.association.id,
                "association_name": c.association.name,
                "bank": c.bank,
                "bank_display": c.get_bank_display(),
                "consent_expires_at": c.consent_expires_at.isoformat(),
                "days_until_expiry": days_left,
                "is_expiring_soon": days_left <= 14,
                "last_sync_at": last_sync.isoformat() if last_sync else None,
                "last_notification_at": last_notif.isoformat() if last_notif else None,
            })

        return Response({
            "summary": {
                "active_connections": active,
                "expiring_within_14_days": expiring_14,
                "expired": expired,
                "notifications_this_month": notifications_this_month,
            },
            "associations": rows,
        })
