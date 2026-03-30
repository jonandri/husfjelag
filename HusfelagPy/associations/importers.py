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
    file_obj.seek(0)  # ensure we read from the start regardless of prior reads
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
