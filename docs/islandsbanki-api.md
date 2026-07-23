# Íslandsbanki API Integration

## Overview

Húsfjelagið integrates with Íslandsbanki's web services to:
1. Import transactions automatically (daily, via Celery)
2. Send monthly housing fee claims (kröfur) to apartment owners — either directly via API or via bank service email

Unlike Landsbankinn (REST/JSON over mTLS), Íslandsbanki uses **SOAP/XML** with **WS-Security**: each call carries a `UsernameToken` (per-association username + password) **and** an X.509 message signature made with Húsfjelagið's shared Búnaðarskilríki. We build against Íslandsbanki's **proprietary** service suite (`yfirlit` for statements, `krofur` for claims), not the standardized cross-bank schema.

All the routing between banks goes through `associations/banks/dispatch.py:get_provider()`; the Íslandsbanki implementation is `IslandsbankiProvider` in `associations/banks/islandsbanki.py`, with the SOAP transport isolated in `isb_soap.py` and pure data mapping in `isb_mappers.py`.

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `BANK_ISLANDSBANKI_BASE` | Single host for the WSDL fetch **and** the `.asmx` call endpoints. TEST `https://ws-test.isb.is/adgerdirv1/`, PROD `https://ws.isb.is/adgerdirv1/` |
| `BANK_ISLANDSBANKI_EMAIL` | húsfélagaþjónusta inbox for `BANK_SERVICE` budget email (PROD `husfelag@islandsbanki.is`) |
| `BUNADARSKILRIKI` | Base64-encoded `.p12` PFX — **shared** with Landsbankinn; used here for XML message signing |
| `BUNADARSKILRIKI_PWD` | Password for the PFX file |
| `BANK_FERNET_KEY` | Fernet key used to encrypt `isb_password` at rest |

Derived (rarely overridden — all default off `BANK_ISLANDSBANKI_BASE`): `BANK_ISLANDSBANKI_YFIRLIT_WSDL`, `BANK_ISLANDSBANKI_KROFUR_WSDL`, `BANK_ISLANDSBANKI_YFIRLIT_ENDPOINT`, `BANK_ISLANDSBANKI_KROFUR_ENDPOINT`.

All secrets in Doppler; nothing on disk or in `.env`. Sandbox vs production = set `BANK_ISLANDSBANKI_BASE` (one variable).

---

## Data Model

```
Association
  └── AssociationBankSettings   (bank, isb_username, isb_password [encrypted], isb_bank_number, template_id, claim_mode, last_sync_at)
  └── BankAccount               (account_number, is_connected, bank_status, opening_balance)
        └── Transaction         (date, amount, description, external_id, payer_kennitala)
  └── Budget
        └── Collection
              └── BankClaim     (claim_id, status, due_date, sent_at, synced_at)
```

