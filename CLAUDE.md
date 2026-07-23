# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UI Style Guide

**All frontend work must follow `docs/style.md`.** It covers page anatomy (three-zone layout), tables, buttons, dialogs, amount display, status chips, label chips, navigation order, and typography. Read it before touching any React file.

## Project Overview

**Húsfjelag** is an Icelandic SaaS platform for Building Associations (Húsfélag). Users authenticate via **id.husfjelag.is**, Húsfjelag's own OIDC identity provider (OIDC/PKCE flow; replaced Kenni on 2026-07-15). The system manages house associations, apartments, ownership percentages, fee collection, invoices, budgets, and role-based access.

## Subprojects

| Folder | Purpose | Language |
|--------|---------|----------|
| `HusfelagPy/` | Backend API | Python 3.10 / Django 4.1 |
| `HusfelagJS/` | Frontend | React 17 |
| `HusfelagAPI/` | Old C# backend (retired) | — |

## Commands

### Backend (HusfelagPy)
```bash
cd HusfelagPy
poetry run python3 manage.py runserver 8010  # Start API on http://localhost:8010
poetry run python3 manage.py makemigrations  # Generate migrations
poetry run python3 manage.py migrate         # Apply migrations
poetry run celery -A config worker --loglevel=info  # Start Celery worker
```
Swagger UI at `http://localhost:8010/swagger/` — ReDoc at `http://localhost:8010/redoc/`

**Production server (Digital Ocean — run command):**
```bash
python manage.py createcachetable && python manage.py migrate && gunicorn config.asgi:application --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8080 --workers 4 --timeout 120
```
- DO runs on port **8080** (not 8000)
- `createcachetable` must run before gunicorn — `DatabaseCache` is used for OIDC exchange codes (required for multi-worker setups; `LocMemCache` does not share state across workers)
- Migrations apply automatically on every deploy via this run command

### Frontend (HusfelagJS)
```bash
cd HusfelagJS
npm start            # Start dev server on http://localhost:3010
npm run build        # Production build
npm test             # Run tests
```

## Architecture

### Backend — HusfelagPy

**Stack:** Django 4.1 + Django REST Framework 3.14, PostgreSQL, Poetry, Redis + Celery, drf-spectacular (OpenAPI).

**Structure:**
```
HusfelagPy/
├── config/
│   ├── settings/
│   │   ├── base.py     # shared settings (env-based config via django-environ)
│   │   ├── dev.py      # DEBUG=True, CORS allows localhost:3010
│   │   └── prod.py     # DEBUG=False, strict CORS, HTTPS
│   ├── celery.py
│   └── urls.py
├── users/              # User model, JWT auth, id.husfjelag.is OIDC flow
└── associations/       # Association, Apartment, Transaction, Budget, Collection models + endpoints
```

**Config:** Secrets come from **Doppler** (injected as OS env vars via `doppler run --`). Non-secret local config lives in `.env` (fallback only — Doppler vars take precedence because `read_env(overwrite=False)`). `DJANGO_ENV=development|production` controls which settings file loads.

**Doppler setup (one-time per machine):**
```bash
doppler login          # browser OAuth
cd HusfelagPy && doppler setup   # select husfjelag project + config (dev/stg/prd)
```
All backend commands in local dev must be wrapped: `doppler run -- poetry run python3 manage.py ...`

**Data flow:** DRF Views → Django ORM → PostgreSQL

**Models:**
- `User` — Kennitala (unique, 10 digits), Name, Email, Phone, is_superadmin. Has `is_authenticated = True` property (required by DRF).
- `AssociationAccess` — links User ↔ Association with Role (CHAIR/CFO/MEMBER) and Active flag
- `Association` — SSN, Name, Address, PostalCode, City, date_of_board_change, registered, status (last three from Skattur Cloud)
- `Apartment` — belongs to Association; tracks share percentages:
  - `share` → SHARED budget type (Sameiginlegt — general shared costs)
  - `share_2` → SHARE2 budget type (Hiti — heating)
  - `share_3` → SHARE3 budget type (Lóð — lot/ground)
  - `share_eq` → EQUAL budget type (Jafnskipt — equal split, auto-recalculated by `_recalc_share_eq()`)
  - All shares must sum to 100% per type across all active apartments before a Collection can be generated
  - HMS import sets `anr`, `fnr`, `size` only — `share`, `share_2`, `share_3` must be entered manually; `share_eq` is auto-set after import
