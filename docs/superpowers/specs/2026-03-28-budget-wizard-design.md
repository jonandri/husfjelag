# Budget Wizard — Design Spec

**Date:** 2026-03-28
**Status:** Approved

## Overview

Replace the one-click "create budget" button with a guided 3-step wizard at `/aaetlun/nyr`. Move category management from the per-association `/flokkar` page to the superadmin panel as a global list shared by all associations.

---

## Key Decisions

- **Categories are global.** `Category.association` FK is removed. One shared list managed by the superadmin. All associations share the same category definitions and only set budgeted amounts.
- **Wizard is a full-page sub-route** (`/aaetlun/nyr`), matching the HMS import wizard pattern.
- **`/flokkar` sidebar link removed** for Chair/CFO users.
- **Collection amounts are computed dynamically** from the active budget — no change needed there.
- **Clean migration:** existing per-association category data is dropped.

---

## Data Model Changes

### `Category` model — remove association FK

```python
class Category(models.Model):
    # association FK removed
    name    = models.CharField(max_length=255)
    type    = models.CharField(max_length=20, choices=CategoryType.choices)
    deleted = models.BooleanField(default=False)
```

Migration:
1. Drop the `association` FK and `unique_together` constraint from `Category`.
2. Delete all existing category rows (clean slate agreed).

### `_create_budget_items` — remove

This helper was called by the old one-click "create budget" endpoint. The wizard replaces that endpoint entirely — item creation now happens inside `POST /Budget/wizard` directly. `_create_budget_items` should be deleted as dead code, along with any old "create budget" view that called it.

---

## Backend — New and Modified Endpoints

### `GET /Category/list` — global category list

No user or association scoping. Returns all active (non-deleted) categories.

```json
[{"id": 1, "name": "Tryggingar", "type": "SHARED"}, ...]
```

Used by the wizard Step 2 to populate category rows.

### `POST /Category` — superadmin only

Creates a global category. Requires `is_superadmin` check.

Body: `{"name": "...", "type": "SHARED|SHARE2|SHARE3|EQUAL"}`

### `PUT /Category/update/{id}` — superadmin only

Updates name and/or type of a global category. Requires `is_superadmin` check.

### `DELETE /Category/delete/{id}` — superadmin only (soft-delete)

Sets `deleted=True`. Requires `is_superadmin` check.

### `PATCH /Category/enable/{id}` — superadmin only

Re-enables a soft-deleted category. Requires `is_superadmin` check.

### `GET /Budget/{user_id}` — unchanged

Returns the active budget with items. Used by wizard to load previous amounts when "copy from previous" is selected.

### `POST /Budget/wizard` — new endpoint

Creates a new budget version with submitted amounts in a single atomic call. Deactivates the previous active budget for the same year.

Request:
```json
{
  "user_id": 1,
  "items": [
    {"category_id": 5, "amount": 450000},
    {"category_id": 6, "amount": 680000}
  ]
}
```

Logic:
1. Resolve association from `user_id` (via `_resolve_assoc`, supports `?as=` for superadmin).
2. Get current year. Find latest budget for association + year.
3. Deactivate all existing budgets for that year (`is_active=False`).
4. Create new `Budget` with `year`, `version = previous_version + 1` (or 1 if none), `is_active=True`.
5. Bulk-create `BudgetItem` rows for each submitted `{category_id, amount}`.
6. Return serialized budget (same shape as `GET /Budget/{user_id}`).

Error responses:
- `400` — missing `user_id` or empty `items`
- `404` — association not found
- `400` — any `category_id` not found in global active categories

### URL routing additions

```python
path('Category/list', CategoryListView.as_view()),
path('Budget/wizard', BudgetWizardView.as_view()),
```

---

## Frontend

### New files

- `HusfelagJS/src/controlers/BudgetWizardPage.js` — full-page 3-step wizard

### Modified files

