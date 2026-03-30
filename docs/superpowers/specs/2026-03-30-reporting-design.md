# Reporting — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Sub-project:** 4 of 4 (Ledger Foundation → Statement Import → Auto-categorisation → Reporting)

---

## Overview

A Reporting page gives association admins a full annual financial overview: income vs. expenses broken down by category, budget vs. actual comparison for expenses, a monthly bar chart for cash flow, and a drill-down modal to see category totals for any individual month.

---

## Key Decisions

- **No new models.** All data is derived at query time from existing Transaction, BudgetItem, and Category models.
- **Income has no budget comparison.** Budget items represent planned expenses only. Income rows show actual amounts only.
- **Uncategorised transactions are shown separately.** Both income and expense sections include an "Óflokkað" row so nothing is hidden from the report.
- **Monthly chart uses grouped bars.** Income (green) and expenses (red) sit side by side per month — not stacked.
- **Month drill-down shows category totals, not individual transactions.** Same income/expense structure as the main page, condensed into a modal.
- **Income vs. expense split is by amount sign.** Positive amount = income; negative amount = expense. This is the established Transaction model convention. Status (IMPORTED/CATEGORISED/RECONCILED) is irrelevant to the split — all statuses are included.
- **Default year = current year; `?year=` overrides.** Year selector on the frontend drives this param.

---

## Data Model

No new models or migrations required.

---

## Backend

### New endpoint: `GET /Report/<user_id>`

Optional query param: `?year=YYYY` (defaults to current year). Supports `?as=<assoc_id>` for superadmin impersonation (via existing `_resolve_assoc` helper).

**Response shape:**

```json
{
  "year": 2026,
  "income": [
    {"category_id": 1, "category_name": "Innheimta", "actual": "4800000.00"}
  ],
  "income_uncategorised": "120000.00",
  "expenses": [
    {
      "category_id": 3,
      "category_name": "Hitaveita",
      "budgeted": "1200000.00",
      "actual": "1050000.00"
    }
  ],
  "expenses_uncategorised": "85000.00",
  "monthly": [
    {"month": 1, "income": "400000.00", "expenses": "320000.00"},
    {"month": 2, "income": "400000.00", "expenses": "280000.00"}
  ]
}
```

**Aggregation logic:**

- `income`: sum of positive transaction amounts grouped by category, for transactions in `year` where `bank_account__association = association` and `category` is not null.
- `income_uncategorised`: sum of positive transaction amounts where `category` is null.
- `expenses`: absolute value of negative transaction amounts grouped by category, joined with BudgetItem for the active budget of `year` (left join — categories with transactions but no budget item get `budgeted=0`; budget items with no transactions get `actual=0`).
- `expenses_uncategorised`: absolute value of negative transactions where `category` is null.
- `monthly`: per month 1–12, sum of positive amounts as `income` and absolute value of negative amounts as `expenses`. Months with no transactions return `{"month": N, "income": "0.00", "expenses": "0.00"}`.

### New view: `ReportView` in `views.py`

Single `get` method. Uses `_resolve_assoc` for association resolution. Aggregation done with Django ORM `values()` + `annotate(Sum(...))`.

### New URL pattern in `urls.py`

```python
path("Report/<int:user_id>", ReportView.as_view(), name="report"),
```

---

## Frontend

### New file: `HusfelagJS/src/controlers/ReportPage.js`

**Layout (top to bottom):**

1. **Year selector** — top right, `<select>` with available years (current year default). On change, re-fetches report data.
2. **Monthly bar chart** — 12 months, green bar (Tekjur) + red bar (Gjöld) side by side per month using Recharts `BarChart`. Future months where both values are 0 rendered in grey. Click a month bar → opens drill-down modal. Built using `recharts` library.
3. **TEKJUR section** — green heading. Table: Flokkur | Raun. One row per income category. "Óflokkað" row (italic, grey) if `income_uncategorised > 0`. "Samtals tekjur" totals row.
4. **GJÖLD section** — red heading. Table: Flokkur | Áætlun | Raun | Frávik | %. One row per expense category. Frávik: positive (under budget) shown green, negative (over budget) shown red, zero shown grey. "Óflokkað" row with no Áætlun/Frávik/% values (shown as —). "Samtals gjöld" totals row.
5. **Niðurstaða row** — dark blue background (`#1D366F`), white text. Shows `Tekjur − Gjöld`. Positive net = teal (`#80cbc4`); negative net = red (`#ef9a9a`).

**Month drill-down modal (`Dialog`):**

- Title: Icelandic month name + year (e.g. "Mars 2026")
- TEKJUR section: category totals for that month (income)
- GJÖLD section: category totals for that month (expenses, no budget comparison)
- Niðurstaða row for that month
- Data source: derived from the `monthly` array + a second fetch to `GET /Report/<user_id>?year=YYYY&month=M` — **or** computed client-side if the monthly breakdown by category is included in the main response (see note below)

> **Note on monthly drill-down data:** The main `/Report` response includes per-month totals only, not per-category per-month. The modal fetches a separate endpoint `GET /Report/<user_id>?year=YYYY&month=M` which returns the same shape as the main response but filtered to a single month.

### Modified: `Sidebar.js`

Add **Skýrslur** nav entry between Flokkunarreglur and Innheimta:
```js
{ path: '/skyrslur', label: 'Skýrslur', icon: <BarChartOutlinedIcon sx={{ fontSize: 20 }} /> }
```

### Modified: `App.js`

Add import and route:
```jsx
import ReportPage from './controlers/ReportPage'
// ...
<Route path="/skyrslur" element={<ReportPage />} />
```

---

## URL Patterns

| Method | URL | Description |
|---|---|---|
| `GET` | `/Report/<user_id>` | Full year report (default: current year) |
| `GET` | `/Report/<user_id>?year=2025` | Specific year |
| `GET` | `/Report/<user_id>?year=2026&month=3` | Single month drill-down |

Both endpoints share the same `ReportView.get()` method; the presence of `month` param switches to single-month mode.

---

## Recharts Dependency

Add `recharts` to the frontend if not already present:
```bash
npm install recharts
```

Use `BarChart`, `Bar`, `XAxis`, `YAxis`, `Tooltip`, `ResponsiveContainer` from recharts.

---

## Error Handling

| Scenario | Response |
|---|---|
| User not found | `404` |
| No budget for selected year | Return report with `budgeted: "0.00"` for all expense categories |
| No transactions for selected year | Return report with all zeros |

---

## Testing

**`ReportViewTest`:**
- Year with income + expense transactions returns correct totals
- Expense category with budget returns correct `budgeted` and `actual`
- Expense category with no matching budget item returns `budgeted: "0.00"`
- Budget item with no matching transactions returns `actual: "0.00"`
- Uncategorised transactions appear in `income_uncategorised` / `expenses_uncategorised`
- `?year=` param selects correct year
- `?month=` param returns single-month breakdown
- No transactions returns all-zero response (no 500)
- Superadmin `?as=` param resolves correct association

---

## Scope Boundary

**In scope:**
- `ReportView` with year and month modes
- `ReportPage.js` with chart, income/expense tables, drill-down modal
- Recharts dependency
- Sidebar and route updates

**Out of scope:**
- PDF/CSV export
- Confidence scores or per-apartment expense breakdown
- Budget editing from the report page
- Comparison between years