**`AssociationBankSettings` fields used by Íslandsbanki:**
- `isb_username` / `isb_password` — WS-Security `UsernameToken` credentials, **per association**. Password Fernet-encrypted; access via `get_isb_password()` / `set_isb_password()`.
- `isb_bank_number` — the claimant's bank branch (`Bankanumer`), e.g. `"0500"`. Used for claim creation.
- `template_id` — reused as the Íslandsbanki **`Auðkenni`** (the ÍSB-assigned identifier that routes payment to the claimant's collection account, e.g. `"IBB"`).
- `claim_mode` — `DIRECT_API` (kröfur sent via SOAP) or `BANK_SERVICE` (áætlun emailed to the bank).
- `last_sync_at` — updated after every successful transaction sync.

There is **no** `BankTokenCache` for Íslandsbanki — WS-Security has no bearer token to cache; every call is signed and authenticated inline.

---

## Transport & Authentication (`isb_soap.py`)

Built on **`zeep`** (SOAP client) + **`xmlsec`** (WS-Security signing). Three pieces are load-bearing (all proven against the sandbox during the spike):

- **`UsernameToken`** — `isb_username` + decrypted `isb_password`, `PasswordText` (cleartext over TLS, per the Sambankaskema spec).
- **`BinarySignatureTokenFirst`** — subclasses zeep's `BinarySignature` and, after signing, moves the `<wsse:BinarySecurityToken>` to be the first child of `<wsse:Security>` (zeep emits it after `<ds:Signature>`, which the .NET server rejects with `SecurityTokenUnavailable`). Only `soap:Body` is digested, so reordering header children is signature-safe. Uses in-memory PEM buffers (`MemorySignature` style) — nothing written to disk.
- **`WsseBundle`** — wraps `[UsernameToken, BinarySignatureTokenFirst]`; its `verify()` is a no-op (we rely on TLS + fault inspection, not response-signature verification — a raw list `wsse` crashes on response processing).

**Endpoint override is mandatory:** the WSDL's `<soap:address>` points at **production** even when the WSDL is served from the test host, so `invoke()` calls `client.create_service(binding, endpoint)` to drive the host from config. Without it, signed calls silently hit prod.

`isb_soap.invoke(settings, service, operation, **kwargs)` builds the signed client, calls the operation, writes a `BankApiAuditLog` (`endpoint`=operation, `http_method`="POST", `status_code` 200/500) in a `finally`, and returns the response via `zeep.helpers.serialize_object`. **The outgoing envelope is never logged** — it carries the cleartext UsernameToken password.

The signing certificate is exported from the shared PFX as PEM by `cert.load_pem() -> (key_pem, cert_pem)`.

---

## Services & Operations

Base: `{BANK_ISLANDSBANKI_BASE}` — WSDLs under `wsdl/`, endpoints as `<service>.asmx`.

### Statements — `yfirlit.asmx` → `SaekjaReikningsyfirlit`

Fetches a statement for one **known** account (there is no account-listing operation).

**Request:** `banki` (int), `hofudbok` (int), `reikningsnumer` (int), `fra` (dateTime), `til` (dateTime), `faerslaFra` (int), `faerslaTil` (int). The account number `XXXX-XX-XXXXXX` is split into `banki`/`hofudbok`/`reikningsnumer`.

**Response:** list of `ReikningsyfirlitFaersla`:

| Field | Type | → `Transaction` |
|---|---|---|
| `Hreyfingardagur` | datetime | `date` |
| `Upphaed` | Decimal | `amount` (used as-is — see note) |
| `Tilvisunarnumer` | str/None | `reference`; also `payer_kennitala` when it's a 10-digit kennitala |
| `Textalykill` | str | `description` (joined with `Sedilnumer`) |
| `Sedilnumer` | str/None | part of `description` |
| `Bunkanumer` | str/None | part of the dedup hash |
| `Faerslulykill`, `Vaxtadagur`, `Innlausnarbanki`, `Stada` | — | not persisted (`Stada` is running balance) |

**Dedup:** there is no bank-provided unique transaction id, so `external_id` is a stable composite hash of `account + Hreyfingardagur + Upphaed + Tilvisunarnumer + Bunkanumer` (see `isb_mappers.compute_external_id`). Re-syncing the same range is safe.

> **OPEN — amount scaling:** `Upphaed` comes back as large `Decimal` values. Confirm with the bank whether these are whole krónur or minor units (aurar, ÷100) before relying on displayed amounts.

### Claims — `krofur.asmx`

#### `StofnaKrofu` (create)

Takes a single complex `krafa` parameter of type `Krafa` (PascalCase fields). **The caller supplies `Krofunumer`** — the bank does not mint it; we use `Collection.id`. The **response body is empty**: success = no SOAP fault.

`Collection` → `Krafa` (`isb_mappers.build_stofnakrofu_payload`):

| Krafa field | Source | Notes |
|---|---|---|
| `KennitalaKrofuhafa` | `budget.association.ssn` | claimant |
| `KennitalaGreidanda` | `payer.kennitala` | payer |
| `Bankanumer` | `int(settings.isb_bank_number)` | claimant bank branch |
| `Hofudbok` | `66` | claims ledger (always 66) |
| `Krofunumer` | `collection.id` | caller-assigned claim number |
| `Upphaed` | `collection.amount_total` | |
| `Gjalddagi` / `Eindagi` | last day of `(budget.year, month)` | |
| `Nidurfellingardagur` | `Gjalddagi` + 4 years | required auto-cancel date |
| `Tilvisun` | `"HG MM/YYYY"` (**≤16 chars**) | claimant reference |
| `Audkenni` | `settings.template_id` | ÍSB routing identifier; sent only when set |
| fees/interest/discount (`TilkynningarOgGreidslugjald1/2`, `Vanskilagjald1/2`, `DagafjoldiVanskilagjalds1/2`, `AnnarKostnadur`, `AnnarVanskilakostnadur`, `Drattavaxtaprosenta`, `Afslattur1/2`, `DagafjoldiAfslattar1/2`, `Gengisbanki`) | `0` | all `minOccurs=1` — required, zeroed |

`create_claim()` returns `{"id": <claimKey>}` and the **view** persists the `BankClaim` (same contract as Landsbankinn — `SendClaimView`/`SendAllClaimsView` read `api_response["id"]`). The claim key is `"{Bankanumer}:66:{Krofunumer}:{Gjalddagi}"` (stored in `BankClaim.claim_id`) so status lookups can reconstruct the `SaekjaKrofu` args.

#### `SaekjaKrofu` (single status)

**Request:** `kennitalaKrofuhafa`, `banki`, `hofudbok`, `krofunumer`, `gjalddagi` (all parsed back out of the claim key). **Response:** `UppreiknudKrafa` with `Stada`.

State mapping (`isb_mappers.map_claim_state_to_status`, case-insensitive): `GREIDD`→`PAID`, `NIÐURFELLD`→`CANCELLED`, `ÓGREIDD` / `MILLINNHEIMTA` / `LÖGFRÆÐIINNHEIMTA` / `VILLA` / other → `UNPAID`.

#### `SaekjaKrofur` (list)

**Request (all required):** `kennitalaKrofuhafa`, `gjalddagiFra`, `gjalddagiTil`, `astand` (enum `AstandKrofu`: `ÓGREIDD`/`GREIDD`/`NIÐURFELLD`/`MILLINNHEIMTA`/`LÖGFRÆÐIINNHEIMTA`/`ALLAR_KROFUR`), `faerslaFra`, `faerslaTil`. Normalized to `{payer_kennitala, due_date, amount, status, reference}`.

Out of scope (implemented later): `FellaKrofu`/`BreytaKrofu` (cancel/modify), payments queries, `StofnaKrofubunka` (batch), exchange rates.

---

## Claim Modes

Same `claim_mode` switch as Landsbankinn:

- **`DIRECT_API`** — needs `template_id` (Auðkenni) **and** `isb_bank_number`. Chair/CFO sends claims from Collection → `create_claim()` → `StofnaKrofu`; the view records a `BankClaim`.
- **`BANK_SERVICE`** — the bank's húsfélagaþjónusta handles collection. The association emails its budget to `BANK_ISLANDSBANKI_EMAIL` (`NotifyBudgetView` / `SendBudgetOverviewView`, which pick the inbox by bank). No claims sent from the system.

---

## Sync Flow (Celery)

`sync_transactions(association_id)` (dispatched daily and on credential save) resolves the provider via `get_provider()`:

1. **Bank-aware credential guard** — for Íslandsbanki, skips with `isb_credentials_missing` unless both `isb_username` and `isb_password` are set (Landsbankinn checks `api_key`; unknown banks skip with `bank_not_supported`).
2. `IslandsbankiProvider.discover_and_sync_accounts` — Íslandsbanki has no account enumeration, so accounts are entered manually (on the association page). Discovery probes **every** non-deleted account with a 1-day statement fetch and flips `is_connected` on success/failure — this is what connects a manually-added account.
3. For each connected account: `sync_account_transactions` via `SaekjaReikningsyfirlit`.
4. Updates `last_sync_at` on success.

> Note: the daily `sync_claim_statuses` beat task is still Landsbankinn-only (its `_get` bulk probe has no ÍSB equivalent); per-claim `get_claim_status` exists but isn't yet driven by that task — a tracked follow-up.

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| SOAP fault (e.g. bad creds, bad signature) | `zeep.exceptions.Fault` raised; caught at the create-claim views alongside `requests.HTTPError`; `_parse_islandsbanki_error()` extracts `fault.message` for the UI + Bugsnag |
| Missing ÍSB credentials | sync task returns `{"skipped": True, "reason": "isb_credentials_missing"}` |
| Manually-added account fails validation | `discover_and_sync_accounts` sets `is_connected=False`; it's skipped by sync until it validates |
| Duplicate transaction | composite `external_id` checked before insert — re-sync is safe |
| Blank `isb_bank_number` at claim time | `int("")` raises; surfaces as a generic error (inherited gap; low priority) |

---

## Known Gaps / Follow-ups

Live-verified against the sandbox: **transaction sync** (`SaekjaReikningsyfirlit`) and **claim creation** (`StofnaKrofu`). Before enabling ISB claim *retrieval* in production:

- **`list_claims`/`fetch_incoming_claims` shape + semantics** — the incoming-claims UI expects the Landsbankinn dict shape; ÍSB returns a different shape and queries claimant-issued vs. owed claims. Needs a design decision + normalization.
- **`BankStatusView`** — `last_sync_at`/`last_sync_ok` filter `http_method="GET"`, but ÍSB audit rows are `POST`, so the ISB status indicator never lights up (settings page uses `bs.last_sync_at`, which is correct).
- **`sync_claim_statuses`** — wire ÍSB per-claim status refresh into the beat task.
- **Amount scaling** — confirm `Upphaed` krónur vs. aurar.
- **DigitalOcean deploy** — confirm the `xmlsec` wheel installs on the buildpack (fallbacks: `signxml`, or a Dockerfile deploy).

See `docs/superpowers/specs/2026-07-19-islandsbanki-bank-integration-design.md` for the full design and rationale.