- `HusfelagJS/src/App.js` — add route `/aaetlun/nyr → BudgetWizardPage`
- `HusfelagJS/src/controlers/BudgetPage.js` — replace create-button API call with navigation to `/aaetlun/nyr`
- `HusfelagJS/src/controlers/SuperAdminPage.js` — add global Categories panel
- `HusfelagJS/src/controlers/Sidebar.js` — remove "Flokkar" link for non-superadmin users
- `HusfelagJS/src/controlers/CategoriesPage.js` — remove or redirect (route no longer shown in sidebar)

---

## Wizard — Step Detail

### State in `BudgetWizardPage`

```
step: 1 | 2 | 3
hasPrevious: boolean          // true if active budget exists for this year or previous year
previousBudget: object | null // loaded on mount via GET /Budget/{user_id}
categories: array             // loaded on mount via GET /Category/list
amounts: { [category_id]: number }  // user-edited amounts
copyMode: boolean             // true = pre-filled from previous, false = blank
loading: boolean
error: string
```

On mount: call `GET /Budget/{user_id}` and `GET /Category/list` in parallel. If a previous budget exists, set `hasPrevious = true` and store it for pre-filling.

### Step 1 — Starting point

**If previous budget exists:**
Two options:
1. "Afrita frá áætlun {year}" — sets `copyMode=true`, pre-fills `amounts` from previous budget items
2. "Byrja frá grunni" — sets `copyMode=false`, all amounts start at 0

**If no previous budget:**
Brief message, "Áfram →" goes directly to Step 2 with blank amounts.

### Step 2 — Set amounts

Table rows: one per active global category (from `GET /Category/list`).

Columns: Flokkur | Tegund | Upphæð á ári (kr.)

- Amount inputs: integers only, min 0
- Live totals panel below the table, updated on every keystroke:
  - One row per type that has total > 0: Sameiginlegt / Hiti / Lóð / Jafnskipt
  - Grand total (Heildartala) always shown
- "Til baka" returns to Step 1 (or exits wizard if no Step 1 was shown)
- "Áfram →" proceeds to Step 3

### Step 3 — Review & confirm

Summary cards, one per type with amount > 0:
- Card shows: type label (colour-coded), category count, total amount
- Grand total row below the cards
- "Til baka" returns to Step 2
- "Staðfesta og virkja áætlun" calls `POST /Budget/wizard`
  - On success: navigate to `/aaetlun` (budget page refreshes with new active budget)
  - On failure: inline error, stay on Step 3

---

## Superadmin — Global Categories Panel

New section in `SuperAdminPage` at `/kerfisstjori`.

Behaviour mirrors the existing `CategoriesPage`:
- Table of all categories (active + collapsed disabled section)
- "Bæta við flokk" inline form: name + type dropdown
- Edit dialog: rename, change type, disable/re-enable
- `is_superadmin` enforced server-side on all write endpoints

The existing `CategoryView` endpoints (`POST /Category`, `PUT /Category/update/{id}`, `DELETE /Category/delete/{id}`, `PATCH /Category/enable/{id}`) get an `is_superadmin` guard added. Association scoping is removed from all of them.

---

## Sidebar Change

`Sidebar.js` currently shows "Flokkar" unconditionally. After this change:
- Hidden for all users (categories are no longer association-managed)
- Superadmin accesses categories via `/kerfisstjori`

The `/flokkar` route remains registered in `App.js` but goes unused. It can be cleaned up in a follow-up.

---

## Error Handling

| Scenario | Where shown | Message |
|---|---|---|
| Category list fails to load | Wizard, above step | "Villa við að sækja flokka. Reyndu aftur." |
| Previous budget fails to load | Wizard, above step | "Villa við að sækja fyrri áætlun." |
| Confirm fails | Step 3, inline | "Villa við að vista áætlun. Reyndu aftur." |
| No categories defined | Step 2, empty state | "Engir flokkar eru skilgreindir. Kerfisstjóri þarf að bæta við flokki." |
