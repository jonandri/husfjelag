from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from django.utils.timezone import now as tz_now
from associations.models import (
    Association, AssociationAccess, AssociationRole,
    AssociationBankSettings, BankClaim, BankClaimStatus, Collection,
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
    """GET /associations/{id}/bank/status — temporary stub until Task 11"""
    permission_classes = [IsAuthenticated]

    def get(self, request, association_id):
        return Response({"configured": False, "last_sync_at": None})


class BankDisconnectView(APIView):
    """DELETE /associations/{id}/bank/disconnect — temporary stub until Task 11"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, association_id):
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
    """GET /admin/bank/health — superadmin only — temporary stub until Task 11"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)
        return Response({"summary": {}, "associations": []})


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
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar ekki stilltar."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response({
            "template_id": bank_settings.template_id,
            "updated_at": bank_settings.updated_at.isoformat(),
        })

    def post(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        template_id = request.data.get("template_id", "").strip()
        if not template_id:
            return Response(
                {"detail": "template_id er nauðsynlegt."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bank_settings, _ = AssociationBankSettings.objects.update_or_create(
            association=association,
            defaults={"template_id": template_id},
        )
        return Response({
            "template_id": bank_settings.template_id,
            "updated_at": bank_settings.updated_at.isoformat(),
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
