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
poetry run python manage.py runserver 8000   # Start API on http://localhost:8000
poetry run python manage.py makemigrations   # Generate migrations
poetry run python manage.py migrate          # Apply migrations
poetry run celery -A config worker --loglevel=info  # Start Celery worker
```
Swagger UI at `http://localhost:8000/swagger/` — ReDoc at `http://localhost:8000/redoc/`

**Production server:**
```bash
poetry run gunicorn config.asgi:application \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 --workers 4
```

### Frontend (HusfelagJS)
```bash
cd HusfelagJS
npm start            # Start dev server on http://localhost:3000
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
- `Association` — SSN, Name, Address, PostalCode, City
- `Apartment` — belongs to Association; tracks share percentages (share, share_2, share_3, share_eq)
- `ApartmentOwnership` — links User ↔ Apartment with share and is_payer flag

### Authentication & Security

**Auth provider:** Kenni (Icelandic national identity, OIDC). Docs: https://docs.kenni.is

**Flow:**
1. Frontend redirects to `GET /auth/login` → backend redirects to Kenni with PKCE
2. Kenni redirects to `GET /auth/callback` → backend validates, creates/updates User, stores JWT in cache under a one-time exchange code
3. Frontend receives `?code=<exchange_code>` → POSTs to `POST /auth/token` → gets JWT
4. All subsequent requests: `Authorization: Bearer <jwt>`

**JWT:** HS256, signed with `SECRET_KEY`, expires 24h. Issued by `users/oidc.py:create_access_token()`.

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
- `/dashboard` → `Dashboard.js` — protected, main app entry
- `/profile` → `ProfilePage.js` — prompted when email/phone missing after first login

## Deployment

- **Frontend** → Vercel (set `REACT_APP_API_URL` to production API URL)
- **Backend** → Digital Ocean or GCP (set `DJANGO_ENV=production` + all env vars from `.env.example`)
- **Database** → PostgreSQL (managed DB on Digital Ocean or Cloud SQL on GCP)

## Icelandic Domain Notes

- **Kennitala** — 10-digit national ID (formatted as `XXXXXX-XXXX`; hyphens stripped before use)
- **Kenni** — Icelandic national identity provider (OIDC), used for login
- **Auðkennisappið** — the app users authenticate with via Kenni
