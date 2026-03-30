# Statement Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bank statement import (Arion, Landsbankinn, Íslandsbanki) to Húsfélag — upload CSV/Excel → preview → confirm → transactions saved.

**Architecture:** All parsing lives in a new `importers.py` module. `ImportPreviewView` parses the uploaded file, validates the account number, skips duplicates, and returns a preview. `ImportConfirmView` bulk-creates the confirmed rows. The frontend adds `ImportForm` and `ImportPreview` components to the existing `TransactionsPage`.

**Tech Stack:** Django 4.1, DRF 3.14, openpyxl (new), React 17, MUI v5.

---

## File Map

| File | Change |
|------|--------|
| `HusfelagPy/pyproject.toml` | Add `openpyxl` dependency |
| `HusfelagPy/associations/importers.py` | **New** — all parsers, utilities, detect_duplicates, BANK_PARSERS |
| `HusfelagPy/associations/views.py` | Add `ImportPreviewView`, `ImportConfirmView`; add `_normalize_acct` helper |
| `HusfelagPy/associations/urls.py` | Register 2 new URL patterns |
| `HusfelagPy/associations/tests.py` | Add `ImporterTest` and `ImportViewTest` |
| `HusfelagJS/src/controlers/TransactionsPage.js` | Add `ImportForm`, `ImportPreview`, import state machine, "+ Innflutningur" button |

---

## Task 1: Add openpyxl dependency

**Files:**
- Modify: `HusfelagPy/pyproject.toml`

- [ ] **Step 1: Add openpyxl to pyproject.toml**

In `HusfelagPy/pyproject.toml`, add to `dependencies`:

```toml
    "openpyxl>=3.1",
```

The full dependencies list should now include:

```toml
dependencies = [
    "django==4.1.*",
    "djangorestframework==3.14.*",
    "drf-spectacular>=0.27",
    "django-cors-headers>=4.3",
    "django-environ>=0.11",
    "psycopg2-binary>=2.9",
    "celery==5.3.4",
    "redis>=5.0",
    "gunicorn>=21.2",
    "uvicorn[standard]>=0.27",
    "requests (>=2.31)",
    "python-jose[cryptography] (>=3.3)",
    "beautifulsoup4 (>=4.12)",
    "openpyxl>=3.1",
]
```

- [ ] **Step 2: Install the dependency**

```bash
cd HusfelagPy && poetry add openpyxl
```

Expected: openpyxl resolves and installs.

- [ ] **Step 3: Verify the import works**

```bash
cd HusfelagPy && poetry run python3 -c "import openpyxl; print(openpyxl.__version__)"
```

Expected: prints a version number like `3.1.x`.

- [ ] **Step 4: Commit**

```bash
git add HusfelagPy/pyproject.toml HusfelagPy/poetry.lock
git -c commit.gpgsign=false commit -m "chore: add openpyxl dependency"
```

---

## Task 2: `importers.py` — utilities and Arion parser

