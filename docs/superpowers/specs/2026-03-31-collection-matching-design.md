# Collection Matching — Design Spec

**Date:** 2026-03-31
**Status:** Approved
**Sub-project:** 5 of N (Ledger Foundation → Statement Import → Auto-categorisation → Reporting → Collection Matching)

---

## Overview

Income transactions from apartment payers need to be matched against outstanding monthly collection items. When a bank statement is imported, the system auto-matches income transactions to pending collection items using the payer's kennitala. Unmatched transactions surface on the Innheimta page for manual linking by an admin.

---

## Key Decisions

- **Rolling monthly generation.** Collection items are generated one month at a time by an admin action — not upfront for the whole year. This avoids stale records when payers or budget amounts change mid-year.
- **Payer snapshot at generation time.** The `Collection.payer` is set to whoever holds `is_payer=True` at the moment the items are generated. If the payer changes later, existing PENDING items keep the old payer; new months use the new payer.
- **Matching by kennitala.** Each bank format exposes the payer's kennitala in a specific column. The system extracts it on import and stores it on the transaction. Matching looks up the user by kennitala.
- **Auto-match with manual fallback.** Auto-matching fires on import for all positive transactions with a kennitala present. Unmatched transactions (Íslandsbanki new format, kennitala not found, or no pending collection item) surface on the Innheimta page for manual assignment.
- **Category assignment via existing rules.** Matched transactions are marked RECONCILED. Category assignment is handled by existing auto-categorisation rules (e.g. an "Innheimta" rule). No special income category field is added.
- **No new models.** Two new fields on existing models cover the full design.

---

## Data Model

### `Transaction.payer_kennitala`

```python
payer_kennitala = models.CharField(max_length=20, blank=True)
```

Stores the kennitala extracted from the bank file. Empty string when not available (Íslandsbanki new format). Requires migration.

### `Collection.paid_transaction`

```python
paid_transaction = models.ForeignKey(
    "Transaction", null=True, blank=True,
    on_delete=models.SET_NULL, related_name="collection_payment"
)
```

Links a paid collection item to the transaction that settled it. `null` = unpaid. Requires migration.

---

## Kennitala Extraction per Bank Format

| Bank | Column name |
|---|---|
| Arion | `Kennitala viðtakanda eða greiðanda` |
| Landsbankinn | `Kennitala` |
| Íslandsbanki old | `Kennitala móttakanda` |
| Íslandsbanki new | `""` (not available) |

Each parser in `importers.py` adds `payer_kennitala` to its row output. `ImportConfirmView` populates `Transaction.payer_kennitala` from each row.

---

## Backend

### Modified: `parse_arion`, `parse_landsbankinn`, `parse_islandsbanki` in `importers.py`

Each parser adds `'payer_kennitala'` to its row dict:

```python
'payer_kennitala': str(row.get('Kennitala viðtakanda eða greiðanda') or '').strip(),
```

### Modified: `ImportConfirmView` in `views.py`

After `Transaction.objects.bulk_create(transactions)`, call `_auto_match_collections(created_transactions, association)`.

### New helper: `_auto_match_collections(transactions, association)`

```python
def _auto_match_collections(transactions, association):
    year = None
    to_update_txs = []
    to_update_cols = []
    for tx in transactions:
        if tx.amount <= 0 or not tx.payer_kennitala:
            continue
        try:
            payer = User.objects.get(kennitala=tx.payer_kennitala)
        except User.DoesNotExist:
            continue
        col = Collection.objects.filter(
            budget__association=association,
            budget__year=tx.date.year,
            budget__is_active=True,
            payer=payer,
            month=tx.date.month,
            status=CollectionStatus.PENDING,
            paid_transaction__isnull=True,
        ).first()
        if not col:
            continue
        col.paid_transaction = tx
        col.status = CollectionStatus.PAID
        tx.status = TransactionStatus.RECONCILED
        to_update_cols.append(col)
        to_update_txs.append(tx)
    if to_update_cols:
        Collection.objects.bulk_update(to_update_cols, ["paid_transaction", "status"])
    if to_update_txs:
        Transaction.objects.bulk_update(to_update_txs, ["status"])
```

### New endpoint: `POST /Collection/generate`

Body: `{user_id, month, year}`

- Validates month (1–12) and year.
- Gets active budget for association + year. Returns 404 if none.
- For each active apartment: gets current `is_payer=True` ownership, calculates `amount_shared`, `amount_equal`, and `amount_total` using the same share logic as the existing `CollectionView` (SHARED/SHARE2/SHARE3/EQUAL budget totals × apartment share ÷ 100), creates `Collection` record. Skips if `unique_together` already exists.
- Returns `{"created": N, "skipped": N}`.

### New endpoint: `POST /Collection/match`

Body: `{user_id, collection_id, transaction_id}`

