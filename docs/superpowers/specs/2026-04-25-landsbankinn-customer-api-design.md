# Landsbankinn Customer API Integration Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PSD2/OAuth bank integration with Landsbankinn's Customer API, adding both transaction sync (Accounts API) and electronic invoice sending (Claims API).

**Architecture:** System-level mTLS client credentials replace per-association OAuth consent. One platform certificate authenticates all API calls. Associations configure a claim template ID once; thereafter CHAIR/CFO can send individual collection rows as bank claims (kröfur) and track payment status automatically.

**Tech Stack:** Python `requests` with mTLS (P12 cert), Fernet token encryption, Celery for scheduled sync, Django REST Framework for new endpoints, React + MUI on the frontend.

---

## What Is Removed

The following are deleted entirely — no backwards-compatibility shims:

**Backend:**
- `associations/banks/oauth_client.py` — PKCE helpers and Redis OAuth state
- `BankConsent` model + all migrations referencing it
- `BankConnectView` (`GET /associations/{id}/bank/connect`)
- `BankCallbackView` (`GET /bank/callback/{bank}`)
- `check_consent_expiry()` Celery task
- URL routes: `associations/<id>/bank/connect`, `bank/callback/<bank>`

**Frontend:**
- `BankAuthCallback.js` component
- `/bank/callback` route in `App.js`
- OAuth connect/callback flow in `BankSettingsPage.js`

---

## New Database Models

### `BankTokenCache`

Single global row (enforced by always using `id=1`). Stores the current platform access token.

```python
bank = CharField(max_length=32)       # e.g. "LANDSBANKINN"
access_token = TextField()            # Fernet-encrypted
expires_at = DateTimeField()
updated_at = DateTimeField(auto_now=True)

class Meta:
    db_table = "associations_banktokencache"
```

### `AssociationBankSettings`

One row per association. Set up by CHAIR/CFO in BankSettingsPage before claims can be sent.

```python
association = OneToOneField(Association, on_delete=CASCADE, related_name="bank_settings")
template_id = CharField(max_length=64)   # Landsbankinn claim template ID
created_at = DateTimeField(auto_now_add=True)
updated_at = DateTimeField(auto_now=True)

class Meta:
    db_table = "associations_associationbanksettings"
```

`claimant_national_id` is not stored here — always derived from `association.ssn` at call time.

### `BankClaim`

One row per `Collection`. Tracks the lifecycle of a single bank claim.

```python
collection = OneToOneField(Collection, on_delete=CASCADE, related_name="bank_claim")
claim_id = CharField(max_length=64)        # Landsbankinn's claim ID
payor_national_id = CharField(max_length=10)
amount = DecimalField(max_digits=10, decimal_places=2)
due_date = DateField()
status = CharField(max_length=16, choices=[
    ("UNPAID", "Unpaid"),
    ("PAID", "Paid"),
    ("CANCELLED", "Cancelled"),
])
sent_at = DateTimeField()
synced_at = DateTimeField(null=True, blank=True)  # last status check

class Meta:
    db_table = "associations_bankclaim"
```

---

## Authentication & Token Management

### Environment Variables (`.env`)

```
BANK_LANDSBANKINN_ENABLED=true
BANK_LANDSBANKINN_CERT_PATH=/path/to/company.p12
BANK_LANDSBANKINN_CERT_PASSWORD=secret
BANK_LANDSBANKINN_API_KEY=YourApiKeyGoesHere
BANK_LANDSBANKINN_AUTH_URL=https://mtls-auth.landsbankinn.is/connect/token
BANK_LANDSBANKINN_API_BASE=https://apisandbox.landsbankinn.is/api
```

Remove from `.env` and `settings.py`:
- `BANK_LANDSBANKINN_CLIENT_ID`
- `BANK_LANDSBANKINN_CLIENT_SECRET`
- `BANK_LANDSBANKINN_REDIRECT_URI`
- `BANK_LANDSBANKINN_AUTH_URL` (re-added above with new value)
- `BANK_FERNET_KEY` — kept, still used for token encryption

### `get_access_token()` in `landsbankinn.py`

```python
def get_access_token() -> str:
    # 1. Check BankTokenCache for bank="LANDSBANKINN"
    #    If exists and expires_at > now + 60s: decrypt and return
    # 2. Otherwise: POST to AUTH_URL with P12 cert via requests mTLS
    #    Standard requests cert= takes PEM; use requests-pkcs12 library
    #    (pip install requests-pkcs12) which adds pkcs12_post() / SSLContext support.
    #    body: grant_type=client_credentials, client_id=API_KEY,
    #          scope=external, access_token_configuration=external_client
    # 3. Encrypt token with Fernet, upsert BankTokenCache using
    #    BankTokenCache.objects.update_or_create(id=1, defaults={...})
    # 4. Return plaintext token
```

