import secrets
import hashlib
import base64
from django.core.cache import cache


_STATE_TTL = 600  # 10 minutes


def generate_pkce_pair() -> tuple[str, str]:
    """
    Generate a PKCE verifier + S256 challenge pair.
    Returns (verifier, challenge).
    """
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()
    ).rstrip(b"=").decode()
    return verifier, challenge


def store_oauth_state(state: str, payload: dict) -> None:
    """Store OAuth state payload in Redis for 10 minutes."""
    cache.set(f"bank_oauth_state:{state}", payload, timeout=_STATE_TTL)


def pop_oauth_state(state: str) -> dict | None:
    """
    Retrieve and delete the OAuth state payload from Redis.
    Returns None if not found or expired.
    """
    key = f"bank_oauth_state:{state}"
    payload = cache.get(key)
    if payload is not None:
        cache.delete(key)
    return payload
