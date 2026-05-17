import logging

import bugsnag
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from django.utils.timezone import now as tz_now

logger = logging.getLogger(__name__)

from associations.models import (
    Association, AssociationAccess, AssociationRole,
    AssociationBankSettings, BankProvider, BankClaim, BankClaimStatus, Collection,
)


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

        configured = AssociationBankSettings.objects.filter(association=association).exists()

        last_log = (
            association.bank_audit_logs
            .filter(http_method="GET")
            .order_by("-timestamp")
            .values("timestamp", "status_code")
            .first()
        )

        last_sync_at = last_log["timestamp"].isoformat() if last_log else None
        last_sync_ok = (last_log["status_code"] < 400) if last_log else None

        return Response({
            "configured": configured,
            "last_sync_at": last_sync_at,
            "last_sync_ok": last_sync_ok,
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

        deleted_count, _ = AssociationBankSettings.objects.filter(association=association).delete()
        if deleted_count == 0:
            return Response(
                {"detail": "Engar bankastillingar til að hreinsa."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"detail": "Bankastillingar hreinsaðar."})


class AdminBankSyncView(APIView):
    """POST /admin/associations/{id}/bank/sync — chair, CFO, or superadmin"""
    permission_classes = [IsAuthenticated]

    def post(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            from associations.banks.tasks import sync_transactions
            sync_transactions.delay(association_id)
        except Exception as exc:
            logger.error("Failed to enqueue sync for association %s: %s", association_id, exc)
            bugsnag.notify(exc, context="admin_bank_sync", extra_data={"association_id": association_id})
            return Response({"detail": f"Gat ekki ræst samstillingu: {exc}"}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        return Response({"detail": "Samstilling hafin."}, status=status.HTTP_202_ACCEPTED)


class AdminBankHealthView(APIView):
    """GET /admin/bank/health — superadmin only"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superadmin:
            return Response(
                {"detail": "Aðeins kerfisstjórar hafa aðgang."},
                status=status.HTTP_403_FORBIDDEN,
            )

        settings_qs = AssociationBankSettings.objects.select_related("association").all()
        total_configured = settings_qs.count()
        total_unsent_claims = BankClaim.objects.filter(status=BankClaimStatus.UNPAID).count()

        rows = []
        for bs in settings_qs.order_by("association__name"):
            last_sync = (
                bs.association.bank_audit_logs
                .filter(http_method="GET")
                .order_by("-timestamp")
                .values_list("timestamp", flat=True)
                .first()
            )
            rows.append({
                "association_id": bs.association.id,
                "association_name": bs.association.name,
                "template_id": bs.template_id,
                "last_sync_at": last_sync.isoformat() if last_sync else None,
                "unsent_claims": BankClaim.objects.filter(
                    collection__budget__association=bs.association,
                    status=BankClaimStatus.UNPAID,
                ).count(),
            })

        return Response({
            "summary": {
                "configured_associations": total_configured,
                "total_unsent_claims": total_unsent_claims,
            },
            "associations": rows,
        })


class AssociationBankSettingsView(APIView):
    """GET/POST /associations/{id}/bank/settings"""
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
            bs = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar ekki stilltar."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "bank": bs.bank,
            "api_key_set": bool(bs.api_key),
            "template_id": bs.template_id,
            "last_sync_at": bs.last_sync_at.isoformat() if bs.last_sync_at else None,
            "updated_at": bs.updated_at.isoformat(),
        })

    def post(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        bank = request.data.get("bank", BankProvider.LANDSBANKINN).strip()
        if bank not in BankProvider.values:
            return Response(
                {"detail": f"Ógildur banki. Veldu: {', '.join(BankProvider.values)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        defaults = {"bank": bank}
        if "template_id" in request.data:
            defaults["template_id"] = request.data["template_id"].strip()
        if "api_key" in request.data:
            defaults["api_key"] = request.data["api_key"].strip()

        bs, _ = AssociationBankSettings.objects.update_or_create(
            association=association,
            defaults=defaults,
        )

        # Kick off a sync whenever the API key is set or updated
        if "api_key" in request.data and request.data["api_key"].strip():
            try:
                from associations.banks.tasks import sync_transactions
                sync_transactions.delay(association.id)
            except Exception as exc:
                logger.error("Failed to enqueue sync for association %s: %s", association.id, exc)
                bugsnag.notify(exc, context="bank_settings:auto_sync", extra_data={"association_id": association.id})

        return Response({
            "bank": bs.bank,
            "api_key_set": bool(bs.api_key),
            "template_id": bs.template_id,
            "last_sync_at": bs.last_sync_at.isoformat() if bs.last_sync_at else None,
            "updated_at": bs.updated_at.isoformat(),
        })


class SendClaimView(APIView):
    """POST /Collection/{collection_id}/send-claim"""
    permission_classes = [IsAuthenticated]

    def post(self, request, collection_id):
        try:
            collection = Collection.objects.select_related(
                "budget__association", "payer", "apartment"
            ).get(id=collection_id)
        except Collection.DoesNotExist:
            return Response(
                {"detail": "Innheimtufærsla ekki fundin."},
                status=status.HTTP_404_NOT_FOUND,
            )

        association = collection.budget.association
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        # Guard: already sent
        if BankClaim.objects.filter(collection=collection).exists():
            return Response(
                {"detail": "Krafa hefur þegar verið send fyrir þessa færslu."},
                status=status.HTTP_409_CONFLICT,
            )

        # Guard: no payer kennitala
        if not collection.payer or not collection.payer.kennitala:
            return Response(
                {"detail": "Greiðandi hefur enga kennitölu skráða."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # Load template settings
        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar eru ekki stilltar fyrir þetta félag."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        from associations.banks.landsbankinn import create_claim, _last_day_of_month
        try:
            api_response = create_claim(collection, bank_settings)
        except Exception as exc:
            return Response(
                {"detail": f"Villa við sendingu kröfu: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        due_date = _last_day_of_month(collection.budget.year, collection.month)
        claim = BankClaim.objects.create(
            collection=collection,
            claim_id=api_response["id"],
            payor_national_id=collection.payer.kennitala,
            amount=collection.amount_total,
            due_date=due_date,
            status=BankClaimStatus.UNPAID,
            sent_at=tz_now(),
        )
        return Response({
            "claim_id": claim.claim_id,
            "status": claim.status,
            "due_date": claim.due_date.isoformat(),
            "sent_at": claim.sent_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class SendAllClaimsView(APIView):
    """POST /associations/{id}/bank/send-all-claims?month=4&year=2026"""
    permission_classes = [IsAuthenticated]

    def post(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        month = request.query_params.get("month")
        year = request.query_params.get("year")
        if not month or not year:
            return Response(
                {"detail": "month og year eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        month, year = int(month), int(year)

        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar eru ekki stilltar."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        collections = (
            Collection.objects
            .select_related("budget", "payer", "apartment")
            .filter(
                budget__association=association,
                budget__year=year,
                budget__is_active=True,
                month=month,
            )
            .exclude(bank_claim__isnull=False)
        )

        from associations.banks.landsbankinn import create_claim, _last_day_of_month
        sent = 0
        skipped = 0
        errors = []

        for collection in collections:
            if not collection.payer or not collection.payer.kennitala:
                skipped += 1
                continue

            try:
                api_response = create_claim(collection, bank_settings)
            except Exception as exc:
                errors.append(f"Íbúð {collection.apartment.anr}: {exc}")
                skipped += 1
                continue

            due_date = _last_day_of_month(year, month)
            BankClaim.objects.create(
                collection=collection,
                claim_id=api_response["id"],
                payor_national_id=collection.payer.kennitala,
                amount=collection.amount_total,
                due_date=due_date,
                status=BankClaimStatus.UNPAID,
                sent_at=tz_now(),
            )
            sent += 1

        response_data = {"sent": sent, "skipped": skipped}
        if errors:
            response_data["errors"] = errors
        return Response(response_data)


class CertHealthView(APIView):
    """
    GET /health/cert — no authentication required.

    Returns cert validity and days remaining without exposing subject/issuer.
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request):
        from datetime import datetime, timezone
        from associations.banks import cert

        try:
            expiry = cert.get_expiry()
            now_utc = datetime.now(tz=timezone.utc)
            days_remaining = (expiry - now_utc).days
            valid = days_remaining > 0
            return Response({
                "valid": valid,
                "expires_at": expiry.date().isoformat(),
                "days_remaining": days_remaining,
                "warning": days_remaining < 30,
            })
        except Exception as exc:
            return Response({
                "valid": False,
                "expires_at": None,
                "days_remaining": None,
                "warning": True,
                "error": str(exc),
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