- `ApartmentOwnership` — links User ↔ Apartment with share and is_payer flag
- `RegistrationRequest` — submitted by a logged-in user with no association access; status PENDING/REVIEWED (max_length=16); fields: assoc_ssn, assoc_name, chair_ssn, chair_name, chair_email, chair_phone, submitted_by (FK User), created_at. One PENDING request per user+assoc_ssn enforced in the view.
- `TermsAcceptance` — one-to-one with User; created once when user accepts terms; fields: kennitala, name (denormalised for audit durability), accepted_at, ip_address. Never updated.
- `AuditLog` — append-only event log; fields: created_at, user (FK, SET_NULL), association (FK, SET_NULL, nullable), action (choice), value (str). Actions: `login`, `chair_changed`, `cfo_changed`, `association_new`, `budget_new`, `owner_new`.
- `BankProvider(TextChoices)` — `LANDSBANKINN`, `ISLANDSBANKI`, `ARION`
- `AssociationBankSettings` — one-to-one with Association; fields: `bank` (BankProvider choice), `claim_mode` (`ClaimMode`: DIRECT_API = system creates claims / BANK_SERVICE = bank's húsfélagaþjónusta handles collection), `api_key` (per-association Landsbankinn client ID, Fernet), `template_id` (Landsbankinn claims template **and** Íslandsbanki `Auðkenni`), `isb_username` / `isb_password` (Íslandsbanki WS-Security creds, password Fernet-encrypted), `isb_bank_number` (Íslandsbanki `Bankanumer`, e.g. "0500"), `last_sync_at`, `created_at`, `updated_at`. Helpers: `get/set_api_key`, `get/set_isb_password`.
- `BankTokenCache` — cached OAuth tokens per `(bank, client_id)` unique pair; tokens stored Fernet-encrypted; `expires_at` used to avoid refreshing valid tokens (60 s early-expiry buffer)
- `AssociationEvent` — calendar event/task for an association (annual meeting, statement, budget prep, collection, other). Fields: `title`, `description`, `event_type` (`EventType`: MEETING/STATEMENT/BUDGET/COLLECTION/OTHER), `event_date`, `event_time` (nullable), `visibility` (`EventVisibility`: ALL/BOARD), `reminder_days` (nullable; email N days before), `reminder_sent_at` (nullable; set once a reminder fires), `created_by` (FK User, SET_NULL), `created_at`, `deleted` (soft-delete). Defaults are seeded per association on creation (`associations/events.py:seed_default_events`); existing associations backfilled by migration `0036`.

### Authentication & Security

**Auth provider:** id.husfjelag.is — Húsfjelag's own OIDC identity provider (Authorization Code + PKCE, `client_secret_basic`). Replaced Kenni on 2026-07-15. Endpoints configured in `config/settings/base.py` under `OIDC_*`.

**Flow:**
1. Frontend redirects to `GET /auth/login` → backend redirects to id.husfjelag.is with PKCE
2. id.husfjelag.is redirects to `GET /auth/callback` → backend validates the id_token, creates/updates User, stores the JWT (+ the IdP id_token, kept for logout) in cache under a one-time exchange code
3. Frontend receives `?code=<exchange_code>` → POSTs to `POST /auth/token` → gets `{token, id_token}`
4. All subsequent requests: `Authorization: Bearer <jwt>`

**Logout (RP-initiated):** `GET /auth/logout?id_token_hint=<id_token>` redirects to the IdP `end_session_endpoint` (with `post_logout_redirect_uri` + `client_id`) so the IdP clears its SSO session, then returns to the frontend. Without it the IdP silently re-authenticates on the next login. The frontend stores `id_token` on login and hands off to `/auth/logout` on sign-out. `post_logout_redirect_uri` must be registered on the client char-for-char (`FRONTEND_URL` + trailing slash).

**JWT:** HS256, signed with `SECRET_KEY`, expires 24h. Issued by `users/oidc.py:create_access_token(user_id: int)` — takes the integer user ID, **not** the User object. `sub` claim is `str(user_id)`. `JWTAuthentication` looks up the user via `User.objects.get(id=int(payload["sub"]))`.

**401 auto-logout:** `apiFetch()` clears `localStorage` and redirects to `/` on any 401 response. This means a stale/invalid token will immediately log the user out.

**DRF enforcement:** `users/authentication.py:JWTAuthentication` is set as the global `DEFAULT_AUTHENTICATION_CLASSES`. `DEFAULT_PERMISSION_CLASSES` is `IsAuthenticated`. Every endpoint requires a valid JWT unless explicitly listed below.

**Terms acceptance:** `user.terms_accepted` (bool) is returned by `UserSerializer` via `SerializerMethodField` — true if a `TermsAcceptance` row exists for the user. `POST /auth/terms/accept` creates the record (idempotent) and returns the updated user object.

**Open endpoints (no JWT required):**
- `GET /auth/login` — starts id.husfjelag.is OIDC flow
- `GET /auth/callback` — id.husfjelag.is redirect target
- `POST /auth/token` — exchange one-time code for JWT (+ id_token)
- `GET /auth/logout` — RP-initiated logout; redirects to the IdP end_session endpoint
- `POST /Login` — returns 410 Gone (legacy, disabled)
- `GET /health/cert` — mTLS certificate health; returns `{valid, expires_at, days_remaining, warning}`

**All other endpoints are authenticated.** Authorization is enforced in layers:

1. **Data scoping** — `_resolve_assoc(user_id, request)` validates URL `user_id` matches `request.user` (superadmins may access any). Returns the association or None.
2. **Membership check** — `_can_access_assoc(request, association)` — any active `AssociationAccess` entry. Used for read-only member pages (Apartments, Owners).
3. **Role check** — `_require_chair_or_cfo(request, association)` — only CHAIR or CFO role. Used for all write operations and privileged read pages (Budget, Transactions, Collection, Report, AnnualStatement, import flows).
4. **Chair-only** — `_require_chair(request, association)` — only CHAIR. Used for role management (`PATCH /AssociationRole`).
5. **Superadmin** — `request.user.is_superadmin` — never from request body or query params. Used for system-admin views.

**Role access matrix:**

| Capability | MEMBER | CHAIR / CFO | Superadmin |
|---|---|---|---|
| Read apartments, owners | ✅ | ✅ | ✅ |
| Mutate apartments, owners | ❌ | ✅ | ✅ |
| Budget, Transactions, Collection, Report, AnnualStatement | ❌ | ✅ | ✅ |
| Apartment import (HMS) | ❌ | ✅ | ✅ |
| Manage association roles | ❌ | CHAIR only | ✅ |
| Edit own profile (email, phone) | ✅ | ✅ | ✅ |
| System admin (`/admin/*`, AccountingKey/Category mutations) | ❌ | ❌ | ✅ |

**Frontend:** All API calls go through `src/api.js:apiFetch()` which injects `Authorization: Bearer <token>` automatically. Never use bare `fetch()` in controllers — always use `apiFetch()`.

**Rate limiting:** `AnonRateThrottle` (60/min), `UserRateThrottle` (300/min), `login` scope (5/min, unused since login is now OIDC-only).

### Frontend — HusfelagJS

React 17 with React Router 6. Global user state via `UserContext` (also persisted to `localStorage`).

Note: components live in `src/controlers/` (intentional misspelling).

**API base URL:** Set via `REACT_APP_API_URL` env var (defaults to `http://localhost:8010`). Set this in Vercel for production.

**MUI theme:** primary white `#FFFFFF`, secondary green `#08C076`, background dark blue `#1D366F`.

**Auth state:** User object stored in `localStorage` as `user` key, including `token` field. Association memory stored per-user as `currentAssociation_${user.id}`.

**Key routes:**
- `/` → `HomePage.js` — public landing page
- `/skilmalar` → `SkilmalarPage.js` — public Terms of Service (Icelandic, 10 sections)
- `/personuvernd` → `PersonuverndPage.js` — public Privacy Policy (GDPR/law 90/2018, Icelandic, 11 sections)
- `/login` → `Login.js` — redirects to id.husfjelag.is via backend
- `/auth/callback` → `AuthCallback.js` — exchanges code for JWT, fetches profile; redirects to `/terms-accept` if `!terms_accepted`, else `/profile` if email/phone missing, else `/dashboard`
- `/terms-accept` → `TermsAcceptPage.js` — protected; shown on first login; user must accept before accessing any other protected route
- `/dashboard` → redirects to `/yfirlit`
- `/profile` → `ProfilePage.js` — gated: redirected here automatically if `user.email` or `user.phone` is missing
- `/skraning` → `RegistrationRequestPage.js` — for logged-in users with no association; submit registration request

**`ProtectedRoute` logic (in order):**
1. If `!user.terms_accepted` → redirect to `/terms-accept` (exempt: `/terms-accept` itself)
2. If `user.email` or `user.phone` missing → redirect to `/profile` (exempt: `/profile`, `/skraning`)
3. If user has no associations and is not superadmin → show `NoAssociationView` (with "Skrá húsfélag" CTA)
4. If user has no associations and is superadmin → redirect to `/superadmin`

## Deployment

- **Frontend** → Vercel (set `REACT_APP_API_URL` to production API URL, e.g. `https://api.husfjelag.is`)
- **Backend** → Digital Ocean App Platform (set `DJANGO_ENV=production` + all env vars from `.env.example`)
  - Run command: `python manage.py createcachetable && python manage.py migrate && gunicorn config.asgi:application --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8080 --workers 4 --timeout 120`
  - Migrations and cache table creation happen automatically on every deploy
- **Database** → PostgreSQL managed DB (Digital Ocean)
- **DNS** — Cloudflare: `api.husfjelag.is` → DO backend, `www.husfjelag.is` → Vercel frontend

**Critical env vars on DO:**
- `DJANGO_ENV=production`
- `FRONTEND_URL=https://www.husfjelag.is` (used in OIDC redirect back to frontend)
- `OIDC_REDIRECT_URI=https://api.husfjelag.is/auth/callback`
- `CORS_ALLOWED_ORIGINS=https://www.husfjelag.is,https://husfjelag.vercel.app` (HTTPS, comma-separated, no trailing slash)
- `ALLOWED_HOSTS=api.husfjelag.is`

## Key Backend Patterns

**Never use `Response(None)`** — DRF renders it as an empty byte string `b''`, not JSON `null`. `resp.json()` on the frontend then throws `SyntaxError`. Use `Response({"detail": "..."}, status=HTTP_404_NOT_FOUND)` instead.

**Skattur Cloud API** (`associations/skattur_cloud.py`) — Icelandic company registry. Key functions:
- `fetch_legal_entity(kennitala)` → raw entity dict or None
- `extract_prokuruhafar(entity)` → list of `{"national_id", "name"}` for Prókúruhafi relationships
- `parse_entity_for_association(ssn, entity)` → dict ready to create/update an Association (prefers Póstfang address, falls back to Lögheimilisfang)
- Requires `SKATTUR_CLOUD_API_KEY` in `.env`

**Terms acceptance endpoint:**
- `POST /auth/terms/accept` — authenticated; creates `TermsAcceptance` record (idempotent — returns existing user if already accepted); records IP via `X-Forwarded-For` for audit trail

**Registration request endpoints:**
- `POST /RegistrationRequest` — any authenticated user; creates a PENDING request; rejects duplicates (same user + assoc_ssn already PENDING) with 409
- `GET /admin/RegistrationRequest` — superadmin only; returns all PENDING requests
- `PATCH /admin/RegistrationRequest/<id>` — superadmin only; only accepts `{"status": "REVIEWED"}` (one-way transition)

**Association event endpoints (`AssociationEventView`):**
- `GET /Event/<user_id>` — list events for the user's association. Members see only `ALL`-visibility events; CHAIR/CFO/superadmin see all.
- `POST /Event` — create (board only). Body: `{user_id, title, event_type, event_date, event_time?, visibility?, reminder_days?, description?}`. Writes `AuditLog` action `event_new`.
- `PUT /Event/update/<event_id>` — update (board only). Clears `reminder_sent_at` so an edited schedule can fire again.
- `DELETE /Event/delete/<event_id>` — soft-delete (board only).

**Event reminder emails (Resend):**
- Email is sent via Resend — `associations/notifications.py:send_email(to, subject, html)`. Configured by `RESEND_API_KEY` + `DEFAULT_FROM_EMAIL` (Doppler/env). When `RESEND_API_KEY` is empty (local dev) it logs instead of sending. Requires `RESEND_API_KEY` and a verified sending domain in production.
- `associations/tasks.py:send_event_reminders` — Celery beat task (daily 08:00, in `CELERY_BEAT_SCHEDULE`). For each non-deleted event with `reminder_days` set and no `reminder_sent_at`, once today is on/after `event_date − reminder_days` (and the event hasn't passed), emails the audience matching visibility (BOARD → active CHAIR/CFO; ALL → all current active owners via non-deleted `ApartmentOwnership`) and stamps `reminder_sent_at` so it fires only once.

**Bank status endpoint:**
- `GET /associations/{id}/bank/status` — returns `{configured, last_sync_at, last_sync_ok}`. `configured` = `AssociationBankSettings` row exists. `last_sync_ok` = bool derived from most recent `BankApiAuditLog` status_code (null if no logs yet).

**Landsbankinn mTLS cert (`associations/banks/cert.py`):**
- `BUNADARSKILRIKI` — base64-encoded `.p12` PFX file, stored in Doppler (never on disk)
- `BUNADARSKILRIKI_PWD` — PFX password, stored in Doppler
- `cert.load() -> (bytes, str)` — decodes base64, validates PFX via `load_pkcs12`, caches in module-level `_CACHE` (parsed once per process)
- `cert.get_expiry() -> datetime` — reads `not_valid_after_utc` from the PFX certificate
- Startup: `associations/apps.py:ready()` logs cert status (or WARNING if not set); raises `RuntimeError` if BUNADARSKILRIKI is set but fails to load
- `requests_pkcs12.post(..., pkcs12_data=bytes, pkcs12_password=str)` — cert passed in-memory, nothing written to disk

**Landsbankinn token caching (`associations/banks/landsbankinn.py`):**
- `get_access_token(api_key: str) -> str` — api_key is required; tokens cached per `(bank, client_id)` in `BankTokenCache`; refreshed 60 s before expiry
- All `_get`, `_post`, `sync_account_transactions`, `get_claim_status` require `api_key` as explicit arg
- Each association supplies its own `api_key` via `AssociationBankSettings.api_key` — no global fallback key

**Bank provider dispatch (`associations/banks/`):**
- `provider_base.py:BankProvider` (ABC) + `dispatch.py:get_provider(settings) -> BankProvider` route views/tasks by `settings.bank`. `LandsbankinnProvider` wraps the existing REST module; `IslandsbankiProvider` is SOAP. Every provider method takes the `AssociationBankSettings` object.
- **Landsbankinn** = REST/JSON (mTLS `client_credentials` + `apikey` header); auto-discovers accounts.
- **Íslandsbanki** = SOAP/XML via `zeep` + `xmlsec` (`isb_soap.py`): WS-Security `UsernameToken` (per-association `isb_username`/`isb_password`) **+** X.509 message signing with the shared `BUNADARSKILRIKI` PFX. Proprietary `yfirlit`/`krofur` services. Key gotchas baked into `isb_soap.py`: the `<wsse:BinarySecurityToken>` is moved before `<ds:Signature>` in `apply()`; a `WsseBundle` wraps the two handlers; the endpoint is overridden via `create_service` because the WSDL's `soap:address` points at prod. Never log the outgoing envelope (cleartext password). No account auto-discovery → accounts entered manually.
  - **Transaction sync** — `SaekjaReikningsyfirlit`; dedup on a composite `external_id` hash (no bank-provided tx id).
  - **Claims** — create via `StofnaKrofu` (caller-assigned `Krofunumer` = `Collection.id`, `Bankanumer` = `isb_bank_number`, `Auðkenni` = `template_id`, `Hofudbok`=66, fees zeroed; empty response = success). `create_claim` returns `{"id": <claimKey>}` and the **view** persists `BankClaim` (same contract as Landsbankinn); claim key = `"{banki}:66:{krofunumer}:{gjalddagi}"`. Retrieve/status via `SaekjaKrofu`/`SaekjaKrofur`.
- **Env vars:** `BANK_ISLANDSBANKI_BASE` (single host for WSDL + `.asmx` endpoints; TEST `ws-test.isb.is`, PROD set to `https://ws.isb.is/adgerdirv1/`), `BANK_ISLANDSBANKI_EMAIL` (húsfélagaþjónusta inbox for BANK_SERVICE budget email; PROD `husfelag@islandsbanki.is`). Signing reuses `BUNADARSKILRIKI`.

**Claim mode (`ClaimMode`, per association):**
- `DIRECT_API` — the system creates claims through the bank's API each month (needs Landsbankinn `template_id`, or Íslandsbanki `template_id`+`isb_bank_number`).
- `BANK_SERVICE` — the bank's húsfélagaþjónusta handles collection; the association emails its budget to the bank inbox (`NotifyBudgetView`/`SendBudgetOverviewView`, per-bank `BANK_*_EMAIL`). No claims sent from the system.

**Audit log:** `AuditLog.objects.create(user=..., association=..., action=..., value=...)` — call directly at event sites. `association` is nullable (login events have no association context). `value` carries event-specific data: kennitala for role changes, association SSN for new associations, budget ID for new budgets, `"{apartment_id}:{kennitala}"` for new owners.

**Management commands:**
- `poetry run python3 manage.py delete_association <id>` — cascading delete of an association and all related data (prompts for name confirmation)

## Icelandic Domain Notes

- **Kennitala** — 10-digit national ID (formatted as `XXXXXX-XXXX`; hyphens stripped before use)
- **id.husfjelag.is** — Húsfjelag's own OIDC identity provider, used for login (replaced Kenni on 2026-07-15)
- **Auðkennisappið** — the app users authenticate with (eID) during the id.husfjelag.is login flow
