"""
Húsfjelag OIDC helpers (id.husfjelag.is).

Flow:
  1. build_auth_url()     → redirect user to id.husfjelag.is
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


def build_end_session_url(id_token_hint: str) -> str:
    """Build the RP-initiated logout URL (id.husfjelag.is end_session_endpoint).

    Redirecting the browser here clears the IdP's SSO session; the IdP then
    returns the user to post_logout_redirect_uri. Without it the IdP keeps its
    session cookie and silently re-authenticates on the next login.

    post_logout_redirect_uri must be registered on the client (char-for-char).
    """
    params = {
        "id_token_hint": id_token_hint,
        "post_logout_redirect_uri": settings.FRONTEND_URL.rstrip("/") + "/",
        "client_id": settings.OIDC_CLIENT_ID,
    }
    return f"{settings.OIDC_END_SESSION_ENDPOINT}?{urlencode(params)}"


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
        "client_id": settings.OIDC_CLIENT_ID,
        "redirect_uri": settings.OIDC_REDIRECT_URI,
        "scope": "openid profile national_id phone",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    return f"{settings.OIDC_AUTH_ENDPOINT}?{urlencode(params)}"


def _basic_auth_header() -> str:
    """HTTP Basic credentials for client_secret_basic token-endpoint auth."""
    raw = f"{settings.OIDC_CLIENT_ID}:{settings.OIDC_CLIENT_SECRET}".encode()
    return "Basic " + base64.b64encode(raw).decode()


def exchange_code(code: str, code_verifier: str) -> dict:
    # id.husfjelag.is uses client_secret_basic: client credentials go in the
    # Authorization header, not the request body.
    resp = http.post(
        settings.OIDC_TOKEN_ENDPOINT,
        data={
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": settings.OIDC_REDIRECT_URI,
            "code_verifier": code_verifier,
        },
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": _basic_auth_header(),
        },
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        resp = http.get(settings.OIDC_JWKS_URI, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
    return _jwks_cache


def validate_id_token(id_token: str) -> dict:
    """Validate the IdP's id_token and return the claims."""
    jwks = _get_jwks()
    return jwt.decode(
        id_token,
        jwks,
        algorithms=["RS256"],
        audience=settings.OIDC_CLIENT_ID,
        issuer=settings.OIDC_ISSUER,
    )


def create_access_token(user_id: int) -> str:
    """Issue a signed JWT for the frontend to use as a bearer token."""
    payload = {
        "sub": str(user_id),
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=24),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")
