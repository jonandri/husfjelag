"""
Landsbankinn Customer API client.

Module-level helpers for all API interactions:
- get_access_token() — mTLS client_credentials, cached in BankTokenCache (id=1)
- _get(path, **params) — authenticated GET, returns dict
- _get_raw(path, **params) — authenticated GET, returns Response (for pagination headers)
- _post(path, body) — authenticated POST, returns dict
- sync_account_transactions(account, from_date, to_date) — fetch + upsert transactions
- create_claim(collection, settings_obj) — send one collection row as a kröfu
- get_claim_status(claim_id) — fetch current status from Claims API
"""

import logging
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

import requests
import requests_pkcs12
from django.conf import settings
from django.utils.timezone import now

logger = logging.getLogger(__name__)

BANK = "LANDSBANKINN"


def get_access_token() -> str:
    """
    Return a valid Landsbankinn access token.

    Checks BankTokenCache (id=1) first. If absent or expiring within 60 seconds,
    fetches a new token via mTLS POST and caches it Fernet-encrypted.
    """
    from cryptography.fernet import Fernet
    from associations.models import BankTokenCache

    fernet_key = settings.BANK_FERNET_KEY
    fernet = Fernet(fernet_key.encode() if isinstance(fernet_key, str) else fernet_key)

    try:
        cache = BankTokenCache.objects.get(id=1)
        if cache.bank == BANK and cache.expires_at > now() + timedelta(seconds=60):
            return fernet.decrypt(cache.access_token.encode()).decode()
    except BankTokenCache.DoesNotExist:
        pass

    # Fetch new token via mTLS
    resp = requests_pkcs12.post(
        settings.BANK_LANDSBANKINN_AUTH_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": settings.BANK_LANDSBANKINN_API_KEY,
            "scope": "external",
            "access_token_configuration": "external_client",
        },
        pkcs12_filename=settings.BANK_LANDSBANKINN_CERT_PATH,
        pkcs12_password=settings.BANK_LANDSBANKINN_CERT_PASSWORD,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    plaintext = data["access_token"]
    expires_in = int(data.get("expires_in", 1200))
    encrypted = fernet.encrypt(plaintext.encode()).decode()

    BankTokenCache.objects.update_or_create(
        id=1,
        defaults={
            "bank": BANK,
            "access_token": encrypted,
            "expires_at": now() + timedelta(seconds=expires_in),
        },
    )
    return plaintext


def _get(path: str, **params) -> dict:
    """Authenticated GET to Landsbankinn API. Returns parsed JSON."""
    token = get_access_token()
    resp = requests.get(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _get_raw(path: str, **params):
    """Authenticated GET, returns raw Response object (needed for pagination headers)."""
    token = get_access_token()
    resp = requests.get(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp


def _post(path: str, body: dict) -> dict:
    """Authenticated POST to Landsbankinn API. Returns parsed JSON."""
    token = get_access_token()
    resp = requests.post(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def sync_account_transactions(account, from_date: date, to_date: date) -> dict:
    """
    Fetch and upsert transactions for one BankAccount.

    Uses paginated GET with perPage=1000. Pagination total comes from
    X-Paging-TotalPages response header (falls back to JSON totalPages, then 1).

    Returns {"created": int, "skipped": int}.
    """
    from associations.models import Transaction, TransactionSource

    created = 0
    skipped = 0
    page = 1

    while True:
        resp = _get_raw(
            f"/Accounts/Accounts/v1/Accounts/{account.account_number}/Transactions",
            bookingDateFrom=from_date.isoformat(),
            bookingDateTo=to_date.isoformat(),
            perPage=1000,
            page=page,
        )
        data = resp.json()
        total_pages = int(
            resp.headers.get("X-Paging-TotalPages", data.get("totalPages", 1))
        )
        transactions = data.get("data", [])

        for tx in transactions:
            external_id = tx.get("id", "")
            if external_id and Transaction.objects.filter(external_id=external_id).exists():
                skipped += 1
                continue

            Transaction.objects.create(
                bank_account=account,
                external_id=external_id,
                date=tx["bookingDate"],
                amount=Decimal(str(tx["amount"])),
                description=tx.get("actionLabel", "") or "",
                reference=tx.get("reference", "") or "",
                payer_kennitala=(
                    tx.get("debtorNationalId", "")
                    or tx.get("creditorNationalId", "")
                    or ""
                ),
                source=TransactionSource.BANK_SYNC,
            )
            created += 1

        if page >= total_pages:
            break
        page += 1

    return {"created": created, "skipped": skipped}


def _last_day_of_month(year: int, month: int) -> date:
    """Return the last date of the given month."""
    return date(year, month, monthrange(year, month)[1])


def create_claim(collection, settings_obj) -> dict:
    """
    Send one Collection row as a Landsbankinn claim (kröfu).

    Args:
        collection: Collection instance with budget, apartment, payer loaded.
        settings_obj: AssociationBankSettings for the association.

    Returns the raw API response dict (contains the new claim ID).
    Raises requests.HTTPError on failure.
    """
    due_date = _last_day_of_month(collection.budget.year, collection.month)
    auto_cancel = date(due_date.year + 4, due_date.month, due_date.day)
    assoc_ssn = collection.budget.association.ssn
    month_label = f"{collection.month:02d}/{collection.budget.year}"

    body = {
        "templateId": settings_obj.template_id,
        "payorNationalId": collection.payer.kennitala,
        "principalAmount": float(collection.amount_total),
        "dueDate": due_date.isoformat(),
        "finalDueDate": due_date.isoformat(),
        "autoCancellation": auto_cancel.isoformat(),
        "description": f"Húsfélagsgjald {month_label}",
        "paymentSequenceType": "none",
        "isPartialPaymentAllowed": False,
        "defaultCharge": {
            "isPercentage": False,
            "dateReference": "dueDate",
            "firstDefaultCharge": {"numberOfDays": 0, "value": 0},
            "secondDefaultCharge": {"numberOfDays": 0, "value": 0},
        },
        "discount": {
            "isPercentage": False,
            "dateReference": "dueDate",
            "firstDiscount": {"numberOfDays": 0, "value": 0},
            "secondDiscount": {"numberOfDays": 0, "value": 0},
        },
        "noticeAndPaymentFee": {"printingFee": 0, "paperlessFee": 0},
        "notifications": {
            "sendLatePaymentNotification": False,
            "sendSecondaryCollectionWarning": False,
        },
        "secondaryCollection": {
            "collectionCompanyNationalId": assoc_ssn,
            "gracePeriodDays": 0,
        },
    }
    return _post("/Claims/Claims/v1/Claims", body)


def get_claim_status(claim_id: str) -> str:
    """
    Fetch the current status of a claim from Landsbankinn.

    Returns the status string lowercased (e.g. "paid", "unpaid", "cancelled").
    Raises requests.HTTPError if the claim is not found.
    """
    data = _get(f"/Claims/Claims/v1/Claims/{claim_id}")
    return data.get("status", "").lower()
