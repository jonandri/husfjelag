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

    return {
        "ssn": ssn,
        "name": name,
        "address": address,
        "postal_code": postal_code,
        "city": city,
    }
