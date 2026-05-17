# Landsbankinn API Integration

## Overview

Húsfjelagið integrates with Landsbankinn's Open Banking API to:
1. Discover bank accounts belonging to an association
2. Import transactions automatically
3. Send monthly housing fee claims (kröfur) to apartment owners

The integration uses **mTLS** (mutual TLS) for all API calls, meaning both parties authenticate with certificates. Our certificate is the Búnaðarskilríki (a PFX/PKCS#12 file), and each association supplies its own **API key** (client ID) obtained from Landsbankinn.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `BANK_LANDSBANKINN_AUTH_URL` | Token endpoint, e.g. `https://apisandbox.landsbankinn.is/connect/token` |
| `BANK_LANDSBANKINN_API_BASE` | API root, e.g. `https://apisandbox.landsbankinn.is/api` |
| `BUNADARSKILRIKI` | Base64-encoded `.p12` PFX certificate file |
| `BUNADARSKILRIKI_PWD` | Password for the PFX file |
| `BANK_FERNET_KEY` | Fernet key used to encrypt cached access tokens in the database |

All stored in Doppler, never on disk.

---

## How the Landsbankinn API Works

### Base URL and Path Structure

```
BANK_LANDSBANKINN_API_BASE = https://apisandbox.landsbankinn.is/api

Accounts list:      GET  {base}/Accounts/Accounts/v1/Accounts
End-of-day balance: GET  {base}/Accounts/Accounts/v1/EndOfDayFinancials
Transactions:       GET  {base}/Accounts/Accounts/v1/Accounts/{bban}/Transactions
Claims:             POST {base}/Claims/Claims/v1/Claims
Claim status:       GET  {base}/Claims/Claims/v1/Claims/{claim_id}
```

### Authentication — `POST {authUrl}/connect/token`

Every API call requires a Bearer token. Tokens are obtained via OAuth 2.0 client_credentials flow over mTLS:

**Request** (form-encoded, with Búnaðarskilríki certificate attached):
```
grant_type                 = client_credentials
client_id                  = <association API key>
scope                      = external
access_token_configuration = external_client
```

**Response:**
```json
{
  "access_token": "eyJ...",
  "expires_in": 1200
}
```

The `client_id` is **per-association** — each association applies to Landsbankinn separately and receives its own API key. Our Búnaðarskilríki is **our** certificate as a service provider (Þjónustuaðili), and the association's `api_key` is their client ID.

**Token caching:** Tokens are stored Fernet-encrypted in `BankTokenCache` (one row per `(bank, api_key)` pair). A cached token is reused until 60 seconds before expiry, then refreshed automatically. This means we only call the token endpoint when needed, not on every API request.

### Accounts — `GET /Accounts/Accounts/v1/Accounts`

Returns all accounts the API key has access to.

**Response:**
```json
{
  "data": [
    {
      "id": "010126000001",
      "bban": "010126000001",
      "iban": "IS420101260000010101302989",
      "ownerNationalId": "0101302989",
      "product": { "id": "300106", "type": "currentAccount", "name": "Einkareikningur" },
      "currency": "ISK",
      "status": "open",
      "balance": 1337,
      "availableAmount": 1337
    }
  ],
  "page": 1,
  "perPage": 100,
  "totalItems": 2,
  "totalPages": 1
}
```

**Required headers on all API calls:**
```
Authorization: Bearer <access_token>
apikey: <association api_key (client_id)>
```

**Key fields:**
- `bban` — 12-digit account number without formatting. Maps to our `account_number` field after formatting: `010126000001` → `0101-26-000001`
- `ownerNationalId` — kennitala of the account owner. Must match the association's SSN to be considered valid
- `status` — `"open"` or `"closed"`. Only open accounts are connected

### End-of-Day Balance — `GET /Accounts/Accounts/v1/EndOfDayFinancials`

Returns end-of-day balances for all accounts belonging to an owner on a given date. Used to fetch the Dec 31 opening balance when a new account is connected.

**Query parameters:**
- `date` — ISO date, e.g. `2025-12-31`
- `ownerNationalId` — kennitala of the account owner
- `id` — bban (12 digits) of the specific account

Despite the `id` filter, the API returns **all accounts** for the `ownerNationalId`. Filter the response list by `id == bban` to get the right entry.

**Response:**
```json
{
  "data": [
    {
      "id": "010126000001",
      "ownerNationalId": "0101302989",
      "productName": "Einkareikningur",
      "date": "2025-12-31",
      "balance": {
        "amount": 1000,
        "currency": "ISK"
      },
      "accruedDepositInterest": { "amount": 100, "currency": "ISK" },
      "balanceInLocalCurrency": { "amount": 1000, "currency": "ISK" },
      "accruedDepositInterestInLocalCurrency": { "amount": 100, "currency": "ISK" }
    }
  ],
  "page": 1,
  "perPage": 100,
  "totalItems": 2,
  "totalPages": 1
}
```

**Key fields:**
- `balance.amount` — the closing balance for the day in the account's native currency. This is what we store as `opening_balance`.
- `id` — the bban; use this to find the right entry in the list

**How we use it:** `fetch_opening_balance()` in `landsbankinn.py` calls this for Dec 31 of last year whenever a new `BankAccount` is created (or an existing account is re-connected with no opening balance set).

### Transactions — `GET /Accounts/Accounts/v1/Accounts/{bban}/Transactions`

**Query parameters:**
- `bookingDateFrom` — ISO date, e.g. `2026-01-01`
- `bookingDateTo` — ISO date, e.g. `2026-05-16`
- `page` — page number (default 1)
- `perPage` — results per page (we use 1000)

**Response:**
```json
{
  "data": [
    {
      "id": "12281818137",
      "bban": "010126000001",
      "amount": 10000,
      "currency": "ISK",
      "bookingDate": "2026-03-10",
      "valueDate": "2026-03-10",
      "actionLabel": "Millifært",
      "reference": "0101303019",
      "debtorNationalId": "0101302989",
      "debtorName": "Gunna Gunnarsdóttir",
      "creditorNationalId": "0101303019",
      "creditorName": "Jón Jónsson"
    }
  ],
  "totalPages": 1,
  "totalItems": 1
}
```

**Key fields and how we map them:**

| API field | Our field | Notes |
|---|---|---|
| `id` | `external_id` | Used to detect duplicates on re-sync |
| `bookingDate` | `date` | Settlement date, not value date |
| `amount` | `amount` | Positive = income, negative = expense |
| `creditorName` | `description` | Name of who received the money |
| `reference` | `reference` | Payment reference, often a kennitala |
| `debtorNationalId` OR `creditorNationalId` | `payer_kennitala` | Debtor for income transactions, creditor for expenses |

Pagination uses `totalPages` from the JSON response body. We also check the `X-Paging-TotalPages` response header as a primary source.

### Claims (Kröfur) — `POST /Claims/Claims/v1/Claims`

Used to send monthly housing fee payment requests to apartment owners directly through their online banking. See `create_claim()` in `landsbankinn.py` for the full request body. Key fields:

- `templateId` — the association's claim template ID (stored in `AssociationBankSettings.template_id`)
- `payorNationalId` — kennitala of the apartment owner (payer)
- `principalAmount` — amount due
- `dueDate` / `finalDueDate` — last day of the collection month

**Claim status** is polled separately via `GET /Claims/Claims/v1/Claims/{claim_id}` and synced back to our `BankClaim` and `Collection` models.

---

## Our Happy Path

### Step 0 — Association applies for API access

1. Chair/CFO downloads our PDF application form (from `/documents/0846-umsokn-um-adgang-ad-thjonustugatt.pdf`)
2. Fills in the association name and checks access to bank accounts
3. Lists **Húsfjelagið ehf.** as Þjónustuaðili
4. Sends the form (unsigned) to `ft@landsbankinn.is` with their kennitala — Landsbankinn sends it for electronic signing
5. Landsbankinn issues an **API key** (client ID) for the association

### Step 1 — API key entered in Bankastillingar

Chair/CFO enters the API key in Settings → Bankastillingar. It is stored on `AssociationBankSettings.api_key`.

### Step 2 — First sync (triggered manually or by Celery)

`sync_transactions(association_id)` runs:

**2a. Account discovery** (`discover_and_sync_accounts`):
- Calls `GET /Accounts/Accounts/v1/Accounts` with the association's API key
- For each account returned:
  - Converts `bban` (12 digits) → formatted `account_number` (`XXXX-XX-XXXXXX`)
  - Checks `ownerNationalId == association.ssn` AND `status == "open"`
  - If valid and not in DB: creates a new `BankAccount` with `is_connected=True`, then fetches opening balance (see 2a.1)
  - If already in DB: updates `is_connected` and `bank_status`; fetches opening balance if not yet set

**2a.1. Opening balance** (`fetch_opening_balance` → `_set_opening_balance`):
- Calls `GET /Accounts/Accounts/v1/EndOfDayFinancials?date=<dec31_last_year>&ownerNationalId=<ssn>&id=<bban>`
- Finds the matching entry in the response list by `id == bban`
- Stores `balance.amount` as `BankAccount.opening_balance` and the reference date as `BankAccount.opening_balance_date`
- Current balance displayed in the UI = `opening_balance + sum(all synced transactions)`
- If the fetch fails (network error, account not in response), `opening_balance` stays at `0` and `opening_balance_date` stays `null` — the account is still usable, just without a historical starting point

**2b. Transaction sync** (`sync_account_transactions` per connected account):
- Only runs for accounts where `is_connected=True`
- `from_date` = last known transaction date minus 1 day (or Jan 1 of current year on first run)
- `to_date` = today
- Fetches all pages of transactions
- Skips any transaction whose `external_id` already exists in our DB
- Creates `Transaction` records for new ones

**2c. Sync timestamp:**
- `AssociationBankSettings.last_sync_at` is updated after every successful run

### Step 3 — Automatic daily sync

`sync_all_associations` (Celery beat) dispatches `sync_transactions` for every association that has at least one `BankAccount`. New transactions appear automatically.

### Step 4 — Claims sent for monthly collections

When a collection month is generated and the association has Landsbankinn configured:
- Chair/CFO clicks "Senda kröfur" in the collection view
- `SendAllClaimsView` calls `create_claim()` for each unpaid collection row
- A `BankClaim` record is created locally with the returned `claim_id`
- `sync_claim_statuses` (Celery beat) polls claim statuses and marks collections PAID when confirmed

---

## Data Model Relationships

```
Association
  └── AssociationBankSettings   (bank, api_key, template_id, last_sync_at)
  └── BankAccount               (account_number, is_connected, bank_status, opening_balance, opening_balance_date)
        └── Transaction         (date, amount, description, external_id, payer_kennitala)
        -- current_balance = opening_balance + sum(transactions.amount)
  └── Budget
        └── Collection
              └── BankClaim     (claim_id, status, due_date, sent_at)
```

---

## Error Handling and Edge Cases

- **Token expired mid-request:** The 60-second early-expiry buffer in `get_access_token` prevents this in normal operation. If a token is somehow invalid, `requests.HTTPError` is raised and logged via Bugsnag.
- **Account not owned by association:** `ownerNationalId` mismatch sets `is_connected=False` — the account is never synced.
- **Closed account:** `status != "open"` sets `is_connected=False`.
- **Duplicate transactions:** Every transaction has a unique `external_id` from Landsbankinn. We check for it before inserting — re-syncing the same date range is safe.
- **Discovery failure:** If account discovery fails (network error, bad token), the task logs the error to Bugsnag but still attempts to sync any previously-connected accounts rather than aborting entirely.
- **No API key:** Task returns early with `{"skipped": True, "reason": "api_key_missing"}`.
