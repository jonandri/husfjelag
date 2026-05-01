# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## UI Style Guide

**All frontend work must follow `docs/style.md`.** It covers page anatomy (three-zone layout), tables, buttons, dialogs, amount display, status chips, label chips, navigation order, and typography. Read it before touching any React file.

## Project Overview

**Húsfjelag** is an Icelandic SaaS platform for Building Associations (Húsfélag). Users authenticate via Kenni (Icelandic national identity provider, OIDC/PKCE flow). The system manages house associations, apartments, ownership percentages, fee collection, invoices, budgets, and role-based access.

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
python manage.py createcachetable && python manage.py migrate && gunicorn config.asgi:application -c gunicorn.conf.py
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
├── users/              # User model, JWT auth, Kenni OIDC flow
└── associations/       # Association, Apartment, Transaction, Budget, Collection models + endpoints
```

**Config:** All secrets via `.env` file (see `.env.example`). `DJANGO_ENV=development|production` controls which settings file loads.

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

### Authentication & Security

**Auth provider:** Kenni (Icelandic national identity, OIDC). Docs: https://docs.kenni.is

**Flow:**
1. Frontend redirects to `GET /auth/login` → backend redirects to Kenni with PKCE
2. Kenni redirects to `GET /auth/callback` → backend validates, creates/updates User, stores JWT in cache under a one-time exchange code
3. Frontend receives `?code=<exchange_code>` → POSTs to `POST /auth/token` → gets JWT
4. All subsequent requests: `Authorization: Bearer <jwt>`

**JWT:** HS256, signed with `SECRET_KEY`, expires 24h. Issued by `users/oidc.py:create_access_token(user_id: int)` — takes the integer user ID, **not** the User object. `sub` claim is `str(user_id)`. `JWTAuthentication` looks up the user via `User.objects.get(id=int(payload["sub"]))`.

**401 auto-logout:** `apiFetch()` clears `localStorage` and redirects to `/` on any 401 response. This means a stale/invalid token will immediately log the user out.

**DRF enforcement:** `users/authentication.py:JWTAuthentication` is set as the global `DEFAULT_AUTHENTICATION_CLASSES`. `DEFAULT_PERMISSION_CLASSES` is `IsAuthenticated`. Every endpoint requires a valid JWT unless explicitly listed below.

**Open endpoints (no JWT required):**
- `GET /auth/login` — starts Kenni OIDC flow
- `GET /auth/callback` — Kenni redirect target
- `POST /auth/token` — exchange one-time code for JWT
- `POST /Login` — returns 410 Gone (legacy, disabled)

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
- `/login` → `Login.js` — redirects to Kenni via backend
- `/auth/callback` → `AuthCallback.js` — exchanges code for JWT, fetches profile, redirects
- `/dashboard` → redirects to `/yfirlit`
- `/profile` → `ProfilePage.js` — gated: redirected here automatically if `user.email` or `user.phone` is missing
- `/skraning` → `RegistrationRequestPage.js` — for logged-in users with no association; submit registration request

**`ProtectedRoute` logic:**
1. If `user.email` or `user.phone` missing → redirect to `/profile` (exempts `/profile` and `/skraning`)
2. If user has no associations and is not superadmin → show `NoAssociationView` (with "Skrá húsfélag" CTA)
3. If user has no associations and is superadmin → redirect to `/superadmin`

## Deployment

- **Frontend** → Vercel (set `REACT_APP_API_URL` to production API URL, e.g. `https://api.husfjelag.is`)
- **Backend** → Digital Ocean App Platform (set `DJANGO_ENV=production` + all env vars from `.env.example`)
  - Run command: `python manage.py createcachetable && python manage.py migrate && gunicorn config.asgi:application -c gunicorn.conf.py`
  - Migrations and cache table creation happen automatically on every deploy
- **Database** → PostgreSQL managed DB (Digital Ocean)
- **DNS** — Cloudflare: `api.husfjelag.is` → DO backend, `www.husfjelag.is` → Vercel frontend

**Critical env vars on DO:**
- `DJANGO_ENV=production`
- `FRONTEND_URL=https://www.husfjelag.is` (used in OIDC redirect back to frontend)
- `KENNI_REDIRECT_URI=https://api.husfjelag.is/auth/callback`
- `CORS_ALLOWED_ORIGINS=https://www.husfjelag.is,https://husfjelag.vercel.app` (HTTPS, comma-separated, no trailing slash)
- `ALLOWED_HOSTS=api.husfjelag.is`

## Key Backend Patterns

**Never use `Response(None)`** — DRF renders it as an empty byte string `b''`, not JSON `null`. `resp.json()` on the frontend then throws `SyntaxError`. Use `Response({"detail": "..."}, status=HTTP_404_NOT_FOUND)` instead.

**Skattur Cloud API** (`associations/skattur_cloud.py`) — Icelandic company registry. Key functions:
- `fetch_legal_entity(kennitala)` → raw entity dict or None
- `extract_prokuruhafar(entity)` → list of `{"national_id", "name"}` for Prókúruhafi relationships
- `parse_entity_for_association(ssn, entity)` → dict ready to create/update an Association (prefers Póstfang address, falls back to Lögheimilisfang)
- Requires `SKATTUR_CLOUD_API_KEY` in `.env`

**Registration request endpoints:**
- `POST /RegistrationRequest` — any authenticated user; creates a PENDING request; rejects duplicates (same user + assoc_ssn already PENDING) with 409
- `GET /admin/RegistrationRequest` — superadmin only; returns all PENDING requests
- `PATCH /admin/RegistrationRequest/<id>` — superadmin only; only accepts `{"status": "REVIEWED"}` (one-way transition)

**Management commands:**
- `poetry run python3 manage.py delete_association <id>` — cascading delete of an association and all related data (prompts for name confirmation)

## Icelandic Domain Notes

- **Kennitala** — 10-digit national ID (formatted as `XXXXXX-XXXX`; hyphens stripped before use)
- **Kenni** — Icelandic national identity provider (OIDC), used for login
- **Auðkennisappið** — the app users authenticate with via Kenni
