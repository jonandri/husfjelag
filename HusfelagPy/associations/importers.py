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


_ICELANDIC_MONTHS = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'maí': 5, 'jún': 6,
    'júl': 7, 'ág': 8, 'sep': 9, 'okt': 10, 'nóv': 11, 'des': 12,
}


def parse_icelandic_date(val) -> datetime.date:
    """Parse date value. Handles datetime objects (from openpyxl), DD.MM.YYYY strings,
    and Icelandic month-name format like '1. jan. 2026'."""
    if isinstance(val, datetime.datetime):
        return val.date()
    if isinstance(val, datetime.date):
        return val
    s = str(val).strip()
    # Try Icelandic named-month format: "1. jan. 2026" or "1. jan 2026"
    m = re.match(r'^(\d{1,2})\.\s+([a-záðéíóúýþæö]+)\.?\s+(\d{4})$', s, re.IGNORECASE)
    if m:
        day, month_str, year = int(m.group(1)), m.group(2).lower()[:3], int(m.group(3))
        month = _ICELANDIC_MONTHS.get(month_str)
        if month:
            return datetime.date(year, month, day)
    return datetime.datetime.strptime(s, "%d.%m.%Y").date()


def _load_sheet(file_obj, ext):
    """Load file into a list of rows (each row is a list of cell values).
    ext must be 'csv' or 'xlsx'.
    """
    file_obj.seek(0)  # ensure we read from the start regardless of prior reads
    if ext == 'csv':
        raw = file_obj.read()
        if isinstance(raw, bytes):
            raw = raw.decode('utf-8-sig')  # handle BOM
        # Detect delimiter: try each non-blank line until sniff succeeds
        dialect = csv.excel  # fallback: comma
        for line in raw.splitlines():
            if line.strip():
                try:
                    dialect = csv.Sniffer().sniff(line, delimiters=',;\t')
                    break
                except csv.Error:
                    continue
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
                'date':            parse_icelandic_date(row['Dagsetning']),
                'amount':          parse_icelandic_amount(row['Upphæð']),
                'description':     str(row.get('Skýring') or row.get('Texti') or '').strip(),
                'reference':       str(row.get('Seðilnúmer') or '').strip(),
                'payer_kennitala': str(row.get('Kennitala viðtakanda eða greiðanda') or '').strip(),
            })
        except (KeyError, ValueError, InvalidOperation):
            continue

    return {"file_account_number": file_account_number, "rows": result}


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
                'date':            parse_icelandic_date(row['Dags']),
                'amount':          parse_icelandic_amount(row['Upphæð']),
                'description':     description,
                'reference':       str(row.get('Tnr/Seðilnr.') or '').strip(),
                'payer_kennitala': str(row.get('Kennitala') or '').strip(),
            })
        except (KeyError, ValueError, InvalidOperation):
            continue

    return {"file_account_number": file_account_number, "rows": result}


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
        file_account_number = str(rows[3][1]).strip() if len(rows[3]) > 1 and rows[3][1] else None
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

    kennitala_col = '' if is_new else 'Kennitala móttakanda'

    result = []
    for raw_row in data_rows:
        if not any(v for v in raw_row if v is not None):
            continue
        row = dict(zip(headers, raw_row))
        try:
            result.append({
                'date':            parse_icelandic_date(row[date_col]),
                'amount':          parse_icelandic_amount(row[amount_col]),
                'description':     str(row.get(description_col) or '').strip(),
                'reference':       str(row.get('Tilvísun') or '').strip(),
                'payer_kennitala': str(row.get(kennitala_col) or '').strip() if kennitala_col else '',
            })
        except (KeyError, ValueError, InvalidOperation):
            continue

    return {"file_account_number": file_account_number, "rows": result}


def detect_bank(file_obj, ext) -> dict:
    """Detect which bank a statement file belongs to by inspecting its structure.
    Returns {"bank": str, "file_account_number": str | None} or {"bank": None, "file_account_number": None}.
    """
    try:
        rows = _load_sheet(file_obj, ext)
    except Exception:
        return {"bank": None, "file_account_number": None}

    def _headers(row_index):
        if len(rows) <= row_index:
            return set()
        return {str(h).strip() for h in rows[row_index] if h is not None}

    # Íslandsbanki new format: A4 == "Reikningsnúmer"
    if len(rows) > 3 and rows[3] and str(rows[3][0]).strip() == "Reikningsnúmer":
        acct = str(rows[3][1]).strip() if len(rows[3]) > 1 and rows[3][1] else None
        return {"bank": "islandsbanki", "file_account_number": acct}

    # Íslandsbanki old format: row 5 headers contain 'Upph.ISK'
    if "Upph.ISK" in _headers(4):
        return {"bank": "islandsbanki", "file_account_number": None}

    # Arion: row 4 headers contain 'Dagsetning' and 'Upphæð'
    h4 = _headers(3)
    if "Dagsetning" in h4 and "Upphæð" in h4:
        acct = str(rows[1][0]).strip() if len(rows) > 1 and rows[1] and rows[1][0] else None
        return {"bank": "arion", "file_account_number": acct}

    # Landsbankinn: row 5 headers contain 'Dags' and 'Upphæð'
    h5 = _headers(4)
    if "Dags" in h5 and "Upphæð" in h5:
        acct_match = re.search(r'reikningi\s+([\d\-]+)', str(rows[1][0] or '')) if len(rows) > 1 and rows[1] else None
        acct = acct_match.group(1) if acct_match else None
        return {"bank": "landsbankinn", "file_account_number": acct}

    return {"bank": None, "file_account_number": None}


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


BANK_PARSERS = {
    "arion":        parse_arion,
    "landsbankinn": parse_landsbankinn,
    "islandsbanki": parse_islandsbanki,
}