**60-second buffer** ensures no call is made with a token that expires mid-request.

### API helpers

```python
def _get(path: str, **params) -> dict:
    token = get_access_token()
    resp = requests.get(
        f"{API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30,
    )
    log_api_call(bank="LANDSBANKINN", endpoint=path, method="GET", status=resp.status_code)
    resp.raise_for_status()
    return resp.json()

def _post(path: str, body: dict) -> dict:
    token = get_access_token()
    resp = requests.post(
        f"{API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=30,
    )
    log_api_call(bank="LANDSBANKINN", endpoint=path, method="POST", status=resp.status_code)
    resp.raise_for_status()
    return resp.json()
```

All callers use `_get()` / `_post()` — token management is fully transparent.

---

## Accounts & Transaction Sync

### Dynamic Date Range

Per `BankAccount`:
1. Find most recent `Transaction.date` for this account.
2. If found: `bookingDateFrom = last_date - timedelta(days=1)` (one day overlap).
3. If no transactions yet (first sync): `bookingDateFrom = date(today.year, 1, 1)` (January 1st of current year).
4. `bookingDateTo = date.today()`.

This gives a 1–2 day window on daily syncs and a full year on first sync.

### `sync_transactions(association_id)` Celery task

```
For each BankAccount in association:
    Compute bookingDateFrom (dynamic, see above)
    page = 1
    loop:
        GET /Accounts/Accounts/v1/Accounts/{bban}/Transactions
            ?bookingDateFrom=...&bookingDateTo=...&perPage=1000&page={page}
        For each transaction in data:
            external_id = transaction["id"]
            Skip if Transaction.objects.filter(external_id=external_id).exists()
            Create Transaction:
                bank_account = account
                external_id = transaction["id"]
                date = transaction["bookingDate"]
                amount = Decimal(transaction["amount"])
                description = transaction["actionLabel"] or ""
                reference = transaction["reference"] or ""
                payer_kennitala = transaction["debtorNationalId"] or
                                  transaction["creditorNationalId"] or ""
                source = BANK_SYNC
                status = IMPORTED
        if page >= totalPages: break
        page += 1
```

### `sync_all_associations()` Celery task

Unchanged in structure: finds all associations with at least one `BankAccount`, dispatches `sync_transactions.delay(assoc_id)` for each.

---

## Claims Flow

### Setup

CHAIR/CFO visits BankSettingsPage and enters their Landsbankinn `template_id`. Without this, the "Senda kröfu" button is disabled with a tooltip: *"Þú þarft að stilla Landsbankinn sniðmát áður en hægt er að senda kröfur."*

### Sending a Single Claim

`POST /Collection/{collection_id}/send-claim` (CHAIR/CFO only):

1. Verify no `BankClaim` already exists for this collection.
2. Verify `collection.payer` has a `kennitala`.
3. Load `AssociationBankSettings` for the association.
4. Compute `due_date` = last day of `collection.month` in `collection.budget.year`.
5. `POST /Claims/Claims/v1/Claims`:
   ```json
   {
     "templateId": "<settings.template_id>",
     "payorNationalId": "<payer.kennitala>",
     "principalAmount": <amount_total>,
     "dueDate": "<due_date>",
     "finalDueDate": "<due_date>",
     "autoCancellation": "<due_date + 4 years>",
     "description": "Húsfélagsgjald <month>/<year>",
     "paymentSequenceType": "none",
     "isPartialPaymentAllowed": false,
     "defaultCharge": {"isPercentage": false, "dateReference": "dueDate", "firstDefaultCharge": {"numberOfDays": 0, "value": 0}, "secondDefaultCharge": {"numberOfDays": 0, "value": 0}},
     "discount": {"isPercentage": false, "dateReference": "dueDate", "firstDiscount": {"numberOfDays": 0, "value": 0}, "secondDiscount": {"numberOfDays": 0, "value": 0}},
     "noticeAndPaymentFee": {"printingFee": 0, "paperlessFee": 0},
     "notifications": {"sendLatePaymentNotification": false, "sendSecondaryCollectionWarning": false},
     "secondaryCollection": {"collectionCompanyNationalId": "<assoc.ssn>", "gracePeriodDays": 0}
   }
   ```
   All required fields per the Claims API schema. Fields not relevant to the association's use case are zeroed/false. The template may override some defaults on Landsbankinn's side.
