# Manual Collection Match Design

**Date:** 2026-04-02

## Goal

Allow a user to manually link a PENDING collection item to a payment transaction from any month — including early (e.g. December payment for a January collection) or late payments.

## Background

The existing auto-match runs on import and re-categorisation, linking payments to collection items by payer kennitala within the same month. The `/Collection/match` endpoint already accepts cross-month matches — the gap is purely in the UI, which only surfaces unmatched transactions from the current month.

## Architecture

Two changes: one new backend endpoint, one new frontend dialog.

---

## Backend

### New endpoint: `GET /Collection/candidates/<collection_id>`

**Purpose:** Return all positive, unreconciled transactions for the payer of a given collection item, from any month/year.

**Auth:** `user_id` via query param; supports `?as=<id>` superadmin impersonation (same `_resolve_assoc` pattern as all other collection endpoints).

**Logic:**
1. Fetch `Collection` by `collection_id`, verify it belongs to the resolved association
2. Get `payer.kennitala` from the collection item
3. Query `Transaction` where:
   - `bank_account__association = association`
   - `payer_kennitala = payer.kennitala`
   - `amount > 0`
   - `status != RECONCILED`
   - Not already linked to another collection: `collection_set__isnull=True` (i.e. no collection has `paid_transaction = tx`)
4. Return list sorted by `date DESC`

**Response shape:**
```json
[
  {
    "transaction_id": 42,
    "date": "2025-12-28",
    "description": "Húsgjöld",
    "amount": "17337.00",
    "bank_account_name": "Veltureikningur"
  }
]
```

**Errors:**
- `404` if collection not found or belongs to different association
- `400` if collection has no payer (payer is null)

**URL registration:** Add to `config/urls.py` alongside existing collection routes.

---

## Frontend

### CollectionPage — PENDING row action

In the action column (`TableCell` at the end of each row), PENDING rows currently show nothing (only PAID rows show the unlink icon). Add a link icon button (`AddLinkIcon` or `LinkIcon`) to PENDING rows:

```jsx
{row.status === 'PENDING' && (
  <Tooltip title="Tengja greiðslu">
    <IconButton size="small" onClick={() => setMatchTarget(row)}>
      <LinkIcon fontSize="small" sx={{ color: '#bbb' }} />
    </IconButton>
  </Tooltip>
)}
```

State: `const [matchTarget, setMatchTarget] = useState(null)` — holds the collection row being matched, or `null` when closed.

### ManualMatchDialog component

Props: `open`, `onClose`, `row` (collection row), `userId`, `assocParam`, `onMatched`

**Behaviour:**
- On open: fetch `GET /Collection/candidates/<row.collection_id>?user_id=<userId><assocParam>` and store results in local state
- Show loading spinner while fetching
- Render candidate transactions as a selectable list (radio-style highlight on click)
- Each row: date (left), description (centre), bank account name (small, secondary), amount (right, `AmountCell` style)
- Empty state: `"Engar ósamræmdar greiðslur fundust fyrir þennan greiðanda"`
- Footer: `"Hætta við"` (ghostButtonSx) + `"Tengja"` (primaryButtonSx, disabled until a row is selected)
- On confirm: call `handleMatch(row.collection_id, selectedTransactionId)` via `onMatched` callback, close dialog

**Dialog size:** `maxWidth="sm"`, `fullWidth`

**Title:** `Tengja greiðslu við {row.payer_name}`

---

## Data Flow

```
User clicks link icon on PENDING row
  → ManualMatchDialog opens, fetches /Collection/candidates/<id>
  → Backend returns unreconciled transactions for that payer (any month)
  → User selects a transaction row
  → User clicks "Tengja"
  → handleMatch(collection_id, transaction_id) calls existing POST /Collection/match
  → Collection marked PAID, transaction marked RECONCILED
  → Page reloads
```

---

## Files Changed

| File | Change |
|------|--------|
| `HusfelagPy/associations/views.py` | Add `CollectionCandidatesView` |
| `HusfelagPy/config/urls.py` | Register `Collection/candidates/<int:collection_id>` |
| `HusfelagJS/src/controlers/CollectionPage.js` | Add link icon on PENDING rows, add `ManualMatchDialog` component, add `matchTarget` state |

---

## Out of Scope

- Matching a collection to a negative (outgoing) transaction — rejected at the existing `/Collection/match` endpoint level
- Matching one transaction to multiple collection items
- Any change to the auto-match logic
