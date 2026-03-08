# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Húsfélag** is an Icelandic SaaS platform for Building Associations (Húsfélag). Users authenticate via Kennitala (10-digit Icelandic national ID) or phone number. The system manages house associations, apartments, ownership percentages, fee collection, invoices, budgets, and role-based access.

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
│   │   ├── dev.py      # DEBUG=True, CORS allows localhost:3000
│   │   └── prod.py     # DEBUG=False, strict CORS, HTTPS
│   ├── celery.py
│   └── urls.py
├── users/              # User, UserAccess models + /Login endpoint
└── associations/       # HouseAssociation, Apartment models + /HouseAssociation endpoint
```

**Config:** All secrets via `.env` file (see `.env.example`). `DJANGO_ENV=development|production` controls which settings file loads.

**Data flow:** DRF Views → Django ORM → PostgreSQL

**Models:**
- `User` — Kennitala (unique, 10 digits), Name, Email, Phone
- `UserAccess` — links User ↔ HouseAssociation with Role (Admin/Finance/User) and Active flag
- `HouseAssociation` — Kennitala, Name, Address, Email
- `Apartment` — belongs to HouseAssociation; tracks PercentageOwned, PayCommonFees, BuildingName

**Endpoints:**
- `POST /Login` — accepts `personID` (Kennitala) or `phone`; strips hyphens/spaces
- `GET /HouseAssociation/{user_id}` — get association for a user
- `POST /HouseAssociation` — create new association

### Frontend — HusfelagJS

React 17 with React Router 6. Global user state via `UserContext` (also persisted to `localStorage`).

Note: components live in `src/controlers/` (intentional misspelling).

**API base URL:** Set via `REACT_APP_API_URL` env var (defaults to `http://localhost:8000`). Set this in Vercel for production.

**MUI theme:** primary white `#FFFFFF`, secondary green `#08C076`, background dark blue `#1D366F`.

**Routes:**
- `/` → `Login.js` — two-tab form: Auðkennisappið (Kennitala) or Rafræn skilríki (phone)
- `/dashboard` → `Dashboard.js` — fetches user's HouseAssociation; redirects to `/houseassociation` if none found
- `/houseassociation` → `HouseAssociation.js` — form to register a new association

## Deployment

- **Frontend** → Vercel (set `REACT_APP_API_URL` to production API URL)
- **Backend** → Digital Ocean or GCP (set `DJANGO_ENV=production` + all env vars from `.env.example`)
- **Database** → PostgreSQL (managed DB on Digital Ocean or Cloud SQL on GCP)

## Icelandic Domain Notes

- **Kennitala** — 10-digit national ID (formatted as `XXXXXX-XXXX`; hyphens stripped before API use)
- **Auðkennisappið** — Icelandic government authentication app (login tab 1)
- **Rafræn skilríki** — Icelandic digital credentials via phone (login tab 2)
- Planned integration with these auth services is not yet implemented (TODO in `users/views.py`)