6. Create `BankClaim` with returned `claim_id`, `status=UNPAID`, `sent_at=now`.
7. Return the `BankClaim` as JSON.

### Sending All Unsent Claims for a Month

`POST /associations/{id}/bank/send-all-claims?month=4&year=2026` (CHAIR/CFO only):

Iterates all `Collection` rows for that budget month where no `BankClaim` exists, calling the same logic as above for each. Returns `{ "sent": N, "skipped": M }` where skipped = already sent or payer has no kennitala.

### Claim Status Sync

`sync_claim_statuses(association_id)` Celery task (runs daily alongside `sync_transactions`):

1. Find earliest `due_date` among open (UNPAID) `BankClaim` rows for this association.
2. `GET /Claims/Claims/v1/Claims?claimantNationalId={association.ssn}&status=unpaid&dueDateFrom={earliest_due_date}`
3. Build a set of returned `claim_id` values.
4. For each `BankClaim` in status UNPAID: if its `claim_id` is NOT in the returned set, fetch it directly via `GET /Claims/{id}` to get its current status.
5. Update `BankClaim.status` + `synced_at`.
6. If status flipped to PAID: set `Collection.status = PAID`.

---

## Backend API Endpoints

### New

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/associations/{id}/bank/settings` | `GET` | CHAIR/CFO | Get `AssociationBankSettings` |
| `/associations/{id}/bank/settings` | `POST` | CHAIR/CFO | Create/update `template_id` |
| `/Collection/{collection_id}/send-claim` | `POST` | CHAIR/CFO | Send one collection as a bank claim |
| `/associations/{id}/bank/send-all-claims` | `POST` | CHAIR/CFO | Send all unsent claims for a month |

### Adapted

| Endpoint | Change |
|---|---|
| `GET /associations/{id}/bank/status` | Returns `{ configured: bool, last_sync_at: datetime or null }` instead of OAuth consent info |
| `DELETE /associations/{id}/bank/disconnect` | Clears `AssociationBankSettings` (removes template config) |
| `GET /admin/bank/health` | Removes consent expiry columns; adds last sync time per association |

### Removed

- `GET /associations/{id}/bank/connect`
- `GET /bank/callback/{bank}`

---

## Frontend Changes

### `BankSettingsPage.js`

**Removed:** bank selector, OAuth connect button, "Endurnýja tengingu", consent expiry alert, `BankAuthCallback` import.

**Platform connection card:** Calls `GET /associations/{id}/bank/status`. Shows green "Tengt" chip if `configured: true`, otherwise grey "Ekki stillt" with note: *"Samskipti við Landsbankinn eru stillt af kerfisstjóra."*

**Template settings card:** Text field for `template_id`. "Vista" button calls `POST /associations/{id}/bank/settings`. Shown only to CHAIR/CFO. Displays current value if already set.

### Collections Page (existing)

**Per collection row:** New column "Krafa" with:
- No `BankClaim`: "Senda kröfu" button (`secondaryButtonSx`), disabled if `AssociationBankSettings` not configured
- `BankClaim.status = UNPAID`: `LabelChip` "Sent — Ógreitt" (amber)
- `BankClaim.status = PAID`: `LabelChip` "Greitt" (green)
- `BankClaim.status = CANCELLED`: `LabelChip` "Afturkallað" (grey)

**Batch action:** "Senda allar" button in the collection month header. Sends all unsent rows. Disabled if none are unsent or settings not configured.

### `App.js`

Remove `/bank/callback` route and `BankAuthCallback` import.

---

## Authorization

All new bank endpoints use the existing `_require_chair_or_cfo(request, association)` helper from `associations/banks/views.py`. Admin endpoints (`sync`, `health`) continue to use `request.user.is_superadmin`. No new authorization patterns needed.

---

## Dependencies

Add to `pyproject.toml`: `requests-pkcs12` — required for mTLS with a P12 certificate file in Python's `requests` library. The standard `requests` cert parameter only accepts PEM format.

---

## Migration Plan

1. New migration: create `BankTokenCache`, `AssociationBankSettings`, `BankClaim` tables.
2. New migration: drop `BankConsent` table.
3. Update `.env` and `.env.example` with new variables, remove old ones.
4. Update `settings.py` to load new env vars, remove old bank vars.
