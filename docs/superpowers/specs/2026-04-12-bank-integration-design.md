# Bank Integration Design

**Date:** 2026-04-12
**Feature:** Icelandic bank API integration (AIS + consent management)
**Reference doc:** `CLAUDE-bank-integration.md`

---

## Scope & Phasing

| Phase | Scope |
|-------|-------|
| 1 | Shared infrastructure + Landsbankinn AIS |
| 2 | Arion banki AIS |
| 3 | Íslandsbanki AIS |
| 4 | QA regression across all three banks |

Each phase gets its own implementation plan. Phase 4 verifies that adding Phase 2 and 3 does not break Phase 1.

---

## Constraints

- One bank connection per association at a time
- Connections are not shared between associations
- CHAIR and CFO can manage the bank connection
- Superadmin can trigger manual sync and view health dashboard
- Token storage encrypted with Fernet (symmetric, key in `.env`)
- All bank API calls logged to audit table (no payload logged)

---

## Module Structure

New module inside `associations/` — follows the `skattur_cloud.py` pattern:

```
associations/banks/
    __init__.py
    base_provider.py      # BankProvider ABC
    consent_store.py      # BankConsent model + Fernet encrypt/decrypt helpers
    oauth_client.py       # Shared OAuth2 Authorization Code + PKCE helpers
    audit.py              # BankApiAuditLog model + log() helper
    tasks.py              # Celery tasks: sync_transactions, sync_all, check_consent_expiry
    landsbankinn.py       # Phase 1: Landsbankinn Berlin Group PSD2 client
    arion.py              # Phase 2: Arion IOBWS 3.0 client (stub in Phase 1)
    islandsbanki.py       # Phase 3: Íslandsbanki PSD2 client (stub in Phase 1)
```

---

## Data Models

### BankConsent

One row per association (unique constraint on `association`).

| Field | Type | Notes |
|-------|------|-------|
| `association` | FK(Association, unique) | One bank per association |
| `bank` | CharField choices | LANDSBANKINN / ARION / ISLANDSBANKI |
| `consent_id` | CharField | Bank-issued consent identifier |
| `access_token` | TextField | Fernet-encrypted |
| `refresh_token` | TextField nullable | Fernet-encrypted |
| `token_expires_at` | DateTimeField | Short-lived access token expiry |
| `consent_expires_at` | DateField | 90-day consent window |
| `is_active` | BooleanField | False after disconnect or expiry |
| `renewal_notified_at` | DateTimeField nullable | Set when expiry notification sent; cleared on renewal |
| `created_at` | DateTimeField auto | |
| `updated_at` | DateTimeField auto | |

### BankApiAuditLog

One row per outbound bank API call.

| Field | Type | Notes |
|-------|------|-------|
| `association` | FK(Association) | |
| `user` | FK(User) nullable | None for cron/system calls |
| `bank` | CharField choices | |
| `endpoint` | CharField | Path only, no query string with tokens |
| `http_method` | CharField | GET / POST / DELETE |
| `status_code` | IntegerField | |
| `timestamp` | DateTimeField auto | |

No payload logged per spec.

### BankNotificationLog

One row per notification sent (email + in-app trigger).

| Field | Type | Notes |
|-------|------|-------|
| `association` | FK(Association) | |
| `notification_type` | CharField choices | CONSENT_EXPIRY (extensible) |
| `recipients` | JSONField | List of email addresses |
| `sent_at` | DateTimeField auto | |
| `success` | BooleanField | |
| `error` | TextField nullable | Error message if failed |

### Transaction (additions)

Two new fields added to the existing `Transaction` model:

| Field | Type | Notes |
|-------|------|-------|
| `source` | CharField choices | MANUAL (default) / BANK_SYNC |
| `external_id` | CharField nullable | Bank-issued transaction ID; unique per bank_account; upsert key |

---

## New Dependencies

| Package | Purpose |
|---------|---------|
| `cryptography` | Fernet symmetric encryption for tokens |
| `django-celery-beat` | Persistent periodic task scheduling |

---

## OAuth Consent Flow

Each bank has its own callback URL so the backend knows which bank's payload format to handle:

- `GET /bank/callback/landsbankinn`
- `GET /bank/callback/arion`
- `GET /bank/callback/islandsbanki`

All callback endpoints are **open** (no JWT required — the bank cannot send one).

**Connect flow:**

1. CHAIR or CFO opens BankSettingsPage, selects bank, clicks "Tengja banka"
2. Frontend calls `GET /associations/{id}/bank/connect?bank=landsbankinn`
3. Backend generates PKCE verifier/challenge + random `state` token, stores `{association_id, bank, user_id}` in Redis (`bank_oauth_state:{state}`, TTL 10 min)
4. Backend redirects user to Landsbankinn authorization URL
5. User authenticates at Landsbankinn
6. Landsbankinn redirects to `GET /bank/callback/landsbankinn?code=...&state=...`
7. Backend validates `state` from Redis, exchanges `code` for tokens using Landsbankinn-specific logic
8. Tokens stored Fernet-encrypted in `BankConsent`; `BankApiAuditLog` entry written
9. Backend redirects to frontend `/bank-settings?status=ok` (or `?status=error&reason=...`)

**Disconnect flow:**

- `DELETE /associations/{id}/bank/disconnect` — CHAIR or CFO only
- Sets `BankConsent.is_active = False`, clears `access_token` and `refresh_token`

---

## API Endpoints

