# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Húsfélag** is an Icelandic House Association Management System. Users authenticate via Kennitala (10-digit Icelandic national ID) or phone number. The system manages house associations, apartments, ownership percentages, and role-based access.

## Commands

### API (HusfelagAPI)
```bash
cd HusfelagAPI
dotnet run           # Start API on https://localhost:5001
dotnet build         # Build
dotnet test          # Run tests
```
Swagger UI available at `https://localhost:5001/swagger` in development.

### Frontend (HusfelagJS)
```bash
cd HusfelagJS
npm start            # Start dev server on http://localhost:3000
npm run build        # Production build
npm test             # Run tests
```

## Architecture

### Backend — HusfelagAPI

Standard ASP.NET Core controller pattern using `Startup.cs`. MySQL via Pomelo EF Core provider. Connection string in `appsettings.json` (`DefaultConnection`).

**Data flow:** Controllers → `MyDbContext` (EF Core) → MySQL

**Models:**
- `User` — Kennitala (unique, 10 digits), Name, Email, Phone
- `HouseAssociation` — Kennitala, Name, Address, Email
- `Apartment` — belongs to HouseAssociation; tracks `PercentageOwned`, `PayCommonFees`, `BuildingName`
- `UserAccess` — junction table linking User ↔ HouseAssociation with `Role` (Admin/Finance/User) and `Active` flag

**Endpoints:**
- `POST /Login` — accepts `PersonID` (Kennitala) or `Phone`; strips hyphens/spaces before validation
- `GET /HouseAssociation/{UserID}` — get association for a user
- `POST /HouseAssociation` — create new association

### Frontend — HusfelagJS

React 17 with React Router 6. Global user state via `UserContext` (also persisted to `localStorage`).

Note: components live in `src/controlers/` (intentional misspelling of "controllers").

**MUI theme:** primary white `#FFFFFF`, secondary green `#08C076`, background dark blue `#1D366F`.

**Routes:**
- `/` → `Login.js` — two-tab form: Auðkennisappið (Kennitala) or Rafræn skilríki (phone)
- `/dashboard` → `Dashboard.js` — fetches user's HouseAssociation; redirects to `/houseassociation` if none found
- `/houseassociation` → `HouseAssociation.js` — form to register a new association

## Icelandic Domain Notes

- **Kennitala** — 10-digit national ID (formatted as `XXXXXX-XXXX`; hyphens stripped before API use)
- **Auðkennisappið** — Icelandic government authentication app (login tab 1)
- **Rafræn skilríki** — Icelandic digital credentials via phone (login tab 2)
- Planned integration with these services is not yet implemented (TODO in `LoginController.cs`)
