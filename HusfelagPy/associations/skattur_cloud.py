"""
Client for the Icelandic company registry API (api.skattur.cloud).

Used to verify that a user holds power of attorney (Prókúruhafi) for an
association before allowing them to register it in the system.
"""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.skattur.cloud/legalentities/v2.1/{kennitala}"


def fetch_legal_entity(kennitala: str) -> dict | None:
    """
    Fetch company registry data for the given kennitala.
    Returns the parsed JSON dict on success, or None on any error
    (connection failure, non-200 status, malformed JSON).
    """
    url = _BASE_URL.format(kennitala=kennitala)
    try:
        resp = requests.get(
            url,
            params={"language": "is"},
            headers={
                "Accept": "application/json",
                "Ocp-Apim-Subscription-Key": settings.SKATTUR_CLOUD_API_KEY,
            },
            timeout=10,
        )
    except requests.RequestException:
        logger.exception("Skattur Cloud request failed for kennitala %s", kennitala)
        return None

    if resp.status_code != 200:
        logger.warning(
            "Skattur Cloud returned %s for kennitala %s", resp.status_code, kennitala
        )
        return None

    try:
        return resp.json()
    except ValueError:
        logger.exception("Skattur Cloud returned non-JSON for kennitala %s", kennitala)
        return None


def extract_prokuruhafar(entity: dict) -> list[dict]:
    """
    Return list of {"national_id": ..., "name": ...} for all Relationships
    with Type == "Prókúruhafi".
    """
    return [
        {"national_id": r["NationalId"], "name": r.get("Name", "")}
        for r in entity.get("Relationships", [])
        if r.get("Type") == "Prókúruhafi"
    ]


def _parse_date(value: str | None) -> str | None:
    """
    Coerce an API date value to a YYYY-MM-DD string, or None.
    The API may return ISO 8601 datetime strings like "2023-01-15T00:00:00".
    """
    if not value:
        return None
    return str(value).split("T")[0] or None


def parse_entity_for_association(ssn: str, entity: dict) -> dict:
    """
    Extract the fields needed to create/update an Association from a
    Skattur Cloud entity response.

    Returns a dict with keys:
        ssn, name, address, postal_code, city,
        date_of_board_change, registered, status
    """
    # Postal address (Póstfang)
    address_entry = next(
        (a for a in entity.get("Addresses", []) if a.get("Type") == "Póstfang"),
        {},
    )
    address = address_entry.get("AddressName", "")
    postal_code = str(address_entry.get("Postcode", ""))
    city = address_entry.get("City", "")

    return {
        "ssn": ssn,
        "name": entity.get("Name", ""),
        "address": address,
        "postal_code": postal_code,
        "city": city,
        "date_of_board_change": _parse_date(entity.get("DateOfBoardChange")),
        "registered": _parse_date(entity.get("Registered")),
        "status": entity.get("Status") or None,
    }