- Validates both belong to the same association.
- Validates collection status is PENDING and transaction amount > 0.
- Sets `Collection.paid_transaction = tx`, `Collection.status = PAID`, `Transaction.status = RECONCILED`.
- Returns updated collection item.

### Modified: `GET /Collection/{user_id}`

Query params: `?month=M&year=Y` — returns stored Collection records for that month plus unmatched income transactions.

`?summary=1` — returns the existing computed-on-the-fly annual/monthly summary per apartment (used by the budget overview page, unchanged).

**Response shape for `?month=M&year=Y`:**

```json
{
  "month": 3,
  "year": 2026,
  "rows": [
    {
      "collection_id": 1,
      "apartment_id": 5,
      "anr": "0101",
      "payer_name": "Jón Jónsson",
      "payer_kennitala": "1234567890",
      "amount_total": "45000.00",
      "status": "PAID",
      "paid_transaction_id": 42,
      "paid_transaction_date": "2026-03-10"
    }
  ],
  "unmatched": [
    {
      "transaction_id": 99,
      "date": "2026-03-12",
      "description": "Húsgjöld mars - Sigríður",
      "amount": "41000.00",
      "payer_kennitala": ""
    }
  ]
}
```

`unmatched` = positive-amount transactions for that month where `status != RECONCILED`, `collection_payment__isnull=True` (not already linked to a collection item), and `bank_account__association = association`.

### New URL patterns in `urls.py`

```python
path("Collection/generate", CollectionGenerateView.as_view(), name="collection-generate"),
path("Collection/match", CollectionMatchView.as_view(), name="collection-match"),
```

The existing `Collection/<int:user_id>` URL is modified in place.

---

## Frontend

### Modified: `HusfelagJS/src/controlers/CollectionPage.js`

**Header row:**
- Left: "Innheimta {year}"
- Right: month `<Select>` (default: current month) + "**+ Búa til [month]**" button. Button disabled and labelled "Til staðar" if collection items already exist for that month.

**Collection table** (replaces computed view):
- Columns: Íbúð | Greiðandi | Upphæð | Staða
- Status badges: `GREITT` (green) shows matched transaction date in secondary text. `ÓGREITT` (amber).
- Totals footer: total amount + "X/N greidd".

**Unmatched transactions section** (shown only when `unmatched.length > 0`):
- Red section heading with count badge.
- Columns: Dags. | Lýsing | Upphæð | Tengja við
- "Tengja við" column: `<Select>` listing open PENDING collection items for that month (`"0103 — Gunnar Magnússon"`). Selecting one immediately calls `POST /Collection/match` and reloads both sections.

**Generate button flow:**
- Click → POST `/Collection/generate` → reload page for selected month.
- On error: show inline Alert.

---

## Error Handling

| Scenario | Response |
|---|---|
| No active budget for year | `POST /Collection/generate` returns 404 |
| Collection item already exists | Skipped silently, counted in `skipped` |
| Transaction already RECONCILED | `POST /Collection/match` returns 400 |
| Collection already PAID | `POST /Collection/match` returns 400 |
| Kennitala not found in User table | Auto-match skips, transaction stays unmatched |

---

## Testing

**`CollectionGenerateViewTest`:**
- Generates correct number of items for active apartments
- Skips existing items (idempotent)
- Returns 404 when no active budget
- Sets payer from current `is_payer=True` ownership at generation time

**`CollectionMatchViewTest`:**
- Manual match sets PAID + RECONCILED correctly
- Returns 400 if collection already PAID
- Returns 403 if collection/transaction belong to different association

**`AutoMatchTest`:**
- Income transaction with matching kennitala → PAID + RECONCILED
- Income transaction with unknown kennitala → stays unmatched
- Expense transaction (negative amount) → ignored
- Íslandsbanki new (empty kennitala) → stays unmatched

**`CollectionViewTest`:**
- `?month=M&year=Y` returns stored records + unmatched transactions
- `?summary=1` returns existing computed summary (regression)

**Importer tests:**
- `parse_arion` extracts `payer_kennitala` from correct column
- `parse_landsbankinn` extracts `payer_kennitala` from `Kennitala` column
- `parse_islandsbanki` old extracts from `Kennitala móttakanda`
- `parse_islandsbanki` new returns empty `payer_kennitala`

---

## Scope Boundary

**In scope:**
- `payer_kennitala` on Transaction, `paid_transaction` on Collection
- Kennitala extraction in all 3 bank parsers
- Auto-matching in ImportConfirmView
- `Collection/generate` and `Collection/match` endpoints
- Updated `Collection` GET with month mode and unmatched list
- CollectionPage.js: month selector, generate button, status table, unmatched section

**Out of scope:**
- Overdue reminders or automated notifications
- Partial payments (a transaction paying less than the full monthly amount)
- PDF invoice generation
- Double-entry journal posting
- Multi-transaction matching (one collection item paid by multiple transactions)
