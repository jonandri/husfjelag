"""
Landsbankinn Customer API client.

Module-level helpers for all API interactions:
- get_access_token(association_id, api_key) — mTLS client_credentials, cached per association in BankTokenCache
- _get(path, association_id, api_key, **params) — authenticated GET, returns dict
- _get_raw(path, association_id, api_key, **params) — authenticated GET, returns Response (for pagination headers)
- _post(path, association_id, api_key, body) — authenticated POST, returns dict
- sync_account_transactions(account, from_date, to_date, api_key) — fetch + upsert transactions
- create_claim(collection, settings_obj) — send one collection row as a kröfu
- get_claim_status(claim_id, association_id, api_key) — fetch current status from Claims API
"""

import logging
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

import requests
import requests_pkcs12
from django.conf import settings
from django.utils.timezone import now

from associations.banks import cert as cert_module

logger = logging.getLogger(__name__)

BANK = "LANDSBANKINN"


def get_access_token(association_id: int, api_key: str) -> str:
    """
    Return a valid Landsbankinn access token for the given association.

    Checks BankTokenCache for a cached, non-expiring token keyed by (BANK, association).
    If absent or expiring within 60 seconds, fetches a new token via mTLS POST
    and caches it Fernet-encrypted.
    """
    from associations.models import BankTokenCache, _get_fernet

    fernet = _get_fernet()

    try:
        cache = BankTokenCache.objects.get(bank=BANK, association_id=association_id)
        if cache.expires_at > now() + timedelta(seconds=60):
            return fernet.decrypt(cache.access_token.encode()).decode()
    except BankTokenCache.DoesNotExist:
        pass

    pfx_bytes, pfx_password = cert_module.load()

    resp = requests_pkcs12.post(
        settings.BANK_LANDSBANKINN_AUTH_URL,
        data={
            "grant_type": "client_credentials",
            "client_id": api_key,
            "scope": "external",
            "access_token_configuration": "external_client",
        },
        pkcs12_data=pfx_bytes,
        pkcs12_password=pfx_password,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    plaintext = data["access_token"]
    expires_in = int(data.get("expires_in", 1200))
    encrypted = fernet.encrypt(plaintext.encode()).decode()

    BankTokenCache.objects.update_or_create(
        bank=BANK,
        association_id=association_id,
        defaults={
            "access_token": encrypted,
            "expires_at": now() + timedelta(seconds=expires_in),
        },
    )
    return plaintext


def _headers(token: str, api_key: str) -> dict:
    return {"Authorization": f"Bearer {token}", "apikey": api_key}


def _get(path: str, association_id: int, api_key: str, **params) -> dict:
    """Authenticated GET to Landsbankinn API. Returns parsed JSON."""
    token = get_access_token(association_id, api_key)
    resp = requests.get(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers=_headers(token, api_key),
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _get_raw(path: str, association_id: int, api_key: str, **params):
    """Authenticated GET, returns raw Response object (needed for pagination headers)."""
    token = get_access_token(association_id, api_key)
    resp = requests.get(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers=_headers(token, api_key),
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp


def _post(path: str, association_id: int, api_key: str, body: dict) -> dict:
    """Authenticated POST to Landsbankinn API. Returns parsed JSON."""
    token = get_access_token(association_id, api_key)
    resp = requests.post(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers=_headers(token, api_key),
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def fetch_opening_balance(association_id: int, api_key: str, bban: str, owner_ssn: str, as_of_date: date) -> Decimal | None:
    """
    Fetch the end-of-day balance for a specific account on a given date.

    Calls GET /Accounts/Accounts/v1/EndOfDayFinancials with date, ownerNationalId, and id (bban).
    Returns the balance as a Decimal, or None on any failure.
    """
    try:
        data = _get(
            "/Accounts/Accounts/v1/EndOfDayFinancials",
            association_id,
            api_key,
            date=as_of_date.isoformat(),
            ownerNationalId=owner_ssn,
            id=bban,
        )
        logger.debug("EndOfDayFinancials for bban=%s date=%s: %s", bban, as_of_date, data)
        entries = data.get("data", [])
        payload = next((e for e in entries if e.get("id") == bban), None)
        if payload is None:
            logger.warning("EndOfDayFinancials: bban=%s not found in response", bban)
            return None
        amount = payload.get("balance", {}).get("amount")
        if amount is not None:
            return Decimal(str(amount))
        logger.warning("EndOfDayFinancials: no balance.amount in entry: %s", payload)
    except Exception:
        logger.exception("fetch_opening_balance failed for bban=%s date=%s", bban, as_of_date)
    return None


def _set_opening_balance(bank_account, association_id: int, api_key: str, bban: str, owner_ssn: str, ref_date: date) -> None:
    balance = fetch_opening_balance(association_id, api_key, bban, owner_ssn, ref_date)
    if balance is not None:
        bank_account.opening_balance = balance
        bank_account.opening_balance_date = ref_date
        bank_account.save(update_fields=["opening_balance", "opening_balance_date"])


def discover_and_sync_accounts(association, api_key: str) -> dict:
    """
    Fetch all accounts from Landsbankinn and create/update BankAccount records.

    For each account returned by GET /Accounts/Accounts/v1/Accounts:
    - Converts bban (12 digits) to formatted account_number (XXXX-XX-XXXXXX)
    - Creates a new BankAccount if ownerNationalId matches association SSN and status=open
    - Updates is_connected and bank_status on existing accounts

    Returns {"created": int, "connected": int, "disconnected": int}.
    """
    from associations.models import BankAccount

    data = _get("/Accounts/Accounts/v1/Accounts", association.id, api_key)
    accounts = data.get("data", [])

    today = date.today()
    ref_date = date(today.year - 1, 12, 31)

    created = connected = disconnected = 0

    for acc in accounts:
        bban = acc.get("bban", "")
        if not bban or len(bban) != 12:
            continue

        account_number = f"{bban[0:4]}-{bban[4:6]}-{bban[6:]}"
        owner_match = acc.get("ownerNationalId", "") == association.ssn
        status_open = acc.get("status", "") == "open"
        is_valid = owner_match and status_open

        existing = BankAccount.objects.filter(
            association=association, account_number=account_number
        ).first()

        if existing is None:
            if is_valid:
                bank_account = BankAccount.objects.create(
                    association=association,
                    account_number=account_number,
                    name=acc.get("product", {}).get("name", account_number),
                    is_connected=True,
                    bank_status=acc.get("status", ""),
                )
                _set_opening_balance(bank_account, association.id, api_key, bban, association.ssn, ref_date)
                created += 1
        else:
            existing.is_connected = is_valid
            existing.bank_status = acc.get("status", "")
            existing.save(update_fields=["is_connected", "bank_status"])
            if is_valid:
                connected += 1
                if existing.opening_balance_date is None:
                    _set_opening_balance(existing, association.id, api_key, bban, association.ssn, ref_date)
            else:
                disconnected += 1

    return {"created": created, "connected": connected, "disconnected": disconnected}


def sync_account_transactions(
    account, from_date: date, to_date: date, api_key: str
) -> dict:
    """
    Fetch and upsert transactions for one BankAccount.

    Uses paginated GET with perPage=1000. Pagination total comes from
    X-Paging-TotalPages response header (falls back to JSON totalPages, then 1).

    Returns {"created": int, "skipped": int}.
    """
    from associations.models import Transaction, TransactionSource

    # API expects bban (12 digits) — strip formatting dashes from account_number
    bban = account.account_number.replace("-", "")

    created = 0
    skipped = 0
    page = 1

    while True:
        resp = _get_raw(
            f"/Accounts/Accounts/v1/Accounts/{bban}/Transactions",
            account.association_id,
            api_key,
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
                description=tx.get("creditorName", "") or "",
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
    api_key = settings_obj.get_api_key()
    association_id = settings_obj.association_id
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
    return _post("/Claims/Claims/v1/Claims", association_id, api_key, body)


def fetch_incoming_claims(association_id: int, api_key: str, payor_ssn: str, due_date_from: date) -> list[dict]:
    """
    Fetch unpaid claims where the association is the payor (bills the association owes).

    Calls GET /Claims/Claims/v1/Claims with payorNationalId, status=unpaid, and dueDateFrom.
    Returns a list of simplified claim dicts, sorted by dueDate ascending.
    Raises requests.HTTPError on failure.
    """
    today = date.today()
    data = _get(
        "/Claims/Claims/v1/Claims",
        association_id,
        api_key,
        payorNationalId=payor_ssn,
        status="unpaid",
        dueDateFrom=due_date_from.isoformat(),
    )
    results = []
    for c in data.get("data", []):
        if c.get("status", "").lower() in ("paid", "cancelled"):
            continue
        due = c.get("dueDate", "")
        total = c.get("totalAmountDue") or 0
        principal_amount = (c.get("principal") or {}).get("amount") or 0
        amount = total if total > 0 else principal_amount
        results.append({
            "id": c.get("id", ""),
            "claimant_name": c.get("claimantName", ""),
            "due_date": due,
            "amount": amount,
            "is_overdue": bool(due and due < today.isoformat()),
            "collection_status": c.get("collectionStatus", "primaryCollection"),
            "bill_number": c.get("billNumber", ""),
            "description": c.get("description", ""),
        })
    results.sort(key=lambda x: x["due_date"])
    return results


def get_claim_status(claim_id: str, association_id: int, api_key: str) -> str:
    """
    Fetch the current status of a claim from Landsbankinn.

    Returns the status string lowercased (e.g. "paid", "unpaid", "cancelled").
    Raises requests.HTTPError if the claim is not found.
    """
    data = _get(f"/Claims/Claims/v1/Claims/{claim_id}", association_id, api_key)
    return data.get("status", "").lower()
