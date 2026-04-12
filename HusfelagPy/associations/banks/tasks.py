import logging
from datetime import date, timedelta

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils.timezone import now

from associations.banks.landsbankinn import LandsbankinnProvider

logger = logging.getLogger(__name__)


def _get_provider(bank: str):
    """Return the appropriate BankProvider instance for the given bank slug."""
    if bank == "LANDSBANKINN":
        return LandsbankinnProvider()
    raise ValueError(f"Unknown bank: {bank}")


@shared_task(name="associations.banks.tasks.sync_transactions")
def sync_transactions(association_id: int) -> dict:
    """
    Fetch the last 30 days of transactions from the bank for one association
    and upsert into Transaction. Returns summary dict.
    """
    from associations.models import Association, BankConsent, BankAccount, Transaction, TransactionSource

    try:
        consent = BankConsent.objects.select_related("association").get(
            association_id=association_id, is_active=True
        )
    except BankConsent.DoesNotExist:
        logger.warning("sync_transactions: no active consent for association %s", association_id)
        return {"skipped": True, "reason": "no_active_consent"}

    if not getattr(settings, f"BANK_{consent.bank}_ENABLED", False):
        logger.info("sync_transactions: %s integration disabled, skipping", consent.bank)
        return {"skipped": True, "reason": "bank_disabled"}

    provider = _get_provider(consent.bank)
    to_date = date.today()
    from_date = to_date - timedelta(days=30)

    try:
        transactions = provider.get_transactions(consent, from_date, to_date)
    except Exception as exc:
        logger.error("sync_transactions: fetch failed for association %s: %s", association_id, exc)
        return {"error": str(exc)}

    created = 0
    skipped = 0
    for tx_data in transactions:
        external_id = tx_data.get("external_id", "")

        bank_account, _ = BankAccount.objects.get_or_create(
            association=consent.association,
            account_number=tx_data["account_id"],
            defaults={"name": tx_data["account_id"]},
        )

        if external_id and Transaction.objects.filter(
            bank_account=bank_account, external_id=external_id
        ).exists():
            skipped += 1
            continue

        Transaction.objects.create(
            bank_account=bank_account,
            date=tx_data["date"],
            amount=tx_data["amount"],
            description=tx_data["description"],
            reference=tx_data.get("reference", ""),
            source=TransactionSource.BANK_SYNC,
            external_id=external_id,
        )
        created += 1

    logger.info(
        "sync_transactions: association=%s created=%s skipped=%s",
        association_id, created, skipped
    )
    return {"created": created, "skipped": skipped}


@shared_task(name="associations.banks.tasks.sync_all_associations")
def sync_all_associations() -> dict:
    """
    Trigger sync_transactions for every association with an active bank consent.
    Dispatches tasks asynchronously.
    """
    from associations.models import BankConsent

    consent_ids = list(
        BankConsent.objects.filter(is_active=True).values_list("association_id", flat=True)
    )
    for assoc_id in consent_ids:
        sync_transactions.delay(assoc_id)

    logger.info("sync_all_associations: dispatched %s tasks", len(consent_ids))
    return {"dispatched": len(consent_ids)}


@shared_task(name="associations.banks.tasks.check_consent_expiry")
def check_consent_expiry() -> dict:
    """
    Find active consents expiring within 10 days.
    Send email to CHAIR and CFO. Write BankNotificationLog. Set renewal_notified_at.
    """
    from associations.models import BankConsent, AssociationAccess, AssociationRole
    from associations.banks.audit import log_notification

    threshold = date.today() + timedelta(days=10)
    expiring = BankConsent.objects.filter(
        is_active=True,
        consent_expires_at__lte=threshold,
        renewal_notified_at__isnull=True,
    ).select_related("association")

    notified = 0
    for consent in expiring:
        recipients = list(
            AssociationAccess.objects.filter(
                association=consent.association,
                role__in=[AssociationRole.CHAIR, AssociationRole.CFO],
                active=True,
            ).select_related("user").values_list("user__email", flat=True)
        )
        recipients = [e for e in recipients if e]
        if not recipients:
            continue

        days_left = (consent.consent_expires_at - date.today()).days
        subject = f"Bankasamþykki rennur út eftir {days_left} daga — {consent.association.name}"
        body = (
            f"Kæri stjórnandi,\n\n"
            f"Bankasamþykki {consent.association.name} við {consent.get_bank_display()} "
            f"rennur út {consent.consent_expires_at.strftime('%d.%m.%Y')} "
            f"({days_left} dagar eftir).\n\n"
            f"Vinsamlega endurnýjið tenginguna í Bankastillingum félagsins.\n\n"
            f"Kveðja,\nHúsfjelag"
        )
        try:
            send_mail(subject, body, None, recipients, fail_silently=False)
            log_notification(
                association=consent.association,
                notification_type="CONSENT_EXPIRY",
                recipients=recipients,
                success=True,
            )
            consent.renewal_notified_at = now()
            consent.save(update_fields=["renewal_notified_at"])
            notified += 1
        except Exception as exc:
            logger.error("check_consent_expiry: email failed for %s: %s", consent.association, exc)
            log_notification(
                association=consent.association,
                notification_type="CONSENT_EXPIRY",
                recipients=recipients,
                success=False,
                error=str(exc),
            )

    logger.info("check_consent_expiry: notified=%s", notified)
    return {"notified": notified}
