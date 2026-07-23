# Landsbankinn API Integration

## Overview

Húsfjelagið integrates with Landsbankinn's Open Banking API to:
1. Discover bank accounts belonging to an association
2. Import transactions automatically (daily, via Celery)
3. Send monthly housing fee claims (kröfur) to apartment owners — either directly via API or via bank service email

The integration uses **mTLS** (mutual TLS) for all API calls, meaning both parties authenticate with certificates. Our certificate is the Búnaðarskilríki (a PFX/PKCS#12 file issued to Húsfjelagið ehf.), and each association supplies its own **API key** (OAuth client ID) obtained from Landsbankinn.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `BANK_LANDSBANKINN_AUTH_URL` | Token endpoint, e.g. `https://mtls-auth.landsbankinn.is/connect/token` |
| `BANK_LANDSBANKINN_API_BASE` | API root, e.g. `https://apisandbox.landsbankinn.is/api` |
| `BANK_LANDSBANKINN_EMAIL` | Email address to notify when using BANK_SERVICE claim mode |
| `BUNADARSKILRIKI` | Base64-encoded `.p12` PFX certificate file (Búnaðarskilríki) |
| `BUNADARSKILRIKI_PWD` | Password for the PFX file |
| `BANK_FERNET_KEY` | Fernet key used to encrypt `api_key` at rest and access tokens in the DB |

All stored in Doppler, never on disk or in `.env`.

Sandbox vs production: swap `AUTH_URL` and `API_BASE` — the sandbox uses `apisandbox.landsbankinn.is`, production uses `api.landsbankinn.is` (or the equivalent mTLS subdomain).

---

## Data Model

```
Association
  └── AssociationBankSettings   (bank, api_key [encrypted], template_id, claim_mode, last_sync_at)
  └── BankTokenCache            (bank, association FK, access_token [encrypted], expires_at)
  └── BankAccount               (account_number, is_connected, bank_status, opening_balance, opening_balance_date)
        └── Transaction         (date, amount, description, external_id, payer_kennitala)
  └── Budget
        └── Collection
              └── BankClaim     (claim_id, status, due_date, sent_at, synced_at)
```

**`AssociationBankSettings` fields:**
- `api_key` — Fernet-encrypted Landsbankinn client ID. Access via `get_api_key()` / `set_api_key()`.
- `template_id` — Landsbankinn claim template ID (required for `DIRECT_API` mode only).
- `claim_mode` — `DIRECT_API` (kröfur sent via API) or `BANK_SERVICE` (áætlun emailed to bank).
- `last_sync_at` — updated after every successful transaction sync.

**`BankTokenCache`:**
- One row per `(bank, association)`. Stores the OAuth access token Fernet-encrypted.
- Checked before every API call; refreshed 60 s before expiry.
- Rows are ephemeral — safe to delete; tokens are re-fetched automatically.

---

## API Authentication

### Step 1 — Get access token

`POST {BANK_LANDSBANKINN_AUTH_URL}` (form-encoded, with Búnaðarskilríki PFX attached as client certificate via `requests_pkcs12`):

```
grant_type                 = client_credentials
client_id                  = <association API key>
scope                      = external
access_token_configuration = external_client
```

Response:
```json
{ "access_token": "eyJ...", "expires_in": 1200 }
```

The `client_id` is **per-association** — each association applies separately and receives its own API key. The Búnaðarskilríki is Húsfjelagið's certificate as service provider (Þjónustuaðili); it is shared across all associations.

Token caching: `get_access_token(association_id, api_key)` checks `BankTokenCache` by `(bank, association_id)`. If a valid token exists (expires more than 60 s from now), it is returned as-is. Otherwise a new token is fetched, Fernet-encrypted, and stored.

### Step 2 — API request headers

Every API call requires:
```
Authorization: Bearer <access_token>
apikey:        <association api_key (client_id)>
```

Internal helpers `_get`, `_get_raw`, `_post` in `landsbankinn.py` accept `(path, association_id, api_key, ...)` and handle auth automatically.

---

## API Endpoints

### Accounts — `GET /Accounts/Accounts/v1/Accounts`

Returns all accounts the API key has read access to.

**Response:**
```json
{
  "data": [
    {
      "bban": "010126000001",
      "iban": "IS420101260000010101302989",
      "ownerNationalId": "0101302989",
      "product": { "id": "300106", "type": "currentAccount", "name": "Einkareikningur" },
      "currency": "ISK",
      "status": "open"
    }
  ]
}
```

Key fields:
- `bban` — 12-digit account number. We format it as `XXXX-XX-XXXXXX` for storage.
- `ownerNationalId` — must match `association.ssn` to be considered a valid account.
- `status` — `"open"` or `"closed"`. Only open accounts with matching SSN are connected.

### End-of-Day Balance — `GET /Accounts/Accounts/v1/EndOfDayFinancials`

Returns end-of-day balances for all accounts belonging to an owner on a specific date. Used once when a new account is connected to seed the opening balance (Dec 31 of the previous year).

Query parameters: `date` (ISO), `ownerNationalId`, `id` (bban).

Note: despite the `id` filter, the API returns **all accounts** for the owner — filter the response list by `id == bban`.

**Response:**
```json
{
  "data": [
    {
      "id": "010126000001",
      "date": "2025-12-31",
      "balance": { "amount": 1000, "currency": "ISK" }
    }
  ]
}
```

`balance.amount` is stored as `BankAccount.opening_balance`. Current displayed balance = `opening_balance + sum(transactions.amount)`.

### Transactions — `GET /Accounts/Accounts/v1/Accounts/{bban}/Transactions`

Query parameters: `bookingDateFrom`, `bookingDateTo`, `page`, `perPage` (we use 1000).

Pagination: total page count comes from the `X-Paging-TotalPages` response **header** (primary). Falls back to `totalPages` in the JSON body, then 1.

**Response:**
```json
{
  "data": [
    {
      "id": "12281818137",
      "amount": 10000,
      "bookingDate": "2026-03-10",
      "reference": "0101303019",
      "debtorNationalId": "0101302989",
      "debtorName": "Gunna Gunnarsdóttir",
      "creditorNationalId": "0101303019",
      "creditorName": "Jón Jónsson"
    }
  ],
  "totalPages": 1
}
```

Field mapping to our `Transaction` model:

| API field | Our field | Notes |
|---|---|---|
| `id` | `external_id` | Used to detect duplicates on re-sync |
| `bookingDate` | `date` | Settlement date |
| `amount` | `amount` | Positive = income, negative = expense |
| `creditorName` | `description` | Who received the money |
| `reference` | `reference` | Payment reference (often a kennitala) |
| `debtorNationalId` OR `creditorNationalId` | `payer_kennitala` | Debtor for income, creditor for expenses |

### Claims (Kröfur) — `POST /Claims/Claims/v1/Claims`

Creates a monthly payment request in the debtor's online banking. Used in `DIRECT_API` mode only.

Full request body (see `create_claim()` in `landsbankinn.py`):

```json
{
  "templateId": "A37",
  "payorNationalId": "0101302989",
  "principalAmount": 15000.0,
  "dueDate": "2026-05-31",
  "finalDueDate": "2026-05-31",
  "autoCancellation": "2030-05-31",
  "description": "Húsfélagsgjald 05/2026",
  "paymentSequenceType": "none",
  "isPartialPaymentAllowed": false,
  "defaultCharge": {
    "isPercentage": false,
    "dateReference": "dueDate",
    "firstDefaultCharge":  { "numberOfDays": 0, "value": 0 },
    "secondDefaultCharge": { "numberOfDays": 0, "value": 0 }
  },
  "discount": {
    "isPercentage": false,
    "dateReference": "dueDate",
    "firstDiscount":  { "numberOfDays": 0, "value": 0 },
    "secondDiscount": { "numberOfDays": 0, "value": 0 }
  },
  "noticeAndPaymentFee": { "printingFee": 0, "paperlessFee": 0 },
  "notifications": {
    "sendLatePaymentNotification": false,
    "sendSecondaryCollectionWarning": false
  },
  "secondaryCollection": {
    "collectionCompanyNationalId": "<association SSN>",
    "gracePeriodDays": 0
  }
}
```

Notes:
- `templateId` comes from `AssociationBankSettings.template_id` — the association creates this in Landsbankinn Netbanki under "Innheimta".
- `dueDate` and `finalDueDate` are both set to the last day of the collection month.
- `autoCancellation` is set 4 years after `dueDate`.
- `discount` and `secondaryCollection` are required in the payload even with zero values — removing them causes a 400 error.

**Success response:**
```json
{ "data": { "id": "013366781205441218001020260516" } }
```

**Error response (400):**
```json
{
  "errors": { "templateId": ["Kröfusniðmát fannst ekki eða er óvirkt"] },
  "type": "https://tools.ietf.org/html/rfc7231#section-6.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400
}
```

`_parse_landsbankinn_error(exc)` in `banks/views.py` extracts the human-readable message from `errors` fields for display in the UI and Bugsnag.

Known issue: Landsbankinn returns **HTTP 451 Unavailable For Legal Reasons** when claim creation is not yet authorized for a given template/association combination. This is a Landsbankinn-side configuration issue, not a code bug. Reference: `6321984959025990060-A`.

### Claim Status — `GET /Claims/Claims/v1/Claims/{claim_id}`

Returns the current status of a single claim. Used by `get_claim_status()` when polling.

```json
{ "status": "paid" }
```

Possible status values: `unpaid`, `paid`, `cancelled`.

### Incoming Claims — `GET /Claims/Claims/v1/Claims`

Returns claims where the association is the **payor** (bills the association owes to others). Used in the Association page to show outstanding bills.

Query parameters: `payorNationalId`, `status=unpaid`, `dueDateFrom` (ISO date).

Response shape same as claim list. `fetch_incoming_claims()` filters out `paid` and `cancelled` entries from the response and sorts by `dueDate` ascending.

Returned fields per claim: `id`, `claimantName`, `dueDate`, `totalAmountDue` (or `principal.amount` as fallback), `collectionStatus`, `billNumber`, `description`.

---

## Claim Modes

`AssociationBankSettings.claim_mode` controls how monthly housing fees are collected:

### `DIRECT_API` (default)

- `template_id` must be set on `AssociationBankSettings`.
- Chair/CFO clicks "Senda allar kröfur" in Collection, or "Senda kröfu" per row.
- `SendAllClaimsView` / `SendClaimView` call `create_claim()` which POSTs to `/Claims/Claims/v1/Claims`.
- A `BankClaim` row is created locally with the returned `claim_id`.
- `sync_claim_statuses` (Celery beat) polls the API and marks collections PAID when confirmed.

### `BANK_SERVICE`

- No `template_id` required.
- Send-claim buttons are hidden in the Collection UI.
- Chair/CFO activates the annual budget, then clicks "Senda áætlun til Landsbankans" on the Budget page.
- `NotifyBudgetView` sends an HTML email with all budget line items to `BANK_LANDSBANKINN_EMAIL`.
- Landsbankinn generates and mails monthly payment slips to owners independently.

---

## Sync Flow (Celery Tasks)

### Daily transaction sync

`sync_all_associations` (Celery beat, daily) → dispatches `sync_transactions(association_id)` per association.

`sync_transactions`:
1. Loads `AssociationBankSettings`; skips if missing or no `api_key`.
2. Calls `discover_and_sync_accounts` — creates/updates `BankAccount` records; fetches opening balance for new accounts.
3. For each connected account: calls `sync_account_transactions` with `from_date = last_tx_date - 1 day` (or Jan 1 current year on first run).
4. Updates `last_sync_at` on success.

### Daily claim status sync

`sync_all_claim_statuses` (Celery beat, daily) → dispatches `sync_claim_statuses(association_id)` per association with UNPAID claims.

`sync_claim_statuses`:
1. Fetches all UNPAID `BankClaim` rows for the association.
2. Calls `GET /Claims/Claims/v1/Claims` with `claimantNationalId=<assoc SSN>` and `dueDateFrom=<earliest unpaid due date>` — gets the set of still-unpaid claim IDs.
3. Any UNPAID `BankClaim` not in that set has changed — fetches its status individually via `get_claim_status()`.
4. If `paid`: updates `BankClaim.status = PAID` and `Collection.status = PAID`.
5. If `cancelled`: updates `BankClaim.status = CANCELLED`.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Token expired mid-request | 60 s early-refresh buffer prevents this. If it occurs, `HTTPError` is raised, logged to Bugsnag, and the task is aborted. |
| `ownerNationalId` mismatch | Account gets `is_connected=False` — never synced. |
| Closed account | Same as above. |
| Duplicate transaction | `external_id` checked before insert — re-syncing the same date range is safe. |
| Account discovery failure | Logged to Bugsnag; sync continues for previously-connected accounts. |
| No API key | Task returns `{"skipped": True, "reason": "api_key_missing"}`. |
| Claim creation 400 | `_parse_landsbankinn_error()` extracts field-level messages for UI display + Bugsnag. |
| Claim creation 451 | API access not yet authorized for this template/association. Landsbankinn-side issue; see ref `6321984959025990060-A`. |
| Opening balance fetch failure | `opening_balance` stays `0`, `opening_balance_date` stays `null`. Account is still usable. |

---

## How to Add the Next Bank (e.g. Arion)

Banks route through a **provider dispatch layer** — `associations/banks/dispatch.py:get_provider(settings)` returns the right `provider_base.py:BankProvider` implementation based on `settings.bank`. Landsbankinn (REST) and Íslandsbanki (SOAP) each implement that interface; use whichever is the closer template for the new bank. Arion is already stubbed: `arion.py:ArionProvider` subclasses the ABC with every method raising `NotImplementedError`, and `BankProvider.ARION` already exists — so the wiring below is mostly filling in bodies.

### The `BankProvider` interface (`provider_base.py`)

Every method takes the `AssociationBankSettings` object as `settings` (so the provider pulls its own creds/cert):

```python
class BankProvider(ABC):
    def discover_and_sync_accounts(self, association, settings) -> dict: ...
    def sync_account_transactions(self, account, from_date, to_date, settings) -> dict: ...   # {"created", "skipped"}
    def create_claim(self, collection, settings) -> dict: ...          # returns {"id": <claim id>} — the VIEW persists BankClaim
    def get_claim_status(self, claim_id, settings) -> str: ...         # lowercased status
    def list_claims(self, association, settings, **filters) -> list[dict]: ...
    def fetch_incoming_claims(self, association, settings, due_date_from) -> list[dict]: ...
```

Two provider styles already exist:
- **`LandsbankinnProvider`** (`landsbankinn_provider.py`) is a thin wrapper adapting `settings` → the module functions in `landsbankinn.py` (REST + `BankTokenCache` OAuth tokens).
- **`IslandsbankiProvider`** (`islandsbanki.py`) implements the methods directly over the SOAP seam (`isb_soap.py`) + pure mappers (`isb_mappers.py`); no token cache (WS-Security signs every call).

### 1. Implement the provider

Fill in `arion.py:ArionProvider` (or create `<bank>_provider.py` + a client module if you prefer to keep transport separate, like Íslandsbanki). Whatever the transport (OAuth/REST, mTLS, SOAP), the six methods must honour the contracts above — especially: `create_claim` returns `{"id": <bank claim id>}` (the view persists the `BankClaim`, uniformly across banks), and `sync_account_transactions` returns `{"created", "skipped"}` deduping on a stable per-account `external_id` (use the bank's tx id, or a composite hash if it has none — see `isb_mappers.compute_external_id`).

### 2. Register in dispatch

`BankProvider.ARION` already exists in `associations/models.py` (TextChoices — no migration). Add the branch in `dispatch.py:get_provider()`:
```python
if settings.bank == BankChoice.ARION:
    return ArionProvider()
```

### 3. Bank-aware sync guard

`tasks.py:sync_transactions` already routes through `get_provider(settings)`. Add a credential check to its bank-aware guard (mirrors Landsbankinn's `api_key` / Íslandsbanki's `isb_username`+`isb_password`); banks with no branch fall through to `{"skipped": True, "reason": "bank_not_supported"}`.

### 4. Model fields + migration

Add any bank-specific credential/config fields to `AssociationBankSettings` (Fernet-encrypt secrets via `_get_fernet()`, with `get_/set_` helpers, like `isb_password`). Generate a migration. Then wire them into the bank-settings endpoint (`views.py` `AssociationBankSettingsView` GET/POST — accept + return them, **never echo secrets**).

### 5. Environment variables

Add `BANK_<BANK>_*` to `config/settings/base.py` and `.env.example`. If claim collection can be delegated to the bank (`BANK_SERVICE` mode), add the bank's inbox to the `_BANK_EMAIL_SETTING` map in `SendBudgetOverviewView` (and the branch in `NotifyBudgetView`).

### 6. Frontend

In `BankSettingsPage.js`, replace the "coming soon" `Alert` in the Arion branch with a real settings section. The Landsbankinn and Íslandsbanki branches are the templates (collapsible credential box, `Innheimtuaðferð` claim-mode radio, `Innheimtusniðmát`, `Staða tengingar`). Follow `docs/style.md`; keep `CI=true npm run build` warning-free.

### 7. Credentials & certificate

- mTLS transport (Landsbankinn) → `requests_pkcs12` with the shared `BUNADARSKILRIKI` PFX (`cert.load()`).
- XML message signing (Íslandsbanki) → `cert.load_pem()` for the key/cert, `xmlsec` via `isb_soap.py`.
- API key / OAuth → store per-association in `AssociationBankSettings` (Fernet-encrypted); cache tokens in `BankTokenCache` keyed by `(bank, association_id)` if the bank issues bearer tokens.

### Key invariants across banks

- Per-association secrets on `AssociationBankSettings` are always Fernet-encrypted; never store or log plaintext (and never log a SOAP envelope that carries a password).
- `create_claim` returns `{"id": ...}`; the **view** persists the `BankClaim` — do not self-persist in the provider.
- `external_id` on `Transaction` is unique per bank account — always check before inserting.
- `is_connected` on `BankAccount` gates sync — set it from the bank's validity criteria (Landsbankinn: owner-match + open; Íslandsbanki: a validating probe on manually-added accounts).
- Bugsnag `context` strings follow the `"celery:sync_transactions"` / `"send_claim"` pattern — keep them consistent for searchability.
