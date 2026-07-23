# Húsfélag

SaaS platform for Icelandic Building Associations (Húsfélag). Manages apartments, owners, fee collection, invoices, and budgets for small building associations.

## Structure

```
husfjelag/
├── HusfelagPy/     # Backend — Python / Django REST API
├── HusfelagJS/     # Frontend — React
└── CLAUDE.md       # AI development guide
```

## Tech Stack

| | Technology |
|---|---|
| **Backend** | Python 3.10, Django 4.1, Django REST Framework 3.14 |
| **Database** | PostgreSQL |
| **Queue** | Celery 5.3 + Redis |
| **Frontend** | React 17, Material-UI v5, React Router v6 |
| **API Docs** | drf-spectacular (Swagger / ReDoc) |
| **Package manager (BE)** | Poetry |
| **Secret management** | Doppler |

## Quick Start

```bash
./dev.sh
```

Starts the backend on `http://localhost:8010` and the frontend on `http://localhost:3010`.

> **First time?** Set up Doppler before running `dev.sh` — see [Secret management with Doppler](#secret-management-with-doppler) below.

## Getting Started

### Prerequisites

- Python 3.10
- Poetry
- Node.js + npm
- PostgreSQL 15
- Redis
- Doppler CLI

On macOS:
```bash
brew install postgresql@15 redis dopplerhq/cli/doppler
brew services start postgresql@15
brew services start redis
```

### Secret management with Doppler

All secrets (certificate, API keys, database credentials) are managed in Doppler. Nothing secret lives in `.env`.

**One-time setup per machine:**
```bash
doppler login          # browser OAuth — token stored in ~/.doppler
cd HusfelagPy
doppler setup          # select the husfjelag project and your environment (dev/stg/prd)
```

After this, `doppler run -- <command>` injects all secrets as environment variables. The `.env` file in `HusfelagPy/` holds local-only non-secret config (debug flags, localhost URLs) and is a fallback for any var not provided by Doppler.

**Encoding the Landsbankinn mTLS certificate for Doppler:**
```bash
base64 -i company.p12 | tr -d '\n'   # copy output → BUNADARSKILRIKI in Doppler
```

**Certificate health check** (no auth required):
```
GET /health/cert
→ { valid, expires_at, days_remaining, warning }
```

### Production — Digital Ocean App Platform

Doppler has a native DO App Platform sync integration. Set it up once in the Doppler dashboard:

1. In Doppler: **Integrations → Digital Ocean App Platform → New Sync**
2. Select the `prd` config and your DO app
3. Doppler will push all secrets to DO as encrypted environment variables automatically on every change

After the sync is active, remove the manually set `BUNADARSKILRIKI` and `BUNADARSKILRIKI_PWD` from DO's environment variable UI — Doppler is the single source of truth.

**Config mapping:**

| Doppler config | Used for |
|---|---|
| `dev` | Local development (`doppler run -- ./dev.sh`) |
| `stg` | Staging app on DO |
| `prd` | Production app on DO |

### Backend (HusfelagPy)

```bash
cd HusfelagPy

# Install dependencies
poetry install --no-root

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, REDIS_URL, OIDC_*, etc.
# Secrets (BUNADARSKILRIKI etc.) come from Doppler, not .env

# Set up the database
createuser --createdb husfelag
createdb -U husfelag husfelag

# Run migrations (via Doppler so cert is available at startup)
doppler run -- poetry run python3 manage.py migrate

# Start the API server
doppler run -- poetry run python3 manage.py runserver 8010
```

API available at `http://localhost:8010`
Swagger UI at `http://localhost:8010/swagger/`
ReDoc at `http://localhost:8010/redoc/`

**Optional — start Celery worker** (for background tasks):
```bash
doppler run -- poetry run celery -A config worker --loglevel=info
```

### Frontend (HusfelagJS)

```bash
cd HusfelagJS

# Install dependencies
npm install

# Start dev server
PORT=3010 REACT_APP_API_URL=http://localhost:8010 npm start
```

App available at `http://localhost:3010`

The frontend connects to the backend via `REACT_APP_API_URL`. Create a `.env.local` file to set it permanently:
```
PORT=3010
REACT_APP_API_URL=http://localhost:8010
```

## Deployment

| | Target | Notes |
|---|---|---|
| **Frontend** | Vercel | Set `REACT_APP_API_URL` to production API URL |
| **Backend** | Digital Ocean App Platform | `DJANGO_ENV=production` + secrets via Doppler sync |
| **Database** | Managed PostgreSQL | Digital Ocean Managed DB |
| **Secrets** | Doppler `prd` config | Synced to DO automatically |

**Production server command (DO run command):**
```bash
python manage.py createcachetable && python manage.py migrate && gunicorn config.asgi:application --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8080 --workers 4 --timeout 120
```

## Domain Notes

This project is built for the Icelandic market.

- **Kennitala** — 10-digit national ID number, used as the primary identifier for both users and building associations
- **Auðkennisappið** — Icelandic government authentication app (login method 1, planned)
- **Búnaðarskilríki** — X.509 client certificate used by Digit ehf. for bank connections: mTLS transport auth to Landsbankinn, and WS-Security message signing to Íslandsbanki

## Development with Claude

This project uses [Claude Code](https://claude.ai/code) as an AI development assistant. Claude has full context of the codebase and is used for:

- Implementing new features end-to-end
- Database model design and migrations
- Writing and reviewing API endpoints
- Frontend component development
- Deployment configuration

### How it works

`CLAUDE.md` at the root of the repo is automatically loaded by Claude Code at the start of every session. It contains the project architecture, commands, and conventions so Claude always has the context needed to work effectively.

When working with Claude on this project, it will:
- Follow the Django + DRF patterns already established in `HusfelagPy/`
- Keep frontend components in `HusfelagJS/src/controlers/` (existing convention)
- Use Poetry for any new Python dependencies
- Never commit `.env` files or secrets

To start a development session, open the `husfjelag/` folder in VS Code and launch Claude Code.
