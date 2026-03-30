# Statement Import — Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Sub-project:** 2 of 4 (Ledger Foundation → Statement Import → Auto-categorisation → Reporting)

---

## Overview

Add bank statement import to Húsfélag. Users upload a CSV or Excel export from their bank, see a preview of what will be imported (with duplicates skipped), and confirm to save the transactions. Three Icelandic banks are supported: Arion banki, Landsbankinn, and Íslandsbanki (auto-detecting old and new/BETA formats).

---

## Key Decisions

- **Named bank parsers, not a generic column mapper.** Bank format logic lives entirely in the backend (`importers.py`). If a bank changes its export format, a backend fix is enough without a frontend deploy.
- **Stateless two-step API.** `POST /Import/preview` parses the file and returns the non-duplicate rows. The frontend holds them in React state. `POST /Import/confirm` receives those rows and bulk-creates transactions. No server-side session or staging table needed.
- **Silent duplicate skip.** A row is a duplicate if a Transaction already exists in the same BankAccount with the same `date`, `amount`, and `description`. Skipped count shown in the preview summary.
- **Íslandsbanki old format has no account number in the file.** User always selects the bank account from the dropdown — no validation against the file. This is acceptable.
- **CSV and Excel auto-detected by file extension.** `.csv` → `csv.DictReader`. `.xlsx` → `openpyxl`.

---

## Bank File Formats

### Arion banki

- **Filename pattern:** `AccountTransactions{account_number}.xlsx` / `.csv`
- **Account number location:** Cell A2 (e.g. `0370-13-037063`)
- **Header row:** 4
- **Data starts:** Row 5
- **Key columns:**

| Column | Field |
|--------|-------|
| `Dagsetning` | `date` — format `DD.MM.YYYY` |
| `Upphæð` | `amount` — Icelandic number format |
| `Skýring` | `description` |
| `Seðilnúmer` | `reference` |

---

### Landsbankinn

- **Filename pattern:** `LandsbankinnExcel{date}.xlsx` / `.csv`
- **Account number location:** Cell A2, embedded in text — pattern `Færslur á reikningi {account_number} {name}` (extract with regex `reikningi\s+([\d\-]+)`)
- **Header row:** 5
- **Data starts:** Row 6
- **Key columns:**

| Column | Field |
|--------|-------|
| `Dags` | `date` — format `DD.MM.YYYY` |
| `Upphæð` | `amount` — Icelandic number format |
| `Texti` | `description` (counterparty name, e.g. "HS Veitur hf.") — fallback to `Skýring greiðslu` if empty |
| `Tnr/Seðilnr.` | `reference` |

---

### Íslandsbanki — new format (BETA)

- **Filename pattern:** `reikningsyfirlit{date_iso}.xlsx` / `.csv` (lowercase)
- **Detection:** Cell A4 == `"Reikningsnúmer"`
- **Account number location:** Cell B4
- **Header row:** 12
- **Data starts:** Row 13
- **Key columns:**

| Column | Field |
|--------|-------|
| `Dagsetning` | `date` — format `DD.MM.YYYY` |
| `Upphæð` | `amount` — may include `kr.` suffix |
| `Mótaðili` | `description` (counterparty name) |
| `Tilvísun` | `reference` |

---

### Íslandsbanki — old format

- **Filename pattern:** `ReikningsYfirlit{date}.xlsx` / `.csv` (capital R)
- **Detection:** Cell A4 != `"Reikningsnúmer"` (fallback when Íslandsbanki is selected)
- **Account number:** Not present in file — user selects bank account manually
- **Header row:** 5
- **Data starts:** Row 6
- **Key columns:**

| Column | Field |
|--------|-------|
| `Dags.` | `date` — format `DD.MM.YYYY` |
| `Upph.ISK` | `amount` — ISK amount (not `Upphæð` which may be foreign currency) |
| `Mótaðili` | `description` (counterparty name) |
| `Tilvísun` | `reference` |

---

## Backend

### New file: `HusfelagPy/associations/importers.py`

```python
BANK_PARSERS = {
    "arion":        parse_arion,
    "landsbankinn": parse_landsbankinn,
    "islandsbanki": parse_islandsbanki,
}

def parse_arion(file_obj, ext) -> list[dict]:
    # Load sheet (openpyxl for xlsx, csv.DictReader for csv)
    # Skip rows 1–3. Row 4 = headers. Data from row 5.
    # Returns list of {date, amount, description, reference}

def parse_landsbankinn(file_obj, ext) -> list[dict]:
    # Skip rows 1–4. Row 5 = headers. Data from row 6.
    # description = Texti if non-empty, else Skýring greiðslu

def parse_islandsbanki(file_obj, ext) -> list[dict]:
    # Auto-detect format by reading cell A4
    # If A4 == "Reikningsnúmer" → new format (headers row 12, data row 13)
    # Else → old format (headers row 5, data row 6, amount from "Upph.ISK")

def parse_icelandic_amount(val) -> Decimal:
    # Strip whitespace, "kr.", "ISK"
    # Remove "." (thousands separator)
    # Replace "," with "." (decimal separator)
    # Return Decimal(cleaned)

def parse_icelandic_date(val) -> date:
    # datetime.strptime(val.strip(), "%d.%m.%Y").date()

def detect_duplicates(rows, bank_account) -> tuple[list[dict], int]:
    # Build a set of (date, amount, description) from existing transactions
    # Filter rows: skip any row whose (date, amount, description) is in the set
    # Return (to_import_rows, skipped_count)
```

