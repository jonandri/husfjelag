import logging
from datetime import date, timedelta

import bugsnag
from celery import shared_task
from django.conf import settings

from associations.banks.landsbankinn import sync_account_transactions

logger = logging.getLogger(__name__)


@shared_task(name="associations.banks.tasks.sync_transactions")
def sync_transactions(association_id: int) -> dict:
    """
    Sync bank transactions for one association.

    For each BankAccount:
    - from_date = last transaction date - 1 day (or Jan 1 of current year for first sync)
    - to_date = today
    - Fetches paginated transactions and upserts by external_id.
    """
    from associations.models import Association, BankAccount, Transaction

    if not getattr(settings, "BANK_LANDSBANKINN_ENABLED", False):
        return {"skipped": True, "reason": "bank_disabled"}

    try:
        association = Association.objects.get(id=association_id)
    except Association.DoesNotExist:
        logger.warning("sync_transactions: association %s not found", association_id)
        return {"skipped": True, "reason": "not_found"}

    total_created = 0
    total_skipped = 0

    for account in BankAccount.objects.filter(association=association, deleted=False):
        last_date = (
            Transaction.objects
            .filter(bank_account=account)
            .order_by("-date")
            .values_list("date", flat=True)
            .first()
        )
        today = date.today()
        from_date = (last_date - timedelta(days=1)) if last_date else date(today.year, 1, 1)
        to_date = today

        try:
            result = sync_account_transactions(account, from_date, to_date)
            total_created += result["created"]
            total_skipped += result["skipped"]
        except Exception as exc:
            logger.error(
                "sync_transactions: failed for account %s (assoc %s): %s",
                account.account_number, association_id, exc,
            )
            bugsnag.notify(
                exc,
                context="celery:sync_transactions",
                extra_data={
                    "association_id": association_id,
                    "account_number": account.account_number,
                },
            )

    logger.info(
        "sync_transactions: assoc=%s created=%s skipped=%s",
        association_id, total_created, total_skipped,
    )
    return {"created": total_created, "skipped": total_skipped}


@shared_task(name="associations.banks.tasks.sync_all_associations")
def sync_all_associations() -> dict:
    """
    Dispatch sync_transactions for every association that has at least one BankAccount.
    """
    from associations.models import BankAccount

    assoc_ids = list(
        BankAccount.objects
        .filter(deleted=False)
        .values_list("association_id", flat=True)
        .distinct()
    )
    for assoc_id in assoc_ids:
        sync_transactions.delay(assoc_id)

    logger.info("sync_all_associations: dispatched %s tasks", len(assoc_ids))
    return {"dispatched": len(assoc_ids)}


@shared_task(name="associations.banks.tasks.sync_claim_statuses")
def sync_claim_statuses(association_id: int) -> dict:
    """
    Check payment status of all UNPAID BankClaims for one association.

    Strategy:
    1. Find earliest due_date among UNPAID claims.
    2. Fetch all claims from Landsbankinn with status=unpaid from that date.
    3. Any UNPAID BankClaim whose claim_id is NOT in returned set has changed —
       fetch it individually to get current status.
    4. Update BankClaim.status + synced_at. If PAID, set Collection.status = PAID.
    """
    from django.utils.timezone import now as tz_now
    from associations.models import (
        Association, BankClaim, BankClaimStatus, Collection, CollectionStatus,
    )
    from associations.banks.landsbankinn import _get, get_claim_status

    try:
        association = Association.objects.get(id=association_id)
    except Association.DoesNotExist:
        return {"skipped": True, "reason": "not_found"}

    unpaid_claims = BankClaim.objects.filter(
        collection__budget__association=association,
        status=BankClaimStatus.UNPAID,
    ).select_related("collection")

    if not unpaid_claims.exists():
        return {"checked": 0, "updated": 0}

    earliest_due = unpaid_claims.order_by("due_date").values_list("due_date", flat=True).first()

    try:
        resp_data = _get(
            "/Claims/Claims/v1/Claims",
            claimantNationalId=association.ssn,
            status="unpaid",
            dueDateFrom=earliest_due.isoformat(),
        )
    except Exception as exc:
        logger.error("sync_claim_statuses: list fetch failed for assoc %s: %s", association_id, exc)
        bugsnag.notify(
            exc,
            context="celery:sync_claim_statuses",
            extra_data={"association_id": association_id, "step": "list_fetch"},
        )
        return {"error": str(exc)}

    still_unpaid_ids = {c["id"] for c in resp_data.get("data", [])}

    updated = 0
    for claim in unpaid_claims:
        if claim.claim_id in still_unpaid_ids:
            claim.synced_at = tz_now()
            claim.save(update_fields=["synced_at"])
            continue

        try:
            new_status_raw = get_claim_status(claim.claim_id)
        except Exception as exc:
            logger.error(
                "sync_claim_statuses: individual fetch failed for claim %s: %s",
                claim.claim_id, exc,
            )
            bugsnag.notify(
                exc,
                context="celery:sync_claim_statuses",
                extra_data={
                    "association_id": association_id,
                    "claim_id": claim.claim_id,
                    "step": "individual_fetch",
                },
            )
            continue

        if new_status_raw == "paid":
            claim.status = BankClaimStatus.PAID
            Collection.objects.filter(id=claim.collection_id).update(
                status=CollectionStatus.PAID
            )
        elif new_status_raw == "cancelled":
            claim.status = BankClaimStatus.CANCELLED

        claim.synced_at = tz_now()
        claim.save(update_fields=["status", "synced_at"])
        updated += 1

    logger.info("sync_claim_statuses: assoc=%s updated=%s", association_id, updated)
    return {"checked": unpaid_claims.count(), "updated": updated}


@shared_task(name="associations.banks.tasks.sync_all_claim_statuses")
def sync_all_claim_statuses() -> dict:
    """Dispatch sync_claim_statuses for every association with UNPAID claims."""
    from associations.models import BankClaim, BankClaimStatus

    assoc_ids = list(
        BankClaim.objects
        .filter(status=BankClaimStatus.UNPAID)
        .values_list("collection__budget__association_id", flat=True)
        .distinct()
    )
    for assoc_id in assoc_ids:
        sync_claim_statuses.delay(assoc_id)

    logger.info("sync_all_claim_statuses: dispatched %s tasks", len(assoc_ids))
    return {"dispatched": len(assoc_ids)}
