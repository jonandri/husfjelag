# Replace Kenni OIDC with `id.husfjelag.is`

**Date:** 2026-07-15
**Branch:** `feature/id-husfjelag-oidc`

## Goal

Remove the Kenni identity provider and authenticate users against Húsfjelag's
own IdP at `https://id.husfjelag.is` (OpenID Connect, Authorization Code + PKCE).
Public-page login CTAs go **directly** to the IdP, bypassing the intermediate
`/login` page. The user's **kennitala remains the primary identifier** for all
authentication.

## Constraints & decisions

- **Keep the existing custom-OIDC + bearer-JWT architecture.** The app is a
  React SPA (`www.husfjelag.is`) talking to a separate Django API
  (`api.husfjelag.is`) over `Authorization: Bearer <JWT>`. The attached
  integration spec proposes `mozilla-django-oidc` with Django server-side
  sessions — that assumes Django serves the pages and would require rewriting
  the entire SPA auth model. We reject it. Because `id.husfjelag.is` is our own
  IdP, we register whatever client config we need and only match the *protocol*
  details (endpoints, scopes, claims, `client_secret_basic`).
- **Backend-mediated redirect.** The IdP redirects to
  `https://api.husfjelag.is/auth/callback` (the backend), which mints our own
  HS256 JWT and hands it to the SPA via a one-time exchange code — exactly as
  today. No PKCE/state handling moves into the browser. The `husfjelag-web`
  client on the IdP must be registered with this `redirect_uri`.
- **No model changes, no migrations.** Users are already created via
  `get_or_create(kennitala=...)`. We ignore the IdP `sub` claim and continue
  keying on kennitala.

## Changes

### 1. Backend config — `config/settings/base.py`, `.env.example`

Replace the `KENNI_*` settings block with generic `OIDC_*`:

| Setting | Value |
|---|---|
| `OIDC_CLIENT_ID` | `husfjelag-web` (env, default `husfjelag-web`) |
| `OIDC_CLIENT_SECRET` | env, from Doppler; no default |
| `OIDC_ISSUER` | `https://id.husfjelag.is` |
| `OIDC_AUTH_ENDPOINT` | `https://id.husfjelag.is/auth` |
| `OIDC_TOKEN_ENDPOINT` | `https://id.husfjelag.is/token` |
| `OIDC_USERINFO_ENDPOINT` | `https://id.husfjelag.is/me` |
| `OIDC_JWKS_URI` | `https://id.husfjelag.is/jwks` |
| `OIDC_END_SESSION_ENDPOINT` | `https://id.husfjelag.is/session/end` (defined for future logout; unused now) |
| `OIDC_REDIRECT_URI` | env — prod `https://api.husfjelag.is/auth/callback`, dev `http://localhost:8010/auth/callback` |

### 2. Backend — `users/oidc.py`

- `build_auth_url`: `scope="openid profile national_id phone"`; target
  `OIDC_AUTH_ENDPOINT`. PKCE S256 unchanged.
- `exchange_code`: use **`client_secret_basic`** — send
  `Authorization: Basic base64(client_id:client_secret)` header; drop
  `client_id`/`client_secret` from the POST body. This is the only protocol
  change the new IdP requires.
- `validate_id_token`: `audience=OIDC_CLIENT_ID` (`husfjelag-web`),
  `issuer=OIDC_ISSUER`, JWKS from `OIDC_JWKS_URI`, RS256. Same shape.
- `create_access_token` (our HS256 JWT) — **untouched**.

### 3. Backend — `users/views.py` `OIDCCallbackView`

- Claim mapping: `national_id` → kennitala (strip hyphens, primary key via
  `get_or_create`), `name`, `phone_number` → phone. `sub` ignored.
- In production (`DEBUG=False`), reject a login where `claims.get("is_test_user")`
  is truthy — redirect to `{FRONTEND_URL}/?error=test_user_blocked`.
- Everything downstream (one-time exchange code → JWT, `AuditLog` login event,
  redirect to `{FRONTEND_URL}/auth/callback?code=...`) unchanged.

### 4. Frontend — direct-to-login CTAs

- `src/controlers/HomePage.js`: `onSignup` changes from `navigate('/login')` to
  `window.location.href = ${API_URL}/auth/login`. All CTAs (top bar, hero,
  pricing, footer) go straight to the IdP.
- `src/controlers/Login.js`: retained only as the **error-landing route**
  (`AuthCallback` redirects failures to `/login?error=`). Remove Kenni-specific
  copy and the stale TODO; retry button points at `/auth/login`.
- `src/controlers/AuthCallback.js`: logic unchanged (exchange code → JWT →
  profile → route). Update comments Kenni → Húsfjelag IdP. Fix the stale
  `8003` API_URL default to `8010` for consistency.

### Out of scope (current behavior preserved)

- **Logout** stays local-only (clears `localStorage`). RP-initiated logout via
  `OIDC_END_SESSION_ENDPOINT` is a documented follow-up — it needs storing the
  IdP `id_token` and passing `id_token_hint`, extra scope not requested here.

## Doppler / environment changes

**Remove** (dev, stg, prd configs):
- `KENNI_CLIENT_ID`
- `KENNI_CLIENT_SECRET`
- `KENNI_REDIRECT_URI`

**Add:**
- `OIDC_CLIENT_ID` = `husfjelag-web`
- `OIDC_CLIENT_SECRET` = *(the `husfjelag-web` client secret from the IdP)*
- `OIDC_REDIRECT_URI`:
  - prd: `https://api.husfjelag.is/auth/callback`
  - dev: `http://localhost:8010/auth/callback`

(Issuer + endpoints are hardcoded in settings, so no env vars needed for them.)

**On the IdP side (separate repo, not this change):** register/confirm the
`husfjelag-web` client with `redirect_uri = https://api.husfjelag.is/auth/callback`
(character-for-character), grant `authorization_code`, token auth
`client_secret_basic`, and allow the `openid profile national_id phone` scopes.

## Testing

- `oidc.py` unit tests: `build_auth_url` params (scope, endpoint, PKCE);
  `exchange_code` sends the `client_secret_basic` header and no client creds in
  the body; `validate_id_token` accepts a good token and rejects wrong
  issuer/audience.
- `OIDCCallbackView` test: claims → user keyed on kennitala; `is_test_user`
  rejected in production.
