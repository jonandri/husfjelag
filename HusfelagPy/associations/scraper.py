"""
Scraper for Skatturinn company registry.
Fetches association info by SSN (kennitala) from:
  https://www.skatturinn.is/fyrirtaekjaskra/leit/kennitala/{ssn}
"""
import re
import requests
from bs4 import BeautifulSoup


SKATTURINN_URL = "https://www.skatturinn.is/fyrirtaekjaskra/leit/kennitala/{ssn}"


def lookup_association(ssn: str) -> dict | None:
    """
    Scrape skatturinn.is for the given SSN.
    Returns a dict with {ssn, name, address, postal_code, city}
    or None if not found.
    """
    url = SKATTURINN_URL.format(ssn=ssn)
    try:
        resp = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
    except requests.RequestException:
        return None

    if resp.status_code != 200:
        return None

    soup = BeautifulSoup(resp.content, "html.parser")

    # Company name is in the <h1> tag as "Name (ssn)"
    h1 = soup.find("h1")
    if not h1:
        return None

    h1_text = h1.get_text(strip=True)

    # Validate: h1 must contain the SSN we looked up
    if ssn not in h1_text:
        return None

    # Strip trailing "(ssn)" from name
    name = re.sub(r"\s*\(\d+\)\s*$", "", h1_text).strip()

    # Address is in a table with <th>Póstfang</th>; data is in the first <td> of the same table
    address = postal_code = city = ""
    for th in soup.find_all("th"):
        if "Póstfang" in th.get_text():
            td = th.find_parent("table").find("td")
            if td:
                lines = [line.strip() for line in td.get_text("\n").split("\n") if line.strip()]
                if lines:
                    address = lines[0]
                if len(lines) > 1:
                    # "210 Garðabær" → postal_code="210", city="Garðabær"
                    parts = lines[1].split(" ", 1)
                    postal_code = parts[0]
                    city = parts[1] if len(parts) > 1 else ""
            break

    if not name or not address:
        return None

    # ÍSAT code — try several strategies to handle different page layouts
    isat_code = None
    isat_label = None

    def _parse_isat(raw):
        raw = raw.strip()
        parts = raw.split(" ", 1)
        return parts[0], (parts[1] if len(parts) > 1 else raw)

    # Strategy 1: <th> sibling → <td> in same <tr>
    for th in soup.find_all("th"):
        if "SAT" in th.get_text() or "Atvinnugrein" in th.get_text():
            tr = th.find_parent("tr")
            td = tr.find("td") if tr else None
            if td:
                isat_code, isat_label = _parse_isat(td.get_text(" ", strip=True))
                break

    # Strategy 2: <dt> → next <dd> (definition list layout)
    if not isat_code:
        for dt in soup.find_all("dt"):
            if "SAT" in dt.get_text() or "Atvinnugrein" in dt.get_text():
                dd = dt.find_next_sibling("dd")
                if dd:
                    isat_code, isat_label = _parse_isat(dd.get_text(" ", strip=True))
                    break

    # Strategy 3: scan all text for the ÍSAT pattern (e.g. "68.20.1 Leiga...")
    if not isat_code:
        isat_pattern = re.compile(r'\b(\d{2,3}\.\d{2}\.\d)\s+(.+)')
        for tag in soup.find_all(string=isat_pattern):
            m = isat_pattern.search(tag)
            if m:
                isat_code, isat_label = m.group(1), m.group(2).strip()
                break

    return {
        "ssn": ssn,
        "name": name,
        "address": address,
        "postal_code": postal_code,
        "city": city,
        "isat_code": isat_code,
        "isat_label": isat_label,
    }