### New views in `views.py`

Two separate view classes — mirrors the existing pattern of one class per distinct action.

```python
class ImportPreviewView(APIView):
    def post(self, request):
        """POST /Import/preview — parse file, detect duplicates, return preview."""
        # user_id, bank_account_id, bank from request.data (multipart)
        # file from request.FILES['file']
        # Validate bank in BANK_PARSERS
        # Validate file extension (.csv or .xlsx)
        # Validate bank_account belongs to association
        # Call BANK_PARSERS[bank](file, ext)
        # Call detect_duplicates(rows, bank_account)
        # Return {total_in_file, to_import, skipped_duplicates, rows: [...]}

class ImportConfirmView(APIView):
    def post(self, request):
        """POST /Import/confirm — bulk-create transactions from confirmed rows."""
        # user_id, bank_account_id, rows from request.data (JSON)
        # Validate bank_account belongs to association
        # Transaction.objects.bulk_create([...])
        # Return {created: N}
```

### New URL patterns in `urls.py`

```python
path("Import/preview", ImportPreviewView.as_view(), name="import-preview"),
path("Import/confirm", ImportConfirmView.as_view(), name="import-confirm"),
```

### Error handling

| Scenario | Response |
|---|---|
| Unknown `bank` value | `400` — "Óþekktur banki." |
| File extension not `.csv` or `.xlsx` | `400` — "Aðeins .csv og .xlsx skrár eru studdar." |
| Parse error (wrong format for selected bank) | `400` — "Gat ekki lesið skrána. Athugaðu að rétt bankaskrá sé valin." |
| `bank_account` doesn't belong to association | `403` — "Aðgangur hafnaður." |
| No transactions found in file | `200` — `{total_in_file: 0, to_import: 0, skipped_duplicates: 0, rows: []}` |

---

## Frontend

### Modified file: `TransactionsPage.js`

Two new components added to the file:

**`ImportForm`**
- Bank account dropdown (populated from existing `bankAccounts` state)
- Bank selector: Arion banki / Landsbankinn / Íslandsbanki
- Drag-or-click file upload area (`.csv, .xlsx` only)
- "Greina skrá →" button — calls `POST /Import/preview` as multipart form, transitions to `ImportPreview`

**`ImportPreview`**
- Summary cards: "X færslur til að flytja inn" (green) + "Y þegar til (sleppt)" (grey)
- Table showing first 10 rows (date, description, amount)
- "Til baka" — returns to `ImportForm` (retains selections)
- "Staðfesta innflutning (X)" — calls `POST /Import/confirm`, reloads transactions on success

**Import state machine in `TransactionsPage`:**
- `idle` — no import in progress
- `uploading` — preview API call in flight (spinner)
- `preview` — preview data shown, awaiting confirm
- `importing` — confirm API call in flight (spinner)

Opening the import form collapses the add-transaction form (and vice versa) — only one inline panel open at a time.

**Header change:** Add "+ Innflutningur" button alongside the existing "+ Færsla" button. On click, toggles import form open/closed.

---

## Serializer / Response shape

`POST /Import/preview` response:

```json
{
  "total_in_file": 50,
  "to_import": 47,
  "skipped_duplicates": 3,
  "rows": [
    {"date": "2026-03-15", "amount": "-245000.00", "description": "HS Veitur hf.", "reference": "280226"},
    ...
  ]
}
```

`POST /Import/confirm` response:

```json
{"created": 47}
```

---

## Testing

- `ImporterTest` — unit tests for each parser function using fixture files (small synthetic Excel/CSV samples):
  - Arion: parse 3 rows, verify date/amount/description/reference
  - Landsbankinn: parse 3 rows; test `Texti` fallback to `Skýring greiðslu`
  - Íslandsbanki new: parse 3 rows, verify auto-detection
  - Íslandsbanki old: parse 3 rows, verify auto-detection and `Upph.ISK` column
  - `parse_icelandic_amount`: test "−100,00", "-2.805.615 kr.", "455,00", "-300 kr."
- `ImportViewTest` — integration tests:
  - Preview with Arion file → correct counts
  - Preview skips duplicates → `skipped_duplicates` count correct
  - Preview with unknown bank → 400
  - Preview with wrong extension → 400
  - Confirm bulk-creates transactions → verify count in DB
  - Confirm with wrong bank account → 403

---

## Scope Boundary

**In scope:**
- `importers.py` with parsers for Arion, Landsbankinn, Íslandsbanki (old + new)
- `parse_icelandic_amount`, `parse_icelandic_date` utilities
- `detect_duplicates` (date + amount + description match)
- `ImportView` with preview and confirm actions
- `ImportForm` and `ImportPreview` components in `TransactionsPage.js`
- Fixture files for parser unit tests

**Dependencies:** `openpyxl` must be present in `pyproject.toml` (for `.xlsx` parsing). If not already installed, add it.

**Out of scope (future sub-projects):**
- Auto-categorisation on import (sub-project 3)
- Auto-detecting bank from filename
- Validating file account number against selected bank account
- Editing individual rows in the preview
- Other banks (Kvika, Indó, sparisjóðir)
