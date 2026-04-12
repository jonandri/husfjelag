from associations.models import BankApiAuditLog, BankNotificationLog


def log_api_call(
    *,
    association,
    bank: str,
    endpoint: str,
    http_method: str,
    status_code: int,
    user=None,
) -> None:
    """Write one row to BankApiAuditLog. Never raises — audit failures must not break the caller."""
    try:
        BankApiAuditLog.objects.create(
            association=association,
            user=user,
            bank=bank,
            endpoint=endpoint,
            http_method=http_method,
            status_code=status_code,
        )
    except Exception:
        pass


def log_notification(
    *,
    association,
    notification_type: str,
    recipients: list[str],
    success: bool,
    error: str = "",
) -> None:
    """Write one row to BankNotificationLog. Never raises."""
    try:
        BankNotificationLog.objects.create(
            association=association,
            notification_type=notification_type,
            recipients=recipients,
            success=success,
            error=error,
        )
    except Exception:
        pass
