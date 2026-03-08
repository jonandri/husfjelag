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

## Getting Started

### Prerequisites

- Python 3.10
- Poetry
- Node.js + npm
- PostgreSQL 15
- Redis

On macOS:
```bash
brew install postgresql@15 redis
brew services start postgresql@15
brew services start redis
```

### Backend (HusfelagPy)

```bash
cd HusfelagPy

# Install dependencies
poetry install --no-root

# Configure environment
cp .env.example .env
# Edit .env with your database credentials

# Set up the database
createuser --createdb husfelag
createdb -U husfelag husfelag

# Run migrations
poetry run python manage.py migrate

# Start the API server
poetry run python manage.py runserver 8000
```

API available at `http://localhost:8000`
Swagger UI at `http://localhost:8000/swagger/`
ReDoc at `http://localhost:8000/redoc/`

**Optional — start Celery worker** (for background tasks):
```bash
poetry run celery -A config worker --loglevel=info
```

### Frontend (HusfelagJS)

```bash
cd HusfelagJS

# Install dependencies
npm install

# Start dev server
npm start
```

App available at `http://localhost:3000`

The frontend connects to the backend via `REACT_APP_API_URL` (defaults to `http://localhost:8000`). Create a `.env.local` file to override:
```
REACT_APP_API_URL=http://localhost:8000
```

## Deployment

| | Target | Notes |
|---|---|---|
| **Frontend** | Vercel | Set `REACT_APP_API_URL` to production API URL |
| **Backend** | Digital Ocean or GCP | Set `DJANGO_ENV=production` + all env vars from `.env.example` |
| **Database** | Managed PostgreSQL | Digital Ocean Managed DB or Cloud SQL |

**Production server command:**
```bash
poetry run gunicorn config.asgi:application \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --workers 4
```

## Domain Notes

This project is built for the Icelandic market.

- **Kennitala** — 10-digit national ID number, used as the primary identifier for both users and building associations
- **Auðkennisappið** — Icelandic government authentication app (login method 1, planned)
- **Rafræn skilríki** — Icelandic digital credentials via phone (login method 2, planned)

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