**Files:**
- Create: `HusfelagPy/associations/importers.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `HusfelagPy/associations/tests.py` (after the last test class):

```python
class ImporterTest(TestCase):
    """Unit tests for importers.py — no HTTP, no DB (except detect_duplicates)."""

    def test_parse_icelandic_amount_comma_decimal(self):
        from associations.importers import parse_icelandic_amount
        from decimal import Decimal
        self.assertEqual(parse_icelandic_amount("-100,00"), Decimal("-100.00"))
        self.assertEqual(parse_icelandic_amount("455,00"), Decimal("455.00"))
        self.assertEqual(parse_icelandic_amount("-351.427,00"), Decimal("-351427.00"))

    def test_parse_icelandic_amount_kr_suffix(self):
        from associations.importers import parse_icelandic_amount
        from decimal import Decimal
        self.assertEqual(parse_icelandic_amount("-300 kr."), Decimal("-300"))
        self.assertEqual(parse_icelandic_amount("-2.805.615 kr."), Decimal("-2805615"))
        self.assertEqual(parse_icelandic_amount("1.135.983 kr."), Decimal("1135983"))

    def test_parse_icelandic_amount_float(self):
        from associations.importers import parse_icelandic_amount
        from decimal import Decimal
        self.assertEqual(parse_icelandic_amount(-100.0), Decimal("-100"))
        self.assertEqual(parse_icelandic_amount(245000.0), Decimal("245000"))

    def test_parse_arion_csv(self):
        from associations.importers import parse_arion
        from decimal import Decimal
        import datetime
        from django.core.files.uploadedfile import SimpleUploadedFile
        csv_bytes = (
            ";;\n"
            "0370-13-037063;IS87 0370 1303 7063 0507 7253 59\n"
            ";;\n"
            "Dagsetning;Upphæð;Staða;Mynt;Skýring;Seðilnúmer;Tilvísun;Texti\n"
            "15.03.2026;-245.000,00;;;HS Veitur hf.;280226;;HS Veitur hf.\n"
            "10.03.2026;320.000,00;;;Innborgun;310326;;Innborgun\n"
        ).encode("utf-8")
        f = SimpleUploadedFile("AccountTransactions0370.csv", csv_bytes, content_type="text/csv")
        result = parse_arion(f, "csv")
        self.assertEqual(result["file_account_number"], "0370-13-037063")
        self.assertEqual(len(result["rows"]), 2)
        self.assertEqual(result["rows"][0]["date"], datetime.date(2026, 3, 15))
        self.assertEqual(result["rows"][0]["amount"], Decimal("-245000.00"))
        self.assertEqual(result["rows"][0]["description"], "HS Veitur hf.")
        self.assertEqual(result["rows"][0]["reference"], "280226")
        self.assertEqual(result["rows"][1]["amount"], Decimal("320000.00"))

    def test_parse_arion_xlsx(self):
        from associations.importers import parse_arion
        from decimal import Decimal
        import datetime
        import openpyxl
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Heiti", "IBAN númer"])
        ws.append(["0370-13-037063", "IS87 0370 1303 7063 0507 7253 59"])
        ws.append([None])
        ws.append(["Dagsetning", "Upphæð", "Staða", "Mynt", "Skýring", "Seðilnúmer"])
        ws.append(["15.03.2026", -245000.0, None, "ISK", "HS Veitur hf.", "280226"])
        buf = BytesIO()
        wb.save(buf)
        f = SimpleUploadedFile("AccountTransactions0370.xlsx", buf.getvalue(),
                               content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        result = parse_arion(f, "xlsx")
        self.assertEqual(result["file_account_number"], "0370-13-037063")
        self.assertEqual(len(result["rows"]), 1)
        self.assertEqual(result["rows"][0]["date"], datetime.date(2026, 3, 15))
        self.assertEqual(result["rows"][0]["amount"], Decimal("-245000"))
        self.assertEqual(result["rows"][0]["description"], "HS Veitur hf.")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImporterTest -v 2
```

Expected: FAIL — `ModuleNotFoundError: No module named 'associations.importers'`

- [ ] **Step 3: Create `importers.py` with utilities and Arion parser**

Create `HusfelagPy/associations/importers.py`:

```python
import csv
import io
import re
import datetime
from decimal import Decimal, InvalidOperation

import openpyxl


def parse_icelandic_amount(val) -> Decimal:
    """Parse Icelandic-formatted number to Decimal.
    Icelandic convention: '.' = thousands separator, ',' = decimal separator.
    Handles: '-100,00', '-351.427,00', '-300 kr.', '-2.805.615 kr.', -100.0 (float).
    """
    if isinstance(val, (int, float)):
        return Decimal(str(val))
    s = str(val).strip()
    # Remove currency suffixes and whitespace
    s = re.sub(r'\s*(kr\.?|ISK)\s*', '', s, flags=re.IGNORECASE).strip()
    # Normalise unicode minus '−' to ASCII '-'
    s = s.replace('\u2212', '-')
    # Remove thousand separator dots and convert decimal comma
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    else:
        s = s.replace('.', '')
    return Decimal(s)


def parse_icelandic_date(val) -> datetime.date:
    """Parse date value. Handles datetime objects (from openpyxl) and DD.MM.YYYY strings."""
    if isinstance(val, datetime.datetime):
        return val.date()
    if isinstance(val, datetime.date):
        return val
    return datetime.datetime.strptime(str(val).strip(), "%d.%m.%Y").date()


def _load_sheet(file_obj, ext):
    """Load file into a list of rows (each row is a list of cell values).
    ext must be 'csv' or 'xlsx'.
    """
    if ext == 'csv':
        raw = file_obj.read()
        if isinstance(raw, bytes):
            raw = raw.decode('utf-8-sig')  # handle BOM
        # Detect delimiter from first non-blank line
        first_data = next((line for line in raw.splitlines() if line.strip()), raw[:512])
        try:
            dialect = csv.Sniffer().sniff(first_data, delimiters=',;\t')
        except csv.Error:
            dialect = csv.excel  # fallback: comma
        return [row for row in csv.reader(io.StringIO(raw), dialect)]
    else:
        wb = openpyxl.load_workbook(io.BytesIO(file_obj.read()), data_only=True)
        ws = wb.active
        return [[cell.value for cell in row] for row in ws.iter_rows()]


def parse_arion(file_obj, ext) -> dict:
    """Parse Arion banki statement.
    Row layout (1-indexed): 1=title, 2=account number in col A, 3=empty, 4=headers, 5+=data.
    Returns {"file_account_number": str | None, "rows": list[dict]}
    """
    rows = _load_sheet(file_obj, ext)
    if len(rows) < 5:
        return {"file_account_number": None, "rows": []}

    file_account_number = str(rows[1][0]).strip() if rows[1] and rows[1][0] else None
    headers = [str(h).strip() if h is not None else '' for h in rows[3]]

    result = []
    for raw_row in rows[4:]:
        if not any(v for v in raw_row if v is not None):
            continue
        row = dict(zip(headers, raw_row))
        try:
            result.append({
                'date':        parse_icelandic_date(row['Dagsetning']),
                'amount':      parse_icelandic_amount(row['Upphæð']),
                'description': str(row.get('Skýring') or row.get('Texti') or '').strip(),
                'reference':   str(row.get('Seðilnúmer') or '').strip(),
            })
        except (KeyError, ValueError, InvalidOperation):
            continue

    return {"file_account_number": file_account_number, "rows": result}


BANK_PARSERS = {
    "arion": parse_arion,
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImporterTest.test_parse_icelandic_amount_comma_decimal associations.tests.ImporterTest.test_parse_icelandic_amount_kr_suffix associations.tests.ImporterTest.test_parse_icelandic_amount_float associations.tests.ImporterTest.test_parse_arion_csv associations.tests.ImporterTest.test_parse_arion_xlsx -v 2
```

Expected: `Ran 5 tests ... OK`

- [ ] **Step 5: Commit**

```bash
git add HusfelagPy/associations/importers.py HusfelagPy/associations/tests.py
git -c commit.gpgsign=false commit -m "feat: importers.py — utilities and Arion parser"
```

---

## Task 3: `importers.py` — Landsbankinn, Íslandsbanki, and detect_duplicates

**Files:**
- Modify: `HusfelagPy/associations/importers.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Append to the `ImporterTest` class in `HusfelagPy/associations/tests.py`:

```python
    def test_parse_landsbankinn_csv(self):
        from associations.importers import parse_landsbankinn
        from decimal import Decimal
        import datetime
        from django.core.files.uploadedfile import SimpleUploadedFile
        csv_bytes = (
            "Netbanki fyrirtækja-Reikningsyfirlit\n"
            "Færslur á reikningi 0133-26-019111 Veltureikningur fyrirtækja\n"
            "Allar færslur. Tímabil 28.3.2025 - 29.3.2026\n"
            "\n"
            "Dags;Vaxtad;Banki;RB. Nr.;Fl.;Tnr/Seðilnr.;Tilvísun;Textalykill;Skýring greiðslu;Kennitala;Texti;Upphæð;Staða\n"
            "24.03.2026;24.03;0536;^h71;01;0010426;2405862319;Félagaþjónusta;Félagaþjónusta;240586-2319;Hilmar Þór Birgisson;24.484;242.562\n"
            "23.03.2026;23.03;0133;KR41;02;0002012;2312080590;Rafmagn og hiti;Rafmagn og hiti;431208-0590;HS Veitur hf.;-1.948;218.078\n"
        ).encode("utf-8")
        f = SimpleUploadedFile("LandsbankinnExcel20260330.csv", csv_bytes)
        result = parse_landsbankinn(f, "csv")
        self.assertEqual(result["file_account_number"], "0133-26-019111")
        self.assertEqual(len(result["rows"]), 2)
        self.assertEqual(result["rows"][0]["date"], datetime.date(2026, 3, 24))
        self.assertEqual(result["rows"][0]["description"], "Hilmar Þór Birgisson")
        self.assertEqual(result["rows"][0]["reference"], "0010426")
        self.assertEqual(result["rows"][1]["amount"], Decimal("-1948"))
        # When Texti is empty, falls back to Skýring greiðslu
        csv_no_texti = (
            "Netbanki\n"
            "Færslur á reikningi 0133-26-019111 Reikningur\n"
            "\n"
            "\n"
            "Dags;Vaxtad;Banki;RB. Nr.;Fl.;Tnr/Seðilnr.;Tilvísun;Textalykill;Skýring greiðslu;Kennitala;Texti;Upphæð;Staða\n"
            "01.03.2026;;;;;\t;;Kostnaður;HS Veitur hf.;;;-500;\n"
        ).encode("utf-8")
        f2 = SimpleUploadedFile("LandsbankinnExcel20260301.csv", csv_no_texti)
        result2 = parse_landsbankinn(f2, "csv")
        self.assertEqual(result2["rows"][0]["description"], "HS Veitur hf.")

    def test_parse_islandsbanki_new_format(self):
        from associations.importers import parse_islandsbanki
        from decimal import Decimal
        import datetime, openpyxl
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Eigandi", "Þórunnarstræti 132, húsfélag"])  # row 1
        ws.append(["Kennitala", "650585-1279"])                   # row 2
        ws.append(["Reikningur", "Húsfélagar. Aðalreik"])         # row 3
        ws.append(["Reikningsnúmer", "0565-26-565121"])            # row 4 — detection key
        ws.append(["Staða", "189.153 kr."])                        # row 5
        ws.append([None])                                           # row 6
        ws.append(["Dagsetning frá", "28.02.2026"])                # row 7
        ws.append(["Dagsetning til", "30.03.2026"])                # row 8
        ws.append(["Yfirlit sótt", "2026-03-30 09:28:35"])         # row 9
        ws.append([None])                                           # row 10
        ws.append([None])                                           # row 11
        ws.append(["Dagsetning", "Mótaðili", "Tilvísun", "Texti", "Upphæð", "Staða"])  # row 12
        ws.append(["18.03.2026", "LukTom píparar ehf.", "280226", "Kostnaður", "-300 kr.", "189.153 kr."])  # row 13
        ws.append(["17.03.2026", "Þjónustugjald innheimtuþjónusta", None, "Innheimtuþjónusta", "-919 kr.", "189.453 kr."])  # row 14
        buf = BytesIO()
        wb.save(buf)
        f = SimpleUploadedFile("reikningsyfirlit2026-03-30.xlsx", buf.getvalue())
        result = parse_islandsbanki(f, "xlsx")
        self.assertEqual(result["file_account_number"], "0565-26-565121")
        self.assertEqual(len(result["rows"]), 2)
        self.assertEqual(result["rows"][0]["date"], datetime.date(2026, 3, 18))
        self.assertEqual(result["rows"][0]["description"], "LukTom píparar ehf.")
        self.assertEqual(result["rows"][0]["amount"], Decimal("-300"))
        self.assertEqual(result["rows"][0]["reference"], "280226")

    def test_parse_islandsbanki_old_format(self):
        from associations.importers import parse_islandsbanki
        from decimal import Decimal
        import datetime, openpyxl
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append(["Íslandsbanki"])                           # row 1
        ws.append(["Reikningsyfirlit"])                        # row 2
        ws.append(["Tímabil: mars 2026"])                      # row 3
        ws.append(["Allar færslur"])                           # row 4 — NOT "Reikningsnúmer"
        ws.append(["Dags.", "Seðilnr.", "Tegund", "Mótaðili", "Tilvísun",
                   "Upplýsingar um færslu", "Aðrar upplýsingar", "Færslulykill",
                   "Textalykill", "Upplýsingar", "Kennitala móttakanda", "Söluaðili",
                   "Innlausnarbanki", "Vaxtadagsetning", "Bókunardagur greiðslu",
                   "Upphæð", "Upph.ISK", "Staða"])             # row 5 — headers
        ws.append(["18.03.2026", "280226", "Kostnaður", "LukTom píparar ehf.", "5603061130",
                   None, None, None,
                   "Kostnaður", "Innheimtukrafa", "6812221110", None,
                   None, None, None,
                   "-300", "-300", "189.153"])                 # row 6
        ws.append(["17.03.2026", "030326", "Millifært", "Elva Sturludóttir", "1607735109",
                   None, None, None,
                   "Millifært", "Innborgun", "1607735109", None,
                   None, None, None,
                   "1.135.983", "1.135.983", "5.785.724"])     # row 7
        buf = BytesIO()
        wb.save(buf)
        f = SimpleUploadedFile("ReikningsYfirlit20260330.xlsx", buf.getvalue())
        result = parse_islandsbanki(f, "xlsx")
        self.assertIsNone(result["file_account_number"])
        self.assertEqual(len(result["rows"]), 2)
        self.assertEqual(result["rows"][0]["date"], datetime.date(2026, 3, 18))
        self.assertEqual(result["rows"][0]["description"], "LukTom píparar ehf.")
        self.assertEqual(result["rows"][0]["amount"], Decimal("-300"))
        self.assertEqual(result["rows"][1]["amount"], Decimal("1135983"))

    def test_detect_duplicates(self):
        from associations.importers import detect_duplicates
        from associations.models import (
            Association, AssociationAccess, AssociationRole,
            AccountingKey, AccountingKeyType, BankAccount, Transaction
        )
        import datetime
        from decimal import Decimal
        assoc = Association.objects.create(
            ssn="9900000009", name="Dup Test HF", address="Gata 1",
            postal_code="101", city="Reykjavík"
        )
        asset_key = AccountingKey.objects.create(
            number=9750, name="Test", type=AccountingKeyType.ASSET
        )
        bank_account = BankAccount.objects.create(
            association=assoc, name="Test", account_number="0133-26-000001",
            asset_account=asset_key
        )
        Transaction.objects.create(
            bank_account=bank_account, date=datetime.date(2026, 3, 15),
            amount=Decimal("-245000.00"), description="HS Veitur hf.", status="IMPORTED"
        )
        rows = [
            {"date": datetime.date(2026, 3, 15), "amount": Decimal("-245000.00"),
             "description": "HS Veitur hf.", "reference": "280226"},   # duplicate
            {"date": datetime.date(2026, 3, 10), "amount": Decimal("-180000.00"),
             "description": "VÍS tryggingar", "reference": "290226"},  # new
        ]
        to_import, skipped = detect_duplicates(rows, bank_account)
        self.assertEqual(skipped, 1)
        self.assertEqual(len(to_import), 1)
        self.assertEqual(to_import[0]["description"], "VÍS tryggingar")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImporterTest.test_parse_landsbankinn_csv associations.tests.ImporterTest.test_parse_islandsbanki_new_format associations.tests.ImporterTest.test_parse_islandsbanki_old_format associations.tests.ImporterTest.test_detect_duplicates -v 2
```

Expected: FAIL — `ImportError: cannot import name 'parse_landsbankinn'`

- [ ] **Step 3: Add Landsbankinn parser to `importers.py`**

Add after `parse_arion` in `HusfelagPy/associations/importers.py`:

```python
def parse_landsbankinn(file_obj, ext) -> dict:
    """Parse Landsbankinn statement.
    Row layout (1-indexed): 1=title, 2=account line, 3=date range, 4=empty, 5=headers, 6+=data.
    Account number extracted from row 2 via regex.
    Returns {"file_account_number": str | None, "rows": list[dict]}
    """
    rows = _load_sheet(file_obj, ext)
    if len(rows) < 6:
        return {"file_account_number": None, "rows": []}

    # Extract account number from row 2 (index 1), e.g. "Færslur á reikningi 0133-26-019111 ..."
    account_match = re.search(r'reikningi\s+([\d\-]+)', str(rows[1][0] or ''))
    file_account_number = account_match.group(1) if account_match else None

    headers = [str(h).strip() if h is not None else '' for h in rows[4]]

    result = []
    for raw_row in rows[5:]:
        if not any(v for v in raw_row if v is not None):
            continue
        row = dict(zip(headers, raw_row))
        try:
            texti = str(row.get('Texti') or '').strip()
            description = texti if texti else str(row.get('Skýring greiðslu') or '').strip()
            result.append({
                'date':        parse_icelandic_date(row['Dags']),
                'amount':      parse_icelandic_amount(row['Upphæð']),
                'description': description,
                'reference':   str(row.get('Tnr/Seðilnr.') or '').strip(),
            })
        except (KeyError, ValueError, InvalidOperation):
            continue

    return {"file_account_number": file_account_number, "rows": result}
```

- [ ] **Step 4: Add Íslandsbanki parser to `importers.py`**

Add after `parse_landsbankinn`:

```python
def parse_islandsbanki(file_obj, ext) -> dict:
    """Parse Íslandsbanki statement — auto-detects new (BETA) vs old format.
    New format detected by: cell A4 == "Reikningsnúmer"
      Account number in B4, headers on row 12, data from row 13.
    Old format (fallback):
      No account number. Headers on row 5, data from row 6. Amount from 'Upph.ISK'.
    Returns {"file_account_number": str | None, "rows": list[dict]}
    """
    rows = _load_sheet(file_obj, ext)
    if len(rows) < 6:
        return {"file_account_number": None, "rows": []}

    # Detect format: new if A4 (index 3, col 0) == "Reikningsnúmer"
    a4 = str(rows[3][0]).strip() if len(rows) > 3 and rows[3] and rows[3][0] else ''
    is_new = (a4 == "Reikningsnúmer")

    if is_new:
        file_account_number = str(rows[3][1]).strip() if rows[3][1] else None
        if len(rows) < 13:
            return {"file_account_number": file_account_number, "rows": []}
        headers = [str(h).strip() if h is not None else '' for h in rows[11]]
        data_rows = rows[12:]
        amount_col = 'Upphæð'
        description_col = 'Mótaðili'
        date_col = 'Dagsetning'
    else:
        file_account_number = None
        headers = [str(h).strip() if h is not None else '' for h in rows[4]]
        data_rows = rows[5:]
        amount_col = 'Upph.ISK'
        description_col = 'Mótaðili'
        date_col = 'Dags.'

    result = []
    for raw_row in data_rows:
        if not any(v for v in raw_row if v is not None):
            continue
        row = dict(zip(headers, raw_row))
        try:
            result.append({
                'date':        parse_icelandic_date(row[date_col]),
                'amount':      parse_icelandic_amount(row[amount_col]),
                'description': str(row.get(description_col) or '').strip(),
                'reference':   str(row.get('Tilvísun') or '').strip(),
            })
        except (KeyError, ValueError, InvalidOperation):
            continue

    return {"file_account_number": file_account_number, "rows": result}
```

- [ ] **Step 5: Add `detect_duplicates` to `importers.py`**

Add after `parse_islandsbanki`:

```python
def detect_duplicates(rows, bank_account):
    """Return (to_import_rows, skipped_count).
    A row is a duplicate if same (date, amount, description) already exists in bank_account.
    """
    from .models import Transaction
    existing = set(
        Transaction.objects.filter(bank_account=bank_account)
        .values_list('date', 'amount', 'description')
    )
    to_import = []
    skipped = 0
    for row in rows:
        if (row['date'], row['amount'], row['description']) in existing:
            skipped += 1
        else:
            to_import.append(row)
    return to_import, skipped
```

- [ ] **Step 6: Update `BANK_PARSERS` in `importers.py`**

Replace the existing `BANK_PARSERS` dict:

```python
BANK_PARSERS = {
    "arion":        parse_arion,
    "landsbankinn": parse_landsbankinn,
    "islandsbanki": parse_islandsbanki,
}
```

- [ ] **Step 7: Run new tests to verify they pass**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImporterTest -v 2
```

Expected: `Ran 9 tests ... OK`

- [ ] **Step 8: Run all tests to check no regressions**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations -v 2
```

Expected: All pass.

- [ ] **Step 9: Commit**

```bash
git add HusfelagPy/associations/importers.py HusfelagPy/associations/tests.py
git -c commit.gpgsign=false commit -m "feat: Landsbankinn, Íslandsbanki parsers and detect_duplicates"
```

---

## Task 4: `ImportPreviewView` + URL + tests

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Add to `HusfelagPy/associations/tests.py`:

```python
class ImportViewTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(kennitala="6600000001", name="Formaður")
        self.other_user = User.objects.create(kennitala="6600000002", name="Annar")
        self.association = Association.objects.create(
            ssn="6600000009", name="Import Test HF", address="Gata 1",
            postal_code="101", city="Reykjavík"
        )
        self.other_association = Association.objects.create(
            ssn="7700000009", name="Önnur HF", address="Gata 2",
            postal_code="101", city="Reykjavík"
        )
        from associations.models import AssociationAccess, AssociationRole, AccountingKey, AccountingKeyType
        AssociationAccess.objects.create(
            user=self.user, association=self.association,
            role=AssociationRole.CHAIR, active=True
        )
        AssociationAccess.objects.create(
            user=self.other_user, association=self.other_association,
            role=AssociationRole.CHAIR, active=True
        )
        self.asset_key = AccountingKey.objects.create(
            number=9760, name="Test Reikningur", type=AccountingKeyType.ASSET
        )
        from associations.models import BankAccount
        self.bank_account = BankAccount.objects.create(
            association=self.association,
            name="Rekstrarreikningur",
            account_number="0370-13-037063",
            asset_account=self.asset_key,
        )

    def _arion_csv(self, account_number="0370-13-037063", rows=None):
        """Build a minimal Arion CSV file as bytes."""
        from django.core.files.uploadedfile import SimpleUploadedFile
        if rows is None:
            rows = [
                "15.03.2026;-245.000,00;;;HS Veitur hf.;280226;;HS Veitur hf.",
                "10.03.2026;-180.000,00;;;VÍS tryggingar;290226;;VÍS tryggingar",
            ]
        lines = [
            "Heiti;IBAN",
            f"{account_number};IS87...",
            ";;",
            "Dagsetning;Upphæð;Staða;Mynt;Skýring;Seðilnúmer;Tilvísun;Texti",
        ] + rows
        return SimpleUploadedFile(
            "AccountTransactions0370.csv",
            "\n".join(lines).encode("utf-8"),
            content_type="text/csv",
        )

    def test_preview_returns_correct_counts(self):
        f = self._arion_csv()
        resp = self.client.post("/Import/preview", data={
            "user_id": self.user.id,
            "bank_account_id": self.bank_account.id,
            "bank": "arion",
            "file": f,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_in_file"], 2)
        self.assertEqual(data["to_import"], 2)
        self.assertEqual(data["skipped_duplicates"], 0)
        self.assertEqual(len(data["rows"]), 2)
        self.assertEqual(data["rows"][0]["description"], "HS Veitur hf.")

    def test_preview_skips_duplicates(self):
        from associations.models import Transaction
        import datetime
        from decimal import Decimal
        Transaction.objects.create(
            bank_account=self.bank_account, date=datetime.date(2026, 3, 15),
            amount=Decimal("-245000.00"), description="HS Veitur hf.", status="IMPORTED"
        )
        f = self._arion_csv()
        resp = self.client.post("/Import/preview", data={
            "user_id": self.user.id,
            "bank_account_id": self.bank_account.id,
            "bank": "arion",
            "file": f,
        })
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["total_in_file"], 2)
        self.assertEqual(data["to_import"], 1)
        self.assertEqual(data["skipped_duplicates"], 1)

    def test_preview_account_number_mismatch_returns_400(self):
        f = self._arion_csv(account_number="0370-13-999999")  # wrong account
        resp = self.client.post("/Import/preview", data={
            "user_id": self.user.id,
            "bank_account_id": self.bank_account.id,
            "bank": "arion",
            "file": f,
        })
        self.assertEqual(resp.status_code, 400)
        self.assertIn("öðrum bankareikningi", resp.json()["detail"])

    def test_preview_unknown_bank_returns_400(self):
        f = self._arion_csv()
        resp = self.client.post("/Import/preview", data={
            "user_id": self.user.id,
            "bank_account_id": self.bank_account.id,
            "bank": "unknown_bank",
            "file": f,
        })
        self.assertEqual(resp.status_code, 400)

    def test_preview_wrong_extension_returns_400(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        f = SimpleUploadedFile("statement.pdf", b"not a spreadsheet", content_type="application/pdf")
        resp = self.client.post("/Import/preview", data={
            "user_id": self.user.id,
            "bank_account_id": self.bank_account.id,
            "bank": "arion",
            "file": f,
        })
        self.assertEqual(resp.status_code, 400)

    def test_preview_wrong_bank_account_returns_403(self):
        from associations.models import BankAccount
        other_bank_account = BankAccount.objects.create(
            association=self.other_association,
            name="Önnur", account_number="0370-13-000000",
            asset_account=self.asset_key,
        )
        f = self._arion_csv(account_number="0370-13-000000")
        resp = self.client.post("/Import/preview", data={
            "user_id": self.user.id,
            "bank_account_id": other_bank_account.id,
            "bank": "arion",
            "file": f,
        })
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImportViewTest -v 2
```

Expected: FAIL — all return 404 (URL not yet registered).

- [ ] **Step 3: Add `ImportPreviewView` to `views.py`**

Add to the imports at the top of `HusfelagPy/associations/views.py`:

```python
from .importers import BANK_PARSERS, detect_duplicates
```

Add this function near the other helpers (after `_resolve_assoc`):

```python
def _normalize_acct(s):
    """Strip hyphens and spaces from an account number string for comparison."""
    return re.sub(r'[\s\-]', '', str(s or ''))
```

Add the view class (place it after `TransactionView`):

```python
class ImportPreviewView(APIView):
    def post(self, request):
        """POST /Import/preview — parse uploaded statement, skip duplicates, return preview."""
        user_id = request.data.get("user_id")
        bank_account_id = request.data.get("bank_account_id")
        bank = str(request.data.get("bank") or "").strip().lower()
        file = request.FILES.get("file")

        if not all([user_id, bank_account_id, bank, file]):
            return Response(
                {"detail": "user_id, bank_account_id, bank og file eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if bank not in BANK_PARSERS:
            return Response({"detail": "Óþekktur banki."}, status=status.HTTP_400_BAD_REQUEST)

        ext = file.name.rsplit('.', 1)[-1].lower() if '.' in file.name else ''
        if ext not in ('csv', 'xlsx'):
            return Response(
                {"detail": "Aðeins .csv og .xlsx skrár eru studdar."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            bank_account = BankAccount.objects.get(
                id=bank_account_id, deleted=False, association=association
            )
        except BankAccount.DoesNotExist:
            return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)

        try:
            result = BANK_PARSERS[bank](file, ext)
        except Exception:
            return Response(
                {"detail": "Gat ekki lesið skrána. Athugaðu að rétt bankaskrá sé valin."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        file_acct = result.get("file_account_number")
        if file_acct is not None:
            if _normalize_acct(file_acct) != _normalize_acct(bank_account.account_number):
                return Response(
                    {"detail": "Skráin tilheyrir öðrum bankareikningi."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        all_rows = result["rows"]
        to_import_rows, skipped = detect_duplicates(all_rows, bank_account)

        serialized = [
            {
                "date":        r["date"].isoformat(),
                "amount":      str(r["amount"]),
                "description": r["description"],
                "reference":   r["reference"],
            }
            for r in to_import_rows
        ]

        return Response({
            "total_in_file":     len(all_rows),
            "to_import":         len(to_import_rows),
            "skipped_duplicates": skipped,
            "rows":              serialized,
        })
```

- [ ] **Step 4: Register the URL in `urls.py`**

In `HusfelagPy/associations/urls.py`, add `ImportPreviewView` to the import line:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    AccountingKeyListView, AccountingKeyView,
    BankAccountView, TransactionView,
    ImportPreviewView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)
```

Add to `urlpatterns` (before the Budget patterns):

```python
    path("Import/preview", ImportPreviewView.as_view(), name="import-preview"),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImportViewTest.test_preview_returns_correct_counts associations.tests.ImportViewTest.test_preview_skips_duplicates associations.tests.ImportViewTest.test_preview_account_number_mismatch_returns_400 associations.tests.ImportViewTest.test_preview_unknown_bank_returns_400 associations.tests.ImportViewTest.test_preview_wrong_extension_returns_400 associations.tests.ImportViewTest.test_preview_wrong_bank_account_returns_403 -v 2
```

Expected: `Ran 6 tests ... OK`

- [ ] **Step 6: Run all tests**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations -v 2
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests.py
git -c commit.gpgsign=false commit -m "feat: ImportPreviewView — parse, deduplicate, validate account number"
```

---

## Task 5: `ImportConfirmView` + URL + tests

**Files:**
- Modify: `HusfelagPy/associations/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Modify: `HusfelagPy/associations/tests.py`

- [ ] **Step 1: Write the failing tests**

Append to `ImportViewTest` in `HusfelagPy/associations/tests.py`:

```python
    def test_confirm_bulk_creates_transactions(self):
        from associations.models import Transaction
        rows = [
            {"date": "2026-03-15", "amount": "-245000.00", "description": "HS Veitur hf.", "reference": "280226"},
            {"date": "2026-03-10", "amount": "-180000.00", "description": "VÍS tryggingar", "reference": "290226"},
        ]
        resp = self.client.post(
            "/Import/confirm",
            data=json.dumps({
                "user_id": self.user.id,
                "bank_account_id": self.bank_account.id,
                "rows": rows,
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.json()["created"], 2)
        self.assertEqual(Transaction.objects.filter(bank_account=self.bank_account).count(), 2)
        tx = Transaction.objects.get(description="HS Veitur hf.")
        from decimal import Decimal
        self.assertEqual(tx.amount, Decimal("-245000.00"))
        self.assertEqual(tx.status, "IMPORTED")

    def test_confirm_wrong_bank_account_returns_403(self):
        from associations.models import BankAccount
        other_ba = BankAccount.objects.create(
            association=self.other_association,
            name="Önnur", account_number="0370-13-000000",
            asset_account=self.asset_key,
        )
        resp = self.client.post(
            "/Import/confirm",
            data=json.dumps({
                "user_id": self.user.id,
                "bank_account_id": other_ba.id,
                "rows": [],
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 403)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImportViewTest.test_confirm_bulk_creates_transactions associations.tests.ImportViewTest.test_confirm_wrong_bank_account_returns_403 -v 2
```

Expected: FAIL — 404 (URL not registered).

- [ ] **Step 3: Add `ImportConfirmView` to `views.py`**

Add after `ImportPreviewView`:

```python
class ImportConfirmView(APIView):
    def post(self, request):
        """POST /Import/confirm — bulk-create transactions from confirmed rows."""
        user_id = request.data.get("user_id")
        bank_account_id = request.data.get("bank_account_id")
        rows = request.data.get("rows", [])

        if not user_id or not bank_account_id:
            return Response(
                {"detail": "user_id og bank_account_id eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        association = _resolve_assoc(user_id, request)
        if not association:
            return Response({"detail": "Association not found."}, status=status.HTTP_404_NOT_FOUND)

        try:
            bank_account = BankAccount.objects.get(
                id=bank_account_id, deleted=False, association=association
            )
        except BankAccount.DoesNotExist:
            return Response({"detail": "Aðgangi hafnað."}, status=status.HTTP_403_FORBIDDEN)

        transactions = []
        for row in rows:
            try:
                transactions.append(Transaction(
                    bank_account=bank_account,
                    date=datetime.date.fromisoformat(row["date"]),
                    amount=Decimal(str(row["amount"])),
                    description=str(row.get("description") or ""),
                    reference=str(row.get("reference") or ""),
                    status=TransactionStatus.IMPORTED,
                ))
            except (KeyError, ValueError, Exception):
                continue

        Transaction.objects.bulk_create(transactions)
        return Response({"created": len(transactions)}, status=status.HTTP_201_CREATED)
```

- [ ] **Step 4: Register the URL in `urls.py`**

Update the import in `HusfelagPy/associations/urls.py`:

```python
from .views import (
    AssociationView, AssociationLookupView, AssociationRoleView, AssociationListView,
    AdminAssociationView, ApartmentView, ApartmentOwnerView, OwnerView,
    CategoryView, CategoryListView,
    AccountingKeyListView, AccountingKeyView,
    BankAccountView, TransactionView,
    ImportPreviewView, ImportConfirmView,
    BudgetView, BudgetItemView, BudgetWizardView, CollectionView,
    ApartmentImportSourcesView, ApartmentImportPreviewView, ApartmentImportConfirmView,
)
```

Add to `urlpatterns` after `Import/preview`:

```python
    path("Import/confirm", ImportConfirmView.as_view(), name="import-confirm"),
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations.tests.ImportViewTest -v 2
```

Expected: `Ran 8 tests ... OK`

- [ ] **Step 6: Run all tests**

```bash
cd HusfelagPy && poetry run python3 manage.py test associations -v 2
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add HusfelagPy/associations/views.py HusfelagPy/associations/urls.py HusfelagPy/associations/tests.py
git -c commit.gpgsign=false commit -m "feat: ImportConfirmView — bulk-create transactions"
```

---

## Task 6: Frontend — ImportForm and ImportPreview in TransactionsPage.js

**Files:**
- Modify: `HusfelagJS/src/controlers/TransactionsPage.js`

- [ ] **Step 1: Read the current file**

Read `HusfelagJS/src/controlers/TransactionsPage.js` to locate:
1. The `loadAll` function (to call after import)
2. The `showForm` state and the "+ Færsla" button in the header
3. The `AddTransactionForm` component (to use as a structural reference)

- [ ] **Step 2: Add import state to `TransactionsPage`**

In the `TransactionsPage` function, after the existing state declarations, add:

```jsx
const [showImport, setShowImport] = useState(false);
const [importPreview, setImportPreview] = useState(null); // null | {total_in_file, to_import, skipped_duplicates, rows}
const [importBankAccountId, setImportBankAccountId] = useState('');
const [importBank, setImportBank] = useState('arion');
const [importError, setImportError] = useState('');
const [importUploading, setImportUploading] = useState(false);
const [importConfirming, setImportConfirming] = useState(false);
```

- [ ] **Step 3: Add "+ Innflutningur" button to the header**

Locate the header `Box` that contains the year `Select` and the "+ Færsla" `Button`. Add the import button alongside it. The full header buttons box should become:

```jsx
<Box sx={{ display: 'flex', gap: 1 }}>
    <FormControl size="small">
        <Select value={year} onChange={e => setYear(e.target.value)}>
            {yearOptions.map(y => <MenuItem key={y} value={y}>{y}</MenuItem>)}
        </Select>
    </FormControl>
    <Button
        variant="outlined" color="secondary"
        onClick={() => { setShowImport(v => !v); setShowForm(false); setImportPreview(null); setImportError(''); }}
    >
        {showImport ? 'Loka' : '+ Innflutningur'}
    </Button>
    <Button
        variant="contained" color="secondary" sx={{ color: '#fff' }}
        onClick={() => { setShowForm(v => !v); setShowImport(false); }}
    >
        {showForm ? 'Loka' : '+ Færsla'}
    </Button>
</Box>
```

- [ ] **Step 4: Add import panel below the header**

After the existing `{showForm && <AddTransactionForm ... />}` block, add:

```jsx
{showImport && !importPreview && (
    <ImportForm
        userId={user.id}
        assocParam={assocParam}
        bankAccounts={bankAccounts}
        importBankAccountId={importBankAccountId}
        setImportBankAccountId={setImportBankAccountId}
        importBank={importBank}
        setImportBank={setImportBank}
        uploading={importUploading}
        setUploading={setImportUploading}
        error={importError}
        setError={setImportError}
        onPreviewReady={(preview) => setImportPreview(preview)}
    />
)}
{showImport && importPreview && (
    <ImportPreview
        preview={importPreview}
        userId={user.id}
        assocParam={assocParam}
        bankAccountId={importBankAccountId}
        confirming={importConfirming}
        setConfirming={setImportConfirming}
        error={importError}
        setError={setImportError}
        onBack={() => setImportPreview(null)}
        onDone={() => {
            setShowImport(false);
            setImportPreview(null);
            setImportBankAccountId('');
            loadAll();
        }}
    />
)}
```

- [ ] **Step 5: Add the `ImportForm` component**

Add this component before `export default TransactionsPage` in the file:

```jsx
const BANK_OPTIONS = [
    { value: 'arion',        label: 'Arion banki' },
    { value: 'landsbankinn', label: 'Landsbankinn' },
    { value: 'islandsbanki', label: 'Íslandsbanki' },
];

function ImportForm({
    userId, assocParam, bankAccounts,
    importBankAccountId, setImportBankAccountId,
    importBank, setImportBank,
    uploading, setUploading, error, setError,
    onPreviewReady,
}) {
    const [file, setFile] = useState(null);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = React.useRef();

    const isValid = importBankAccountId && importBank && file;

    const handleFile = (f) => {
        const ext = f.name.split('.').pop().toLowerCase();
        if (!['csv', 'xlsx'].includes(ext)) {
            setError('Aðeins .csv og .xlsx skrár eru studdar.');
            return;
        }
        setError('');
        setFile(f);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    };

    const handleSubmit = async () => {
        setError('');
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('user_id', userId);
            formData.append('bank_account_id', importBankAccountId);
            formData.append('bank', importBank);
            formData.append('file', file);
            const sep = assocParam ? '&' : '?';
            const url = `${API_URL}/Import/preview${assocParam}${sep}t=${Date.now()}`;
            const resp = await fetch(`${API_URL}/Import/preview`, {
                method: 'POST',
                body: formData,
            });
            const data = await resp.json();
            if (resp.ok) {
                onPreviewReady(data);
            } else {
                setError(data.detail || 'Villa við lestur skráar.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setUploading(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, display: 'flex', flexDirection: 'column', gap: 2, maxWidth: 520 }}>
            <Typography variant="subtitle2">Flytja inn bankayfirliti</Typography>
            <FormControl size="small" fullWidth>
                <InputLabel>Bankareikningur</InputLabel>
                <Select value={importBankAccountId} label="Bankareikningur"
                    onChange={e => setImportBankAccountId(e.target.value)}>
                    <MenuItem value=""><em>Veldu reikning</em></MenuItem>
                    {bankAccounts.map(b => (
                        <MenuItem key={b.id} value={b.id}>{b.name}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <FormControl size="small" fullWidth>
                <InputLabel>Banki</InputLabel>
                <Select value={importBank} label="Banki" onChange={e => setImportBank(e.target.value)}>
                    {BANK_OPTIONS.map(o => (
                        <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <Box
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                    border: `2px dashed ${dragOver ? '#08C076' : '#ddd'}`,
                    borderRadius: 1, p: 3, textAlign: 'center',
                    cursor: 'pointer', color: 'text.secondary',
                    transition: 'border-color 0.2s',
                    '&:hover': { borderColor: '#08C076' },
                }}
            >
                <input
                    ref={fileInputRef} type="file" accept=".csv,.xlsx" hidden
                    onChange={e => e.target.files[0] && handleFile(e.target.files[0])}
                />
                {file
                    ? <Typography variant="body2" color="success.main">{file.name}</Typography>
                    : <Typography variant="body2">Dragðu skrá hingað eða <span style={{ color: '#08C076' }}>veldu skrá</span><br /><small>.csv eða .xlsx</small></Typography>
                }
            </Box>
            {error && <Alert severity="error">{error}</Alert>}
            <Button
                variant="contained" color="secondary" sx={{ color: '#fff', alignSelf: 'flex-start' }}
                disabled={!isValid || uploading} onClick={handleSubmit}
            >
                {uploading ? <CircularProgress size={20} color="inherit" /> : 'Greina skrá →'}
            </Button>
        </Paper>
    );
}
```

- [ ] **Step 6: Add the `ImportPreview` component**

Add after `ImportForm`:

```jsx
function ImportPreview({
    preview, userId, assocParam, bankAccountId,
    confirming, setConfirming, error, setError,
    onBack, onDone,
}) {
    const handleConfirm = async () => {
        setError('');
        setConfirming(true);
        try {
            const resp = await fetch(`${API_URL}/Import/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    bank_account_id: bankAccountId,
                    rows: preview.rows,
                }),
            });
            const data = await resp.json();
            if (resp.ok) {
                onDone();
            } else {
                setError(data.detail || 'Villa við innflutning.');
            }
        } catch {
            setError('Tenging við þjón mistókst.');
        } finally {
            setConfirming(false);
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 3, maxWidth: 640 }}>
            <Typography variant="subtitle2" sx={{ mb: 2 }}>Yfirlit innflutnings — staðfesta?</Typography>
            <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                <Box sx={{ flex: 1, bgcolor: '#f0f9f4', borderRadius: 1, p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" color="success.main" fontWeight={600}>{preview.to_import}</Typography>
                    <Typography variant="caption" color="text.secondary">Færslur til að flytja inn</Typography>
                </Box>
                <Box sx={{ flex: 1, bgcolor: '#f5f5f5', borderRadius: 1, p: 1.5, textAlign: 'center' }}>
                    <Typography variant="h5" color="text.disabled" fontWeight={600}>{preview.skipped_duplicates}</Typography>
                    <Typography variant="caption" color="text.secondary">Þegar til (sleppt)</Typography>
                </Box>
            </Box>
            <Table size="small" sx={{ mb: 2 }}>
                <TableHead>
                    <TableRow sx={{ '& th': { fontWeight: 500, color: 'text.secondary' } }}>
                        <TableCell>Dagsetning</TableCell>
                        <TableCell>Lýsing</TableCell>
                        <TableCell align="right">Upphæð</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {preview.rows.slice(0, 10).map((row, i) => {
                        const amt = parseFloat(row.amount);
                        return (
                            <TableRow key={i}>
                                <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>{row.date}</TableCell>
                                <TableCell>{row.description}</TableCell>
                                <TableCell align="right" sx={{
                                    fontFamily: 'monospace',
                                    color: amt >= 0 ? 'success.main' : 'error.main',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {amt >= 0 ? '+' : ''}{fmtAmount(amt)} kr.
                                </TableCell>
                            </TableRow>
                        );
                    })}
                    {preview.rows.length > 10 && (
                        <TableRow>
                            <TableCell colSpan={3} sx={{ color: 'text.disabled', fontStyle: 'italic' }}>
                                … {preview.rows.length - 10} færslur til viðbótar
                            </TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button onClick={onBack} disabled={confirming}>Til baka</Button>
                <Button
                    variant="contained" color="secondary" sx={{ color: '#fff' }}
                    disabled={preview.to_import === 0 || confirming} onClick={handleConfirm}
                >
                    {confirming
                        ? <CircularProgress size={18} color="inherit" />
                        : `Staðfesta innflutning (${preview.to_import})`}
                </Button>
            </Box>
        </Paper>
    );
}
```

- [ ] **Step 7: Fix the `ImportForm` fetch URL (copy/paste error in Step 5)**

In the `handleSubmit` function of `ImportForm`, there are two lines that build a URL — remove the stale `url` variable that's never used. The fetch call should simply be:

```jsx
const resp = await fetch(`${API_URL}/Import/preview`, {
    method: 'POST',
    body: formData,
});
```

Remove these two lines:
```jsx
const sep = assocParam ? '&' : '?';
const url = `${API_URL}/Import/preview${assocParam}${sep}t=${Date.now()}`;
```

- [ ] **Step 8: Manually test in browser**

1. Navigate to `/faerslur`
2. Click "+ Innflutningur" — verify the import form appears and "+ Færsla" collapses
3. Select a bank account and bank, pick an Arion CSV or Excel file
4. Click "Greina skrá →" — verify the preview panel shows counts and rows
5. Click "Til baka" — verify you return to the upload form
6. Click "Greina skrá →" again, then "Staðfesta innflutning" — verify transactions appear in the list
7. Import the same file again — verify preview shows the correct `skipped_duplicates` count

- [ ] **Step 9: Commit**

```bash
git add HusfelagJS/src/controlers/TransactionsPage.js
git -c commit.gpgsign=false commit -m "feat: statement import UI — ImportForm and ImportPreview in TransactionsPage"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task |
|---|---|
| `importers.py` with parsers for Arion, Landsbankinn, Íslandsbanki (old + new) | Tasks 2–3 |
| `parse_icelandic_amount`, `parse_icelandic_date` utilities | Task 2 |
| `detect_duplicates` (date + amount + description) | Task 3 |
| Account number validation (Arion, Landsbankinn, Íslandsbanki new) | Task 4 step 3 |
| Íslandsbanki old — `file_account_number = None`, no validation | Task 3 step 4, Task 4 test |
| `ImportPreviewView` + `/Import/preview` URL | Task 4 |
| `ImportConfirmView` + `/Import/confirm` URL | Task 5 |
| `openpyxl` dependency | Task 1 |
| `ImportForm` component in TransactionsPage.js | Task 6 step 5 |
| `ImportPreview` component in TransactionsPage.js | Task 6 step 6 |
| "+ Innflutningur" button | Task 6 step 3 |
| Opening import collapses add-transaction form | Task 6 step 3 |
| CSV + Excel auto-detect by extension | Task 2 step 3 (`_load_sheet`) |
| Silent duplicate skip | Task 3 step 5 + Task 4 tests |
| Preview shows counts + first 10 rows | Task 6 step 6 |
| "Til baka" returns to upload form | Task 6 step 6 |
| Error: unknown bank → 400 | Task 4 step 3 |
| Error: wrong extension → 400 | Task 4 step 3 |
| Error: account mismatch → 400 | Task 4 step 3 |
| Error: wrong bank_account → 403 | Task 4 step 3 |
| Confirm disabled when `to_import === 0` | Task 6 step 6 |

All spec requirements covered. No placeholders found.
