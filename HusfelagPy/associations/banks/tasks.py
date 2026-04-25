import logging
from celery import shared_task

logger = logging.getLogger(__name__)


@shared_task(name="associations.banks.tasks.sync_transactions")
def sync_transactions(association_id: int) -> dict:
    """Stub — will be implemented in Task 7."""
    logger.info("sync_transactions stub called for association %s", association_id)
    return {"stub": True}


@shared_task(name="associations.banks.tasks.sync_all_associations")
def sync_all_associations() -> dict:
    """Stub — will be implemented in Task 7."""
    return {"stub": True}
