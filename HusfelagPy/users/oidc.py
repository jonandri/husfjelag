"""
Kenni OIDC helpers.

Flow:
  1. build_auth_url()     → redirect user to Kenni
  2. exchange_code()      → exchange authorization code for tokens
  3. validate_id_token()  → verify signature and extract claims
  4. create_access_token() → issue our own JWT to the frontend
"""
import base64
import datetime
import hashlib
import secrets
from urllib.parse import urlencode

import requests as http
from jose import jwt
from django.conf import settings

# Simple in-process JWKS cache (refreshed on restart)
_jwks_cache: dict | None = None


def generate_state() -> str:
    return secrets.token_urlsafe(32)


def generate_pkce_pair() -> tuple[str, str]:
    """Return (code_verifier, code_challenge) for PKCE S256."""
    code_verifier = secrets.token_urlsafe(64)  # 86 URL-safe chars
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


def build_auth_url(state: str, code_challenge: str) -> str:
    params = {
        "response_type": "code",
        "client_id": settings.KENNI_CLIENT_ID,
        "redirect_uri": settings.KENNI_REDIRECT_URI,
        "scope": "openid profile national_id phone_number",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{settings.KENNI_AUTH_ENDPOINT}?{urlencode(params)}"


def exchange_code(code: str, code_verifier: str) -> dict:
    resp = http.post(
        settings.KENNI_TOKEN_ENDPOINT,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.KENNI_REDIRECT_URI,
            "client_id": settings.KENNI_CLIENT_ID,
            "client_secret": settings.KENNI_CLIENT_SECRET,
            "code_verifier": code_verifier,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        resp = http.get(settings.KENNI_JWKS_URI, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
    return _jwks_cache


def validate_id_token(id_token: str) -> dict:
    """Validate Kenni's id_token and return the claims."""
    jwks = _get_jwks()
    return jwt.decode(
        id_token,
        jwks,
        algorithms=["RS256"],
        audience=settings.KENNI_CLIENT_ID,
        issuer=settings.KENNI_ISSUER,
    )


def create_access_token(user_id: int) -> str:
    """Issue a signed JWT for the frontend to use as a bearer token."""
    payload = {
        "sub": str(user_id),
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
