import logging

import bugsnag
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from django.utils.timezone import now as tz_now

logger = logging.getLogger(__name__)

import requests

from associations.models import (
    Association, AssociationAccess, AssociationRole,
    AssociationBankSettings, BankProvider, ClaimMode,
    BankClaim, BankClaimStatus, Collection,
)


def _parse_landsbankinn_error(exc) -> str:
    """Extract a human-readable error message from a Landsbankinn HTTPError response."""
    try:
        body = exc.response.json()
        errors = body.get("errors") or {}
        if errors:
            msgs = []
            for field_errors in errors.values():
                if isinstance(field_errors, list):
                    msgs.extend(field_errors)
                else:
                    msgs.append(str(field_errors))
            return " ".join(msgs)
        return body.get("detail") or body.get("message") or str(exc)
    except Exception:
        return str(exc)


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
            "claim_mode": bs.claim_mode,
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
        if "claim_mode" in request.data:
            claim_mode = request.data["claim_mode"].strip()
            if claim_mode not in ClaimMode.values:
                return Response(
                    {"detail": f"Ógildur greiðslumáti. Veldu: {', '.join(ClaimMode.values)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            defaults["claim_mode"] = claim_mode

        bs, _ = AssociationBankSettings.objects.update_or_create(
            association=association,
            defaults=defaults,
        )

        if "api_key" in request.data:
            bs.set_api_key(request.data["api_key"].strip())
            bs.save(update_fields=["api_key"])

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
            "claim_mode": bs.claim_mode,
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

        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar eru ekki stilltar fyrir þetta félag."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if bank_settings.claim_mode == ClaimMode.BANK_SERVICE:
            return Response(
                {"detail": "Ekki hægt að senda kröfu beint — félagið notar húsfélagaþjónustu bankans."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        from associations.banks.dispatch import get_provider
        from associations.banks.landsbankinn import _last_day_of_month
        try:
            provider = get_provider(bank_settings)
            api_response = provider.create_claim(collection, bank_settings)
        except requests.HTTPError as exc:
            detail = (
                _parse_landsbankinn_error(exc)
                if bank_settings.bank == BankProvider.LANDSBANKINN
                else str(exc)
            )
            logger.error(
                "SendClaimView: Landsbankinn error for collection %s: %s — %s",
                collection_id, exc.response.status_code if exc.response is not None else "?", detail,
            )
            bugsnag.notify(exc, context="send_claim", extra_data={"collection_id": collection_id, "detail": detail})
            return Response({"detail": detail}, status=status.HTTP_502_BAD_GATEWAY)
        except Exception as exc:
            logger.error("SendClaimView: unexpected error for collection %s: %s", collection_id, exc)
            bugsnag.notify(exc, context="send_claim", extra_data={"collection_id": collection_id})
            return Response({"detail": f"Villa við sendingu kröfu: {exc}"}, status=status.HTTP_502_BAD_GATEWAY)

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

        if bank_settings.claim_mode == ClaimMode.BANK_SERVICE:
            return Response(
                {"detail": "Ekki hægt að senda kröfur beint — félagið notar húsfélagaþjónustu bankans."},
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

        from associations.banks.dispatch import get_provider
        from associations.banks.landsbankinn import _last_day_of_month
        provider = get_provider(bank_settings)
        sent = 0
        skipped = 0
        errors = []

        for collection in collections:
            if not collection.payer or not collection.payer.kennitala:
                skipped += 1
                continue

            try:
                api_response = provider.create_claim(collection, bank_settings)
            except requests.HTTPError as exc:
                detail = (
                    _parse_landsbankinn_error(exc)
                    if bank_settings.bank == BankProvider.LANDSBANKINN
                    else str(exc)
                )
                logger.error(
                    "SendAllClaimsView: Landsbankinn error for apt %s (assoc %s): %s",
                    collection.apartment.anr, association_id, detail,
                )
                bugsnag.notify(exc, context="send_all_claims", extra_data={
                    "association_id": association_id, "apartment": collection.apartment.anr, "detail": detail,
                })
                errors.append(f"Íbúð {collection.apartment.anr}: {detail}")
                skipped += 1
                continue
            except Exception as exc:
                logger.error(
                    "SendAllClaimsView: unexpected error for apt %s (assoc %s): %s",
                    collection.apartment.anr, association_id, exc,
                )
                bugsnag.notify(exc, context="send_all_claims", extra_data={
                    "association_id": association_id, "apartment": collection.apartment.anr,
                })
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


class NotifyBudgetView(APIView):
    """POST /associations/{id}/bank/notify-budget?year=2026 — send budget summary email to Landsbankinn."""
    permission_classes = [IsAuthenticated]

    def post(self, request, association_id):
        from django.conf import settings as django_settings
        from associations.models import Budget, BudgetItem, Apartment
        from associations.notifications import send_email

        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        year = request.query_params.get("year")
        if not year:
            return Response({"detail": "year er nauðsynlegt."}, status=status.HTTP_400_BAD_REQUEST)
        year = int(year)

        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar eru ekki stilltar."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if bank_settings.claim_mode != ClaimMode.BANK_SERVICE:
            return Response(
                {"detail": "Þessi aðgerð er eingöngu fyrir félög sem nota húsfélagaþjónustu bankans."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        try:
            budget = Budget.objects.get(association=association, year=year, is_active=True)
        except Budget.DoesNotExist:
            return Response(
                {"detail": f"Engin virk áætlun fannst fyrir árið {year}."},
                status=status.HTTP_404_NOT_FOUND,
            )

        bank_email = django_settings.BANK_LANDSBANKINN_EMAIL
        if not bank_email:
            return Response(
                {"detail": "Netfang Landsbankans (BANK_LANDSBANKINN_EMAIL) er ekki stillt."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        items = BudgetItem.objects.filter(budget=budget).select_related("category").order_by("category__name")
        apartments = Apartment.objects.filter(association=association, deleted=False).count()

        lines = [f"<h2>Áætlun {year} — {association.name}</h2>"]
        lines.append(f"<p>Kennitala: {association.ssn}<br>Fjöldi íbúða: {apartments}</p>")
        lines.append("<table border='1' cellpadding='4' cellspacing='0'><tr><th>Flokkur</th><th>Upphæð</th></tr>")
        total = 0
        for item in items:
            lines.append(f"<tr><td>{item.category.name}</td><td>{item.amount:,.0f} kr.</td></tr>")
            total += item.amount
        lines.append(f"<tr><td><strong>Samtals</strong></td><td><strong>{total:,.0f} kr.</strong></td></tr>")
        lines.append("</table>")
        html_body = "\n".join(lines)

        try:
            sent = send_email(
                to=bank_email,
                subject=f"Húsfélagsáætlun {year} — {association.name} ({association.ssn})",
                html=html_body,
            )
        except Exception as exc:
            logger.error("NotifyBudgetView: failed to send email for assoc %s: %s", association_id, exc)
            bugsnag.notify(exc, context="notify_budget", extra_data={"association_id": association_id, "year": year})
            return Response(
                {"detail": f"Villa við sendingu tölvupósts: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if not sent:
            logger.warning(
                "NotifyBudgetView: email skipped for assoc %s — RESEND_API_KEY not configured",
                association_id,
            )
            return Response(
                {"detail": "Tölvupóstur var ekki sendur — RESEND_API_KEY er ekki stillt á þessum þjóni."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"detail": "Áætlun send til Landsbankans."}, status=status.HTTP_200_OK)


class SendBudgetOverviewView(APIView):
    """POST /associations/{id}/budget/send-overview?year=2026 — send rich budget+payer overview email to the bank."""
    permission_classes = [IsAuthenticated]

    # Map BankProvider → settings attribute holding the bank's email address.
    _BANK_EMAIL_SETTING = {
        BankProvider.LANDSBANKINN: "BANK_LANDSBANKINN_EMAIL",
    }

    def post(self, request, association_id):
        from decimal import Decimal
        from django.conf import settings as django_settings
        from associations.models import Budget, BudgetItem, ApartmentOwnership, CategoryType
        from associations.notifications import send_email, build_budget_overview_email

        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        year = request.query_params.get("year")
        if not year:
            return Response({"detail": "year er nauðsynlegt."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            year = int(year)
        except ValueError:
            return Response({"detail": "year verður að vera tala."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar eru ekki stilltar."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        if bank_settings.claim_mode != ClaimMode.BANK_SERVICE:
            return Response(
                {"detail": "Þessi aðgerð er eingöngu fyrir félög sem nota húsfélagaþjónustu bankans."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        email_setting = self._BANK_EMAIL_SETTING.get(bank_settings.bank)
        bank_email = getattr(django_settings, email_setting, "") if email_setting else ""
        if not bank_email:
            return Response(
                {"detail": f"Netfang bankans ({email_setting or 'BANK_EMAIL'}) er ekki stillt."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            budget = Budget.objects.get(association=association, year=year, is_active=True)
        except Budget.DoesNotExist:
            return Response(
                {"detail": f"Engin virk áætlun fannst fyrir árið {year}."},
                status=status.HTTP_404_NOT_FOUND,
            )

        budget_items = list(
            BudgetItem.objects.filter(budget=budget).select_related("category")
        )

        group_totals = {}
        for item in budget_items:
            t = item.category.type
            if t == CategoryType.INCOME:
                continue
            group_totals[t] = group_totals.get(t, Decimal("0")) + item.amount

        grand_total = sum(group_totals.values(), Decimal("0"))
        if grand_total == 0:
            return Response(
                {"detail": "Áætlunin inniheldur engar fjárhæðir."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        apartments = list(association.apartments.filter(deleted=False))

        if not apartments:
            return Response(
                {"detail": "Engar íbúðir eru skráðar fyrir þetta húsfélag."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # ── Validation 1: each apartment must have exactly one payer ──────────
        payer_count_by_apt: dict[int, int] = {apt.id: 0 for apt in apartments}
        payer_by_apt: dict[int, object] = {}
        for o in ApartmentOwnership.objects.filter(
            apartment__association=association, is_payer=True, deleted=False
        ).select_related("user", "apartment"):
            if not o.apartment.deleted:
                payer_count_by_apt[o.apartment_id] = payer_count_by_apt.get(o.apartment_id, 0) + 1
                payer_by_apt[o.apartment_id] = o.user

        apt_by_id = {apt.id: apt for apt in apartments}
        missing_payer = [apt_by_id[aid].anr for aid, cnt in payer_count_by_apt.items() if cnt != 1]
        if missing_payer:
            apts_str = ", ".join(sorted(missing_payer))
            return Response(
                {"detail": f"Eftirfarandi íbúðir vantar greiðanda: {apts_str}. Vinsamlegast leiðréttu þetta áður en áætlun er send til bankans."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # ── Validation 2: shares must sum to 100% for each active budget type ─
        SHARE_FIELDS = {
            CategoryType.SHARED: "share",
            CategoryType.SHARE2: "share_2",
            CategoryType.SHARE3: "share_3",
            CategoryType.EQUAL:  "share_eq",
        }
        TYPE_LABELS = {
            CategoryType.SHARED: "Sameiginlegt",
            CategoryType.SHARE2: "Hiti",
            CategoryType.SHARE3: "Lóð",
            CategoryType.EQUAL:  "Jafnskipt",
        }
        bad_ratios = []
        for cat_type, field in SHARE_FIELDS.items():
            if not group_totals.get(cat_type):
                continue  # no budget amount for this type — skip
            total_share = sum(getattr(apt, field) for apt in apartments)
            if abs(total_share - 100) > Decimal("0.01"):
                bad_ratios.append(f"{TYPE_LABELS[cat_type]} ({total_share:.2f}%)")
        if bad_ratios:
            types_str = ", ".join(bad_ratios)
            return Response(
                {"detail": f"Hlutföll eru ekki 100% fyrir: {types_str}. Vinsamlegast leiðréttu hlutföllin áður en áætlun er send."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        payer_rows = []
        for apt in apartments:
            payer = payer_by_apt[apt.id]
            monthly_fee = (
                apt.share / 100 * group_totals.get(CategoryType.SHARED, Decimal("0")) / 12
                + apt.share_2 / 100 * group_totals.get(CategoryType.SHARE2, Decimal("0")) / 12
                + apt.share_3 / 100 * group_totals.get(CategoryType.SHARE3, Decimal("0")) / 12
                + apt.share_eq / 100 * group_totals.get(CategoryType.EQUAL, Decimal("0")) / 12
            )
            payer_rows.append({
                "apt_anr": apt.anr,
                "payer_name": payer.name,
                "payer_kennitala": payer.kennitala,
                "share": apt.share,
                "share_2": apt.share_2,
                "share_3": apt.share_3,
                "monthly_fee": monthly_fee,
            })

        html = build_budget_overview_email(
            association, budget, budget_items, payer_rows, group_totals, grand_total
        )
        subject = f"Húsfélagsáætlun {year} — {association.name} ({association.ssn})"

        try:
            sent = send_email(to=bank_email, subject=subject, html=html)
        except Exception as exc:
            logger.error("SendBudgetOverviewView: failed for assoc %s: %s", association_id, exc)
            bugsnag.notify(exc, context="send_budget_overview", extra_data={"association_id": association_id})
            return Response(
                {"detail": f"Villa við sendingu tölvupósts: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        if not sent:
            return Response(
                {"detail": "Tölvupóstur var ekki sendur — RESEND_API_KEY er ekki stillt á þessum þjóni."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response({"detail": "Áætlun send til bankans."}, status=status.HTTP_200_OK)


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


class IncomingClaimsView(APIView):
    """GET /associations/{id}/bank/incoming-claims — unpaid claims where this association is the payor."""
    permission_classes = [IsAuthenticated]

    def get(self, request, association_id):
        from datetime import date, timedelta
        from associations.banks.dispatch import get_provider

        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response({"claims": [], "configured": False})

        if not settings.api_key:  # encrypted value present check
            return Response({"claims": [], "configured": False})

        today = date.today()
        year_ago = today - timedelta(days=365)
        if association.registered and association.registered > year_ago:
            due_date_from = association.registered
        else:
            due_date_from = year_ago

        try:
            provider = get_provider(settings)
            claims = provider.fetch_incoming_claims(association, settings, due_date_from)
            return Response({"claims": claims, "configured": True})
        except Exception as exc:
            logger.exception("fetch_incoming_claims failed for association %s", association_id)
            bugsnag.notify(exc, context="incoming_claims", extra_data={"association_id": association_id})
            return Response({"claims": [], "configured": True, "error": True})