### Bank connection (association-scoped)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/associations/{id}/bank/connect` | CHAIR or CFO | Initiate OAuth, redirect to bank |
| `GET` | `/bank/callback/landsbankinn` | Open | OAuth callback — Landsbankinn |
| `GET` | `/bank/callback/arion` | Open | OAuth callback — Arion (Phase 2) |
| `GET` | `/bank/callback/islandsbanki` | Open | OAuth callback — Íslandsbanki (Phase 3) |
| `DELETE` | `/associations/{id}/bank/disconnect` | CHAIR or CFO | Deactivate consent |
| `GET` | `/associations/{id}/bank/status` | CHAIR or CFO | Current consent status + days until expiry |

### Superadmin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/admin/associations/{id}/bank/sync` | Superadmin | Trigger manual transaction sync (async, returns 202) |
| `GET` | `/admin/bank/health` | Superadmin | Aggregate health stats across all associations |

---

## Transaction Sync

**Celery tasks** (`associations/banks/tasks.py`):

- `sync_transactions(association_id)` — fetches last 30 days of transactions from the bank, upserts into `Transaction` using `external_id` as the key. Sets `source=BANK_SYNC`.
- `sync_all_associations()` — iterates all associations with `BankConsent.is_active=True`, calls `sync_transactions.delay()` for each. Scheduled daily via Celery beat.

**Upsert key:** Landsbankinn returns a stable `transactionId` per transaction. Stored as `Transaction.external_id`. On re-sync, existing records are skipped (not duplicated).

**Manual trigger:** `POST /admin/associations/{id}/bank/sync` dispatches `sync_transactions.delay(association_id)` and returns 202. Superadmin only.

---

## Consent Renewal & Notifications

**Celery beat task:** `check_consent_expiry()` — runs daily.

Logic:
1. Find all `BankConsent` where `is_active=True` and `consent_expires_at - today <= 10 days` and `renewal_notified_at` is None (to avoid duplicate sends)
2. For each: fetch CHAIR and CFO users via `AssociationAccess`
3. Send email to each (Django `send_mail`, Icelandic subject/body)
4. Write `BankNotificationLog` row (success or failure)
5. Set `BankConsent.renewal_notified_at = now()`

**Renewal:** CHAIR or CFO clicks "Endurnýja tengingu" in BankSettingsPage → same connect flow as initial setup → on success: `BankConsent` updated with new tokens, `consent_expires_at = today + 90 days`, `renewal_notified_at = None`.

**In-app warning:** BankSettingsPage reads `days_until_expiry` from `GET /associations/{id}/bank/status` and renders a `MuiAlert` banner if ≤ 10 days. No separate notification model required for in-app — derived from existing data.

---

## Frontend

### New pages

**`BankSettingsPage`** — route `/associations/:id/bank-settings`
- Accessible to: CHAIR, CFO, Superadmin
- Shows: bank name, connection status, consent expiry date, last sync timestamp
- `MuiAlert` warning banner (severity=warning) if ≤ 10 days to expiry, with "Endurnýja tengingu" CTA
- "Tengja banka" button + bank selector when no active consent
- "Aftengja" (Disconnect) button when connected
- Manual sync button — visible to superadmin only, calls `POST /admin/associations/{id}/bank/sync`

**`BankHealthPage`** — route `/admin/bank-health`
- Accessible to: Superadmin only
- Summary stat cards: total active connections, expired, expiring within 14 days, notifications sent this month
- Table: one row per association — bank, status, consent expiry, last sync, last notification sent
- Each row links to that association's BankSettingsPage

**`BankAuthCallback.js`** — handles redirect back from bank
- Reads `?status=` and `?reason=` query params
- Shows brief status message (success / error)
- Redirects to BankSettingsPage after short delay

### Sidebar sub-menu

SuperAdmin entry expands to a collapsible sub-menu:

```
Kerfisstjórn
  ├── Félög          → /superadmin  (existing SuperAdminPage)
  └── Bankaheilsa    → /admin/bank-health  (new BankHealthPage)
```

---

## Security rules

- `access_token` and `refresh_token` never appear in logs, API responses, or audit records
- `BANK_FERNET_KEY` stored in `.env` only; never committed
- All outbound bank HTTP calls go through a shared client with exponential backoff retry and idempotency keys on POST
- Feature flag per bank (`BANK_LANDSBANKINN_ENABLED`, etc.) in settings — allows disabling a bank integration without a deploy
- `state` token in Redis expires after 10 minutes; stale or unknown state tokens return 400

---

## `BankProvider` ABC

Defined in `base_provider.py`. All bank clients implement this interface:

```python
class BankProvider(ABC):
    @abstractmethod
    def get_authorization_url(self, state: str, code_challenge: str) -> str: ...

    @abstractmethod
    def exchange_code(self, code: str, code_verifier: str) -> dict: ...

    @abstractmethod
    def get_transactions(self, consent: BankConsent, from_date: date, to_date: date) -> list[dict]: ...

    @abstractmethod
    def get_balance(self, consent: BankConsent, account_id: str) -> dict: ...

    def create_claim(self, *args, **kwargs):
        raise NotImplementedError("Claim creation pending partner agreement")
```

---

## What is NOT in scope

- PIS / kröfu (claim) creation — `create_claim` raises `NotImplementedError` until partner agreement is signed
- Multi-bank per association — one active `BankConsent` per association enforced by DB unique constraint
- mTLS / eIDAS QWAC certificates — required for Landsbankinn production; sandbox uses standard OAuth. Certificate handling is a production ops task documented separately.
