# Apartment Bulk Import — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

A one-time setup wizard that guides association admins through importing their apartment list from the Icelandic property registry (hms.is/fasteignaskra). The wizard scrapes apartment data (Fasteignanúmer, Merking, Stærð) and performs a create-or-update import. Existing apartments not found on HMS are flagged for optional deactivation.

---

## Entry Points

Two entry points on the Apartments page (`/apartments`):

1. **Onboarding banner** — shown when the association has zero apartments. Prominent call-to-action: "Setja upp íbúðir sjálfkrafa — Flytja inn frá HMS →". Disappears once apartments exist.
2. **Subtle text link** — shown alongside the "+ Bæta við íbúð" button header when apartments already exist. Allows re-imports (e.g. after a property registry update).

Both navigate to the full-page wizard at `/apartments/import`.

---

## Wizard — 3-Step Full Page Flow

Route: `/apartments/import`
Layout: full page with sidebar (same shell as other pages), breadcrumb back to Íbúðir.

### Step 1 — Introduction

Explains the process in three numbered points:
1. Open hms.is/fasteignaskra (link opens in new tab)
2. Search for the association's address, verify all apartments are listed
3. Copy the URL from the browser address bar (example shown: `https://hms.is/fasteignaskra/228369/1203373`)

Note: associations with multiple addresses (e.g. nr. 38 and 40) can add multiple URLs on the next step.

No user input on this step. "Áfram →" proceeds to Step 2.

### Step 2 — Paste URL(s)

User pastes one or more hms.is URLs — one per address/building.

- Each URL entry has a label ("Heimilisfang 1", "Heimilisfang 2", ...) and a remove ✕ button
- "+ Bæta við heimilisfangi" adds another URL input (no hard limit, but 1–4 is typical)
- URL validation before submit: must match pattern `https://hms.is/fasteignaskra/{id}/{id}`
- "Sækja gögn →" calls `POST /Apartment/import/preview`
- Loading state shown while backend scrapes; errors displayed inline (unreachable, no apartments found, invalid URL)

### Step 3 — Preview & Confirm

Displays a merged table of all apartments from all URLs, colour-coded by action:

| Colour | Status | Meaning |
|--------|--------|---------|
| Green | Ný (New) | Apartment found on HMS, not in DB — will be created |
| Yellow | Uppfærsla (Update) | `fnr` matches existing apartment — `anr` and `size` will be updated |
| Red | Ekki á HMS (Not on HMS) | Apartment in DB but not in any scraped URL |

"Not on HMS" rows have a checkbox (default: checked) to deactivate the apartment on import.
User can uncheck to keep them active.

Summary chips above the table show counts: "8 íbúðir til að búa til", "2 til að uppfæra", "1 ekki á HMS".

"Staðfesta innflutning" calls `POST /Apartment/import/confirm`. On success, navigates back to `/apartments` with the refreshed list.

---

## Backend

### New scraper function — `scraper.py`

```python
def scrape_hms_apartments(url: str) -> list[dict] | None:
    """
    Scrape hms.is/fasteignaskra for apartment list.
    Returns list of {fnr, anr, size} or None on failure.
    """
```

Parses the hms.is property page using `requests` + `BeautifulSoup` (same pattern as `lookup_association`). Extracts rows from the apartment table: Fasteignanúmer → `fnr`, Merking → `anr`, Stærð → `size` (decimal, m²).

### New endpoints — `views.py`

#### `POST /Apartment/import/preview`

Request:
```json
{ "user_id": 1, "urls": ["https://hms.is/fasteignaskra/228369/1203373"] }
```

Logic:
1. Resolve association from `user_id` (via `_resolve_assoc`)
2. Scrape each URL, merge all apartments into one list (deduplicate by `fnr`)
3. Compare against existing `Apartment` records for the association
4. Classify each into `create`, `update`, or `missing`

Response:
```json
{
  "create":  [{ "fnr": "2011134", "anr": "0101", "size": 68.5 }],
  "update":  [{ "id": 5, "fnr": "2011135", "anr": "0201", "size": 72.0, "current_anr": "0201", "current_size": 70.0 }],
  "missing": [{ "id": 7, "fnr": "2011099", "anr": "0301" }]
}
```

Error responses:
- `400` — invalid URL format or no URLs provided
- `502` — hms.is unreachable
- `404` — scraped page returned zero apartments

#### `POST /Apartment/import/confirm`

Request:
```json
{ "user_id": 1, "urls": ["..."], "deactivate_ids": [7] }
```

Logic:
1. Re-scrape URLs (same as preview — avoids stale data from client)
2. Bulk-create new apartments (`Apartment.objects.bulk_create`)
3. Update existing apartments (loop `fnr` matches, update `anr` + `size`)
4. Soft-delete apartments in `deactivate_ids` (set `deleted=True`)
5. Return updated apartment list (same shape as `GET /Apartment/{user_id}`)

### URL routing — `urls.py`

```python
path('Apartment/import/preview', ApartmentImportPreviewView.as_view()),
path('Apartment/import/confirm', ApartmentImportConfirmView.as_view()),
```

---

## Frontend

### New files

- `HusfelagJS/src/controlers/ApartmentImportPage.js` — full-page wizard (Steps 1–3)

### Modified files

- `HusfelagJS/src/App.js` — add route `/apartments/import → ApartmentImportPage`
- `HusfelagJS/src/controlers/ApartmentsPage.js` — add onboarding banner (empty state) and subtle re-import link (non-empty state)
- `HusfelagJS/src/controlers/Sidebar.js` — no change needed (wizard is a sub-route, not a nav item)

### State in `ApartmentImportPage`

```
step: 1 | 2 | 3
urls: string[]          // Step 2 inputs
preview: { create, update, missing } | null
deactivateIds: Set<number>
loading: boolean
error: string
```

---

## Error Handling

| Scenario | Where shown | Message |
|----------|-------------|---------|
| Invalid URL format | Step 2, inline | "Slóðin er ekki í réttu sniði. Dæmi: https://hms.is/fasteignaskra/228369/1203373" |
| hms.is unreachable | Step 2, after fetch | "Ekki tókst að ná sambandi við HMS. Reyndu aftur síðar." |
| Zero apartments scraped | Step 2, after fetch | "Engar íbúðir fundust á þessari síðu. Athugaðu að þú sért með rétta slóð." |
| Confirm fails | Step 3, inline | "Villa við innflutning. Reyndu aftur." |

---

## Key Decisions

- **`fnr` (Fasteignanúmer) is the natural key** for matching scraped apartments to existing records.
- **Re-scrape on confirm** — preview payload is not trusted; backend re-fetches to avoid stale data.
- **Shares not imported** — `share`, `share_2`, `share_3` are not available on hms.is and must be filled in manually after import.
- **Wizard is not a nav item** — it's a sub-flow off the Apartments page, not a permanent sidebar link.
- **`.superpowers/` should be added to `.gitignore`**.
