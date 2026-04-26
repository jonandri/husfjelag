# Landsbankinn Customer API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PSD2/OAuth bank integration with Landsbankinn Customer API (mTLS), adding transaction sync (Accounts API) and electronic invoice sending (Claims API).

**Architecture:** Platform-level mTLS client credentials — one P12 certificate authenticates all API calls. `BankTokenCache` stores the shared access token. `AssociationBankSettings` stores the per-association Landsbankinn template ID. `BankClaim` tracks each sent claim. No per-user OAuth consent.

**Tech Stack:** Python `requests-pkcs12` for mTLS, Fernet encryption for cached tokens, Celery for scheduled sync, Django REST Framework, React + MUI.

**Spec:** `docs/superpowers/specs/2026-04-25-landsbankinn-customer-api-design.md`

---

## File Map

**Backend — files changed:**
- Modify: `HusfelagPy/associations/models.py` — add 3 models, remove `BankConsent`
- Delete: `HusfelagPy/associations/banks/oauth_client.py`
- Rewrite: `HusfelagPy/associations/banks/landsbankinn.py` — module-level functions replacing the class
- Rewrite: `HusfelagPy/associations/banks/tasks.py` — new sync logic, remove `check_consent_expiry`
- Modify: `HusfelagPy/associations/banks/views.py` — remove OAuth views, add 3 new views, adapt 3 existing
- Modify: `HusfelagPy/associations/urls.py` — update bank routes
- Modify: `HusfelagPy/config/settings/base.py` — replace PSD2 settings with mTLS settings
- Modify: `HusfelagPy/.env` — replace PSD2 vars with mTLS vars
- Modify: `HusfelagPy/.env.example` — same
- Modify: `HusfelagPy/pyproject.toml` — add `requests-pkcs12`

**Backend — migrations:**
- Create: `HusfelagPy/associations/migrations/XXXX_add_bank_customer_models.py`
- Create: `HusfelagPy/associations/migrations/XXXX_drop_bankconsent.py`

**Backend — tests (new):**
- Create: `HusfelagPy/pytest.ini`
- Create: `HusfelagPy/conftest.py`
- Create: `HusfelagPy/associations/banks/tests/test_token_cache.py`
- Create: `HusfelagPy/associations/banks/tests/test_sync_date_range.py`
- Create: `HusfelagPy/associations/banks/tests/test_send_claim.py`
- Create: `HusfelagPy/associations/banks/tests/__init__.py`

**Frontend — files changed:**
- Delete: `HusfelagJS/src/controlers/BankAuthCallback.js`
- Modify: `HusfelagJS/src/App.js` — remove `/bank/callback` route and `BankAuthCallback` import
- Rewrite: `HusfelagJS/src/controlers/BankSettingsPage.js`
- Modify: `HusfelagJS/src/ui/chips.js` — add claim status styles
- Modify: `HusfelagJS/src/controlers/CollectionPage.js` — add claim column and batch send

---

## Task 1: Setup test infrastructure

**Files:**
- Create: `HusfelagPy/pytest.ini`
- Create: `HusfelagPy/conftest.py`
- Create: `HusfelagPy/associations/banks/tests/__init__.py`

- [ ] **Step 1: Create pytest.ini**

```ini
[pytest]
DJANGO_SETTINGS_MODULE = config.settings.dev
addopts = -v
pythonpath = .
```

- [ ] **Step 2: Create conftest.py**

```python
# HusfelagPy/conftest.py
import django
import pytest

@pytest.fixture(autouse=False)
def db_access(db):
    """Alias for tests that need the database."""
    pass
```

- [ ] **Step 3: Create test package**

```bash
mkdir -p HusfelagPy/associations/banks/tests
touch HusfelagPy/associations/banks/tests/__init__.py
```

- [ ] **Step 4: Verify pytest is importable**

```bash
cd HusfelagPy && poetry run pytest --collect-only 2>&1 | head -20
```

Expected: `no tests ran` or an empty collection — no errors.

- [ ] **Step 5: Commit**

```bash
cd HusfelagPy
git add pytest.ini conftest.py associations/banks/tests/__init__.py
git commit -m "chore: add pytest infrastructure for bank tests"
```

---

## Task 2: Backend cleanup — delete PSD2 code

**Files:**
- Delete: `HusfelagPy/associations/banks/oauth_client.py`
- Modify: `HusfelagPy/associations/banks/views.py` — remove `BankConnectView`, `BankCallbackView`, oauth imports
- Modify: `HusfelagPy/associations/banks/tasks.py` — remove `check_consent_expiry`
- Modify: `HusfelagPy/associations/urls.py` — remove 2 routes and view imports

> Note: Keep `BankConsent` model in `models.py` for now — it still has a table in the database. It will be removed in Task 4 after the migration.

- [ ] **Step 1: Delete oauth_client.py**

```bash
cd HusfelagPy && rm associations/banks/oauth_client.py
```

- [ ] **Step 2: Remove BankConnectView and BankCallbackView from views.py**

In `HusfelagPy/associations/banks/views.py`, remove:
- Line 2: `import secrets`
- Line 11-15: The `from associations.models import (... BankConsent ...)` import — keep only the models still used: `Association, AssociationAccess, AssociationRole, BankApiAuditLog`  
  (Remove `BankConsent, BankNotificationLog`)
- Line 16: `from associations.banks.oauth_client import generate_pkce_pair, store_oauth_state, pop_oauth_state`
- The entire `BankConnectView` class (lines 43-75)
- The entire `BankCallbackView` class (lines 78-134)

After editing, the file starts with:

```python
from datetime import datetime, timezone, timedelta, date

from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from associations.models import (
    Association, AssociationAccess, AssociationRole,
    BankApiAuditLog,
)
from associations.banks.consent_store import encrypt_token, decrypt_token


def _require_chair_or_cfo(request, association):
    """Returns 403 Response if user is not CHAIR, CFO, or superadmin for this association."""
    user = request.user
    if user.is_superadmin:
        return None
    access = AssociationAccess.objects.filter(
        user=user, association=association, active=True,
        role__in=[AssociationRole.CHAIR, AssociationRole.CFO],
    ).exists()
    if not access:
        return Response(
            {"detail": "Aðeins stjórnendur félagsins hafa aðgang að þessari aðgerð."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None
```

Keep `_get_provider` removed too (it only existed to support the OAuth flow). The views below it (`BankStatusView`, `BankDisconnectView`, `AdminBankSyncView`, `AdminBankHealthView`) stay unchanged for now — they'll be adapted in Task 12.

- [ ] **Step 3: Remove check_consent_expiry from tasks.py**

Remove the entire `check_consent_expiry` task (lines 104–165 in original). The `sync_all_associations` task still uses `BankConsent` — leave it as-is for now; it'll be rewritten in Task 7.

After removal, `tasks.py` contains only `sync_transactions` and `sync_all_associations`.

- [ ] **Step 4: Update urls.py imports and routes**

In `HusfelagPy/associations/urls.py`:

Change the bank imports from:
```python
from .banks.views import (
    BankConnectView, BankCallbackView, BankStatusView,
    BankDisconnectView, AdminBankSyncView, AdminBankHealthView,
)
```
To:
```python
from .banks.views import (
    BankStatusView,
    BankDisconnectView, AdminBankSyncView, AdminBankHealthView,
)
```

Remove these two URL patterns:
```python
path("associations/<int:association_id>/bank/connect", BankConnectView.as_view(), name="bank-connect"),
path("bank/callback/<str:bank>", BankCallbackView.as_view(), name="bank-callback"),
```

- [ ] **Step 5: Verify the server starts without errors**

```bash
cd HusfelagPy && poetry run python3 manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 6: Commit**

```bash
cd HusfelagPy
git add associations/banks/views.py associations/banks/tasks.py associations/urls.py
git rm associations/banks/oauth_client.py
git commit -m "feat: remove PSD2 OAuth connect/callback and consent expiry task"
```

---

## Task 3: Frontend cleanup — delete OAuth UI

**Files:**
- Delete: `HusfelagJS/src/controlers/BankAuthCallback.js`
- Modify: `HusfelagJS/src/App.js`

- [ ] **Step 1: Delete BankAuthCallback.js**

```bash
cd HusfelagJS && rm src/controlers/BankAuthCallback.js
```

- [ ] **Step 2: Remove from App.js**

In `HusfelagJS/src/App.js`:

Remove line 25:
```javascript
import BankAuthCallback from './controlers/BankAuthCallback';
```

Remove line 163:
```javascript
<Route path="/bank/callback" element={<BankAuthCallback />} />
```

- [ ] **Step 3: Verify the app builds**

```bash
cd HusfelagJS && npm run build 2>&1 | tail -20
```

Expected: `Compiled successfully.`

- [ ] **Step 4: Commit**

```bash
cd HusfelagJS
git rm src/controlers/BankAuthCallback.js
git add src/App.js
git commit -m "feat: remove bank OAuth callback route and component"
```

---

## Task 4: New models and migrations

**Files:**
- Modify: `HusfelagPy/associations/models.py`
- Create migrations (auto-generated)

- [ ] **Step 1: Add new models to models.py**

At the end of `HusfelagPy/associations/models.py`, after the `BankNotificationLog` class and before the final blank line, add:

```python

class BankTokenCache(models.Model):
    """Single global row (always id=1). Stores the platform access token for Landsbankinn."""
    bank = models.CharField(max_length=32)           # e.g. "LANDSBANKINN"
    access_token = models.TextField()               # Fernet-encrypted
    expires_at = models.DateTimeField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "associations_banktokencache"

    def __str__(self):
        return f"{self.bank} token (expires {self.expires_at})"


class AssociationBankSettings(models.Model):
    """Per-association Landsbankinn configuration. Set up by CHAIR/CFO before claims can be sent."""
    association = models.OneToOneField(
        Association, on_delete=models.CASCADE, related_name="bank_settings"
    )
    template_id = models.CharField(max_length=64)  # Landsbankinn claim template ID
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "associations_associationbanksettings"

    def __str__(self):
        return f"{self.association} — template {self.template_id}"


class BankClaimStatus(models.TextChoices):
    UNPAID = "UNPAID", "Ógreitt"
    PAID = "PAID", "Greitt"
    CANCELLED = "CANCELLED", "Afturkallað"


class BankClaim(models.Model):
    """One row per Collection. Tracks the lifecycle of a single bank claim (kröfu)."""
    collection = models.OneToOneField(
        "Collection", on_delete=models.CASCADE, related_name="bank_claim"
    )
    claim_id = models.CharField(max_length=64)                    # Landsbankinn's claim ID
    payor_national_id = models.CharField(max_length=10)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    due_date = models.DateField()
    status = models.CharField(
        max_length=16, choices=BankClaimStatus.choices, default=BankClaimStatus.UNPAID
    )
    sent_at = models.DateTimeField()
    synced_at = models.DateTimeField(null=True, blank=True)  # last status check timestamp

    class Meta:
        db_table = "associations_bankclaim"

    def __str__(self):
        return f"Claim {self.claim_id} ({self.status}) — {self.collection}"
```

- [ ] **Step 2: Generate migration for new tables**

```bash
cd HusfelagPy && poetry run python3 manage.py makemigrations associations --name add_bank_customer_models
```

Expected: `Migrations for 'associations': associations/migrations/XXXX_add_bank_customer_models.py`

- [ ] **Step 3: Apply migration**

```bash
cd HusfelagPy && poetry run python3 manage.py migrate
```

Expected: `Running migrations: Applying associations.XXXX_add_bank_customer_models... OK`

- [ ] **Step 4: Remove BankConsent from models.py**

In `HusfelagPy/associations/models.py`, remove:
- The `BankChoice` class (lines 275-278)
- The entire `BankConsent` class (lines 281-300)

Do NOT remove `BankApiAuditLog` or `BankNotificationLog` — they remain.

Also update the `BankApiAuditLog` model: its `bank` field uses `BankChoice.choices`. Since `BankChoice` is removed, change that to just `max_length=20` with no choices:

```python
bank = models.CharField(max_length=20)
```

- [ ] **Step 5: Update views.py to remove BankConsent import**

`HusfelagPy/associations/banks/views.py` currently imports nothing from `BankConsent` (it was removed in Task 2). Check the remaining views (`BankStatusView`, `BankDisconnectView`, `AdminBankHealthView`) still reference `BankConsent` in their logic — these will be fixed in Task 12. For now, comment them out temporarily so the app can start:

In `BankStatusView.get()`, replace the body with a temporary stub:
```python
def get(self, request, association_id):
    return Response({"configured": False, "last_sync_at": None})
```

In `BankDisconnectView.delete()`, replace the body with a temporary stub:
```python
def delete(self, request, association_id):
    return Response({"detail": "Bankatengind aftengt."})
```

In `AdminBankHealthView.get()`, replace the body with a temporary stub:
```python
def get(self, request):
    if not request.user.is_superadmin:
        return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)
    return Response({"summary": {}, "associations": []})
```

Also remove the `from associations.banks.consent_store import encrypt_token, decrypt_token` import from views.py — it's no longer used.

Remove the unused `encrypt_token, decrypt_token` import and `from datetime import datetime, timezone, timedelta, date` is still needed for other uses — keep it.

Actually check: the only remaining import use in views.py is `date` (in `AdminBankHealthView` for consent expiry calculations — removed in stub). Remove the datetime imports that are no longer used. Keep `from rest_framework import status` and the model/permission imports.

After cleanup, the top of views.py looks like:

```python
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from associations.models import (
    Association, AssociationAccess, AssociationRole,
)


def _require_chair_or_cfo(request, association):
    """Returns 403 Response if user is not CHAIR, CFO, or superadmin for this association."""
    user = request.user
    if user.is_superadmin:
        return None
    access = AssociationAccess.objects.filter(
        user=user, association=association, active=True,
        role__in=[AssociationRole.CHAIR, AssociationRole.CFO],
    ).exists()
    if not access:
        return Response(
            {"detail": "Aðeins stjórnendur félagsins hafa aðgang að þessari aðgerð."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return None
```

- [ ] **Step 6: Generate migration to drop BankConsent**

```bash
cd HusfelagPy && poetry run python3 manage.py makemigrations associations --name drop_bankconsent
```

Expected: migration that removes `associations_bankconsent` table and the `bank` choices field change on `BankApiAuditLog`.

- [ ] **Step 7: Apply migration**

```bash
cd HusfelagPy && poetry run python3 manage.py migrate
```

Expected: `Applying associations.XXXX_drop_bankconsent... OK`

- [ ] **Step 8: Verify system check passes**

```bash
cd HusfelagPy && poetry run python3 manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 9: Commit**

```bash
cd HusfelagPy
git add associations/models.py associations/banks/views.py associations/migrations/
git commit -m "feat: add BankTokenCache, AssociationBankSettings, BankClaim models; drop BankConsent"
```

---

## Task 5: Environment config and dependencies

**Files:**
- Modify: `HusfelagPy/pyproject.toml`
- Modify: `HusfelagPy/config/settings/base.py`
- Modify: `HusfelagPy/.env`
- Modify: `HusfelagPy/.env.example`

- [ ] **Step 1: Add requests-pkcs12 to pyproject.toml**

In `HusfelagPy/pyproject.toml`, add to `dependencies`:
```toml
"requests-pkcs12 (>=1.3)",
```

- [ ] **Step 2: Install dependency**

```bash
cd HusfelagPy && poetry add requests-pkcs12
```

Expected: `Package operations: 1 install...`

- [ ] **Step 3: Update settings/base.py — bank section**

In `HusfelagPy/config/settings/base.py`, replace the entire bank integration section (lines 104–129) with:

```python
# ── Bank integration ──────────────────────────────────────────────────────────
BANK_FERNET_KEY = env("BANK_FERNET_KEY", default="")

BANK_LANDSBANKINN_ENABLED = env.bool("BANK_LANDSBANKINN_ENABLED", default=False)
BANK_LANDSBANKINN_API_KEY = env("BANK_LANDSBANKINN_API_KEY", default="")
BANK_LANDSBANKINN_CERT_PATH = env("BANK_LANDSBANKINN_CERT_PATH", default="")
BANK_LANDSBANKINN_CERT_PASSWORD = env("BANK_LANDSBANKINN_CERT_PASSWORD", default="")
BANK_LANDSBANKINN_AUTH_URL = env(
    "BANK_LANDSBANKINN_AUTH_URL",
    default="https://mtls-auth.landsbankinn.is/connect/token",
)
BANK_LANDSBANKINN_API_BASE = env(
    "BANK_LANDSBANKINN_API_BASE",
    default="https://apisandbox.landsbankinn.is/api",
)
```

Also update `CELERY_BEAT_SCHEDULE` (replace the entire block):

```python
# Celery beat — periodic tasks
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    "sync-all-bank-transactions": {
        "task": "associations.banks.tasks.sync_all_associations",
        "schedule": crontab(hour=3, minute=0),
    },
    "sync-all-claim-statuses": {
        "task": "associations.banks.tasks.sync_all_claim_statuses",
        "schedule": crontab(hour=3, minute=30),
    },
}
```

- [ ] **Step 4: Update .env**

In `HusfelagPy/.env`, replace the bank section with:

```
# Bank integration
BANK_FERNET_KEY=YourFernetKeyGoesHere
BANK_LANDSBANKINN_ENABLED=true
BANK_LANDSBANKINN_API_KEY=YourApiKeyGoesHere
BANK_LANDSBANKINN_CERT_PATH=/path/to/company.p12
BANK_LANDSBANKINN_CERT_PASSWORD=your-p12-password
BANK_LANDSBANKINN_AUTH_URL=https://mtls-auth.landsbankinn.is/connect/token
BANK_LANDSBANKINN_API_BASE=https://apisandbox.landsbankinn.is/api
```

- [ ] **Step 5: Update .env.example**

In `HusfelagPy/.env.example`, replace the bank section with:

```
# Bank integration
# Generate Fernet key: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
BANK_FERNET_KEY=YourFernetKeyGoesHere
BANK_LANDSBANKINN_ENABLED=false
BANK_LANDSBANKINN_API_KEY=
BANK_LANDSBANKINN_CERT_PATH=/path/to/company.p12
BANK_LANDSBANKINN_CERT_PASSWORD=
BANK_LANDSBANKINN_AUTH_URL=https://mtls-auth.landsbankinn.is/connect/token
BANK_LANDSBANKINN_API_BASE=https://apisandbox.landsbankinn.is/api
```

- [ ] **Step 6: Verify settings load**

```bash
cd HusfelagPy && poetry run python3 manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 7: Commit**

```bash
cd HusfelagPy
git add pyproject.toml poetry.lock config/settings/base.py .env.example
git commit -m "feat: update env config and add requests-pkcs12 for mTLS auth"
```

Note: Do NOT commit `.env` — it contains secrets.

---

## Task 6: Rewrite landsbankinn.py — token management and API helpers

**Files:**
- Create: `HusfelagPy/associations/banks/tests/test_token_cache.py`
- Rewrite: `HusfelagPy/associations/banks/landsbankinn.py`

- [ ] **Step 1: Write failing test for token cache**

Create `HusfelagPy/associations/banks/tests/test_token_cache.py`:

```python
import pytest
from datetime import timedelta
from unittest.mock import patch, MagicMock
from django.utils.timezone import now


@pytest.mark.django_db
def test_get_access_token_returns_cached_token():
    """If BankTokenCache has a valid (not-yet-expiring) token, return it without HTTP call."""
    from cryptography.fernet import Fernet
    from associations.models import BankTokenCache
    from django.conf import settings

    key = settings.BANK_FERNET_KEY
    if not key:
        pytest.skip("BANK_FERNET_KEY not set")

    fernet = Fernet(key.encode() if isinstance(key, str) else key)
    plaintext = "cached-token-abc"
    encrypted = fernet.encrypt(plaintext.encode()).decode()

    BankTokenCache.objects.update_or_create(
        id=1,
        defaults={
            "bank": "LANDSBANKINN",
            "access_token": encrypted,
            "expires_at": now() + timedelta(minutes=10),
        },
    )

    from associations.banks.landsbankinn import get_access_token
    with patch("associations.banks.landsbankinn.requests_pkcs12") as mock_lib:
        result = get_access_token()

    assert result == "cached-token-abc"
    mock_lib.post.assert_not_called()


@pytest.mark.django_db
def test_get_access_token_refreshes_expired_token():
    """If token is absent or expires within 60s, fetch a new one via mTLS."""
    from associations.models import BankTokenCache

    # No cache row exists
    BankTokenCache.objects.filter(id=1).delete()

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"access_token": "fresh-token", "expires_in": 1200}
    mock_resp.raise_for_status = MagicMock()

    from associations.banks.landsbankinn import get_access_token
    with patch("associations.banks.landsbankinn.requests_pkcs12") as mock_lib:
        mock_lib.post.return_value = mock_resp
        with patch("django.conf.settings.BANK_LANDSBANKINN_CERT_PATH", "/fake/cert.p12"):
            with patch("django.conf.settings.BANK_FERNET_KEY", "ZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2U="):
                result = get_access_token()

    assert result == "fresh-token"
    cache = BankTokenCache.objects.get(id=1)
    assert cache.bank == "LANDSBANKINN"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/test_token_cache.py -v
```

Expected: FAIL — `ImportError` or `AttributeError` since the new API does not exist yet.

- [ ] **Step 3: Rewrite landsbankinn.py**

Replace the entire contents of `HusfelagPy/associations/banks/landsbankinn.py` with:

```python
"""
Landsbankinn Customer API client.

Provides module-level helpers for all API interactions:
- get_access_token() — mTLS client_credentials, cached in BankTokenCache (id=1)
- _get(path, **params) — authenticated GET, returns dict
- _post(path, body) — authenticated POST, returns dict
- sync_account_transactions(account, from_date, to_date) — fetch + upsert transactions
- create_claim(collection, settings_obj) — send one collection row as a kröfu
- get_claim_status(claim_id) — fetch current status from Claims API
"""

import logging
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

import requests
import requests_pkcs12
from django.conf import settings
from django.utils.timezone import now

logger = logging.getLogger(__name__)

BANK = "LANDSBANKINN"


def get_access_token() -> str:
    """
    Return a valid Landsbankinn access token.

    Checks BankTokenCache (id=1) first. If absent or expiring within 60 seconds,
    fetches a new token via mTLS POST using the platform P12 certificate and caches it
    (Fernet-encrypted) for future calls.
    """
    from cryptography.fernet import Fernet
    from associations.models import BankTokenCache

    fernet_key = settings.BANK_FERNET_KEY
    fernet = Fernet(fernet_key.encode() if isinstance(fernet_key, str) else fernet_key)

    try:
        cache = BankTokenCache.objects.get(id=1)
        if cache.bank == BANK and cache.expires_at > now() + timedelta(seconds=60):
            return fernet.decrypt(cache.access_token.encode()).decode()
    except BankTokenCache.DoesNotExist:
        pass

    # Fetch new token via mTLS
    cert_path = settings.BANK_LANDSBANKINN_CERT_PATH
    cert_password = settings.BANK_LANDSBANKINN_CERT_PASSWORD
    api_key = settings.BANK_LANDSBANKINN_API_KEY
    auth_url = settings.BANK_LANDSBANKINN_AUTH_URL

    resp = requests_pkcs12.post(
        auth_url,
        data={
            "grant_type": "client_credentials",
            "client_id": api_key,
            "scope": "external",
            "access_token_configuration": "external_client",
        },
        pkcs12_filename=cert_path,
        pkcs12_password=cert_password,
        timeout=15,
    )
    resp.raise_for_status()
    data = resp.json()

    plaintext = data["access_token"]
    expires_in = int(data.get("expires_in", 1200))
    encrypted = fernet.encrypt(plaintext.encode()).decode()

    BankTokenCache.objects.update_or_create(
        id=1,
        defaults={
            "bank": BANK,
            "access_token": encrypted,
            "expires_at": now() + timedelta(seconds=expires_in),
        },
    )
    return plaintext


def _get(path: str, **params) -> dict:
    """Authenticated GET to Landsbankinn API. Returns parsed JSON."""
    token = get_access_token()
    resp = requests.get(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _get_raw(path: str, **params):
    """Authenticated GET, returns raw Response object (needed for pagination headers)."""
    token = get_access_token()
    resp = requests.get(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        params=params,
        timeout=30,
    )
    resp.raise_for_status()
    return resp


def _post(path: str, body: dict) -> dict:
    """Authenticated POST to Landsbankinn API. Returns parsed JSON."""
    token = get_access_token()
    resp = requests.post(
        f"{settings.BANK_LANDSBANKINN_API_BASE}{path}",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def sync_account_transactions(account, from_date: date, to_date: date) -> dict:
    """
    Fetch and upsert transactions for one BankAccount.

    Uses paginated GET with perPage=1000. Pagination total comes from
    X-Paging-TotalPages response header (falls back to JSON totalPages field, then 1).

    Returns {"created": int, "skipped": int}.
    """
    from associations.models import Transaction, TransactionSource

    created = 0
    skipped = 0
    page = 1

    while True:
        resp = _get_raw(
            f"/Accounts/Accounts/v1/Accounts/{account.account_number}/Transactions",
            bookingDateFrom=from_date.isoformat(),
            bookingDateTo=to_date.isoformat(),
            perPage=1000,
            page=page,
        )
        data = resp.json()
        total_pages = int(
            resp.headers.get("X-Paging-TotalPages", data.get("totalPages", 1))
        )
        transactions = data.get("data", [])

        for tx in transactions:
            external_id = tx.get("id", "")
            if external_id and Transaction.objects.filter(external_id=external_id).exists():
                skipped += 1
                continue

            Transaction.objects.create(
                bank_account=account,
                external_id=external_id,
                date=tx["bookingDate"],
                amount=Decimal(str(tx["amount"])),
                description=tx.get("actionLabel", "") or "",
                reference=tx.get("reference", "") or "",
                payer_kennitala=(
                    tx.get("debtorNationalId", "")
                    or tx.get("creditorNationalId", "")
                    or ""
                ),
                source=TransactionSource.BANK_SYNC,
            )
            created += 1

        if page >= total_pages:
            break
        page += 1

    return {"created": created, "skipped": skipped}


def _last_day_of_month(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def create_claim(collection, settings_obj) -> dict:
    """
    Send one Collection row as a Landsbankinn claim (kröfu).

    Args:
        collection: Collection instance with budget, apartment, payer loaded.
        settings_obj: AssociationBankSettings for the association.

    Returns the raw API response dict (contains the new claim ID).
    Raises requests.HTTPError on failure.
    """
    due_date = _last_day_of_month(collection.budget.year, collection.month)
    auto_cancel = date(due_date.year + 4, due_date.month, due_date.day)
    assoc_ssn = collection.budget.association.ssn
    month_label = f"{collection.month:02d}/{collection.budget.year}"

    body = {
        "templateId": settings_obj.template_id,
        "payorNationalId": collection.payer.kennitala,
        "principalAmount": float(collection.amount_total),
        "dueDate": due_date.isoformat(),
        "finalDueDate": due_date.isoformat(),
        "autoCancellation": auto_cancel.isoformat(),
        "description": f"Húsfélagsgjald {month_label}",
        "paymentSequenceType": "none",
        "isPartialPaymentAllowed": False,
        "defaultCharge": {
            "isPercentage": False,
            "dateReference": "dueDate",
            "firstDefaultCharge": {"numberOfDays": 0, "value": 0},
            "secondDefaultCharge": {"numberOfDays": 0, "value": 0},
        },
        "discount": {
            "isPercentage": False,
            "dateReference": "dueDate",
            "firstDiscount": {"numberOfDays": 0, "value": 0},
            "secondDiscount": {"numberOfDays": 0, "value": 0},
        },
        "noticeAndPaymentFee": {"printingFee": 0, "paperlessFee": 0},
        "notifications": {
            "sendLatePaymentNotification": False,
            "sendSecondaryCollectionWarning": False,
        },
        "secondaryCollection": {
            "collectionCompanyNationalId": assoc_ssn,
            "gracePeriodDays": 0,
        },
    }
    return _post("/Claims/Claims/v1/Claims", body)


def get_claim_status(claim_id: str) -> str:
    """
    Fetch the current status of a claim from Landsbankinn.

    Returns one of: "unpaid", "paid", "cancelled" (lowercased from API).
    Raises requests.HTTPError if the claim is not found.
    """
    data = _get(f"/Claims/Claims/v1/Claims/{claim_id}")
    return data.get("status", "").lower()
```

- [ ] **Step 4: Run the tests**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/test_token_cache.py -v
```

Expected: PASS (both tests pass with mocked HTTP).

- [ ] **Step 5: Verify system check**

```bash
cd HusfelagPy && poetry run python3 manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 6: Commit**

```bash
cd HusfelagPy
git add associations/banks/landsbankinn.py associations/banks/tests/test_token_cache.py
git commit -m "feat: rewrite landsbankinn.py with mTLS token management and API helpers"
```

---

## Task 7: Rewrite sync tasks

**Files:**
- Create: `HusfelagPy/associations/banks/tests/test_sync_date_range.py`
- Rewrite: `HusfelagPy/associations/banks/tasks.py`

- [ ] **Step 1: Write failing tests for date range logic**

Create `HusfelagPy/associations/banks/tests/test_sync_date_range.py`:

```python
import pytest
from datetime import date
from unittest.mock import patch, MagicMock


@pytest.mark.django_db
def test_sync_uses_one_day_before_last_transaction():
    """When transactions exist, from_date = last_tx_date - 1 day."""
    from associations.models import (
        Association, BankAccount, Transaction, BankTokenCache, TransactionSource
    )

    assoc = Association.objects.create(
        ssn="1234567890", name="Test", address="Test", postal_code="100", city="Reykjavik"
    )
    account = BankAccount.objects.create(
        association=assoc, name="Main", account_number="0101010101"
    )
    # Create a transaction dated 2026-03-15
    Transaction.objects.create(
        bank_account=account,
        date=date(2026, 3, 15),
        amount="1000",
        description="Test tx",
        source=TransactionSource.BANK_SYNC,
    )

    captured = {}

    def fake_sync(account_arg, from_date, to_date):
        captured["from_date"] = from_date
        captured["to_date"] = to_date
        return {"created": 0, "skipped": 0}

    from associations.banks import tasks
    with patch.object(tasks, "sync_account_transactions", side_effect=fake_sync):
        tasks.sync_transactions(assoc.id)

    assert captured["from_date"] == date(2026, 3, 14)  # one day before last tx


@pytest.mark.django_db
def test_sync_uses_jan_1_for_first_sync():
    """When no transactions exist, from_date = January 1st of current year."""
    from associations.models import Association, BankAccount

    assoc = Association.objects.create(
        ssn="9876543210", name="Empty", address="Test", postal_code="100", city="Reykjavik"
    )
    account = BankAccount.objects.create(
        association=assoc, name="Main", account_number="0202020202"
    )

    captured = {}

    def fake_sync(account_arg, from_date, to_date):
        captured["from_date"] = from_date
        return {"created": 0, "skipped": 0}

    from associations.banks import tasks
    with patch.object(tasks, "sync_account_transactions", side_effect=fake_sync):
        tasks.sync_transactions(assoc.id)

    today = date.today()
    assert captured["from_date"] == date(today.year, 1, 1)
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/test_sync_date_range.py -v
```

Expected: FAIL — `AttributeError: module 'associations.banks.tasks' has no attribute 'sync_account_transactions'`

- [ ] **Step 3: Rewrite tasks.py**

Replace the entire contents of `HusfelagPy/associations/banks/tasks.py` with:

```python
import logging
from datetime import date, timedelta

from celery import shared_task
from django.conf import settings

from associations.banks.landsbankinn import sync_account_transactions

logger = logging.getLogger(__name__)


@shared_task(name="associations.banks.tasks.sync_transactions")
def sync_transactions(association_id: int) -> dict:
    """
    Sync bank transactions for one association.

    For each BankAccount:
    - from_date = last transaction date - 1 day (or Jan 1 of current year for first sync)
    - to_date = today
    - Fetches paginated transactions and upserts by external_id.
    """
    from associations.models import Association, BankAccount, Transaction

    if not getattr(settings, "BANK_LANDSBANKINN_ENABLED", False):
        return {"skipped": True, "reason": "bank_disabled"}

    try:
        association = Association.objects.get(id=association_id)
    except Association.DoesNotExist:
        logger.warning("sync_transactions: association %s not found", association_id)
        return {"skipped": True, "reason": "not_found"}

    total_created = 0
    total_skipped = 0

    for account in BankAccount.objects.filter(association=association, deleted=False):
        last_date = (
            Transaction.objects
            .filter(bank_account=account)
            .order_by("-date")
            .values_list("date", flat=True)
            .first()
        )
        today = date.today()
        from_date = (last_date - timedelta(days=1)) if last_date else date(today.year, 1, 1)
        to_date = today

        try:
            result = sync_account_transactions(account, from_date, to_date)
            total_created += result["created"]
            total_skipped += result["skipped"]
        except Exception as exc:
            logger.error(
                "sync_transactions: failed for account %s (assoc %s): %s",
                account.account_number, association_id, exc,
            )

    logger.info(
        "sync_transactions: assoc=%s created=%s skipped=%s",
        association_id, total_created, total_skipped,
    )
    return {"created": total_created, "skipped": total_skipped}


@shared_task(name="associations.banks.tasks.sync_all_associations")
def sync_all_associations() -> dict:
    """
    Dispatch sync_transactions for every association that has at least one BankAccount.
    """
    from associations.models import BankAccount

    assoc_ids = list(
        BankAccount.objects
        .filter(deleted=False)
        .values_list("association_id", flat=True)
        .distinct()
    )
    for assoc_id in assoc_ids:
        sync_transactions.delay(assoc_id)

    logger.info("sync_all_associations: dispatched %s tasks", len(assoc_ids))
    return {"dispatched": len(assoc_ids)}


@shared_task(name="associations.banks.tasks.sync_claim_statuses")
def sync_claim_statuses(association_id: int) -> dict:
    """
    Check payment status of all UNPAID BankClaims for one association.

    Strategy:
    1. Find the earliest due_date among UNPAID claims.
    2. Fetch all claims from Landsbankinn API with status=unpaid filtered from that date.
    3. Any UNPAID BankClaim whose claim_id is NOT in the returned set has changed —
       fetch it individually to get the current status.
    4. Update BankClaim.status + synced_at. If PAID, also set Collection.status = PAID.
    """
    from django.utils.timezone import now as tz_now
    from associations.models import (
        Association, BankClaim, BankClaimStatus, Collection, CollectionStatus,
    )
    from associations.banks.landsbankinn import _get, get_claim_status

    try:
        association = Association.objects.get(id=association_id)
    except Association.DoesNotExist:
        return {"skipped": True, "reason": "not_found"}

    unpaid_claims = BankClaim.objects.filter(
        collection__budget__association=association,
        status=BankClaimStatus.UNPAID,
    ).select_related("collection")

    if not unpaid_claims.exists():
        return {"checked": 0, "updated": 0}

    earliest_due = unpaid_claims.order_by("due_date").values_list("due_date", flat=True).first()

    # Fetch all unpaid claims from the bank since earliest_due
    try:
        resp_data = _get(
            "/Claims/Claims/v1/Claims",
            claimantNationalId=association.ssn,
            status="unpaid",
            dueDateFrom=earliest_due.isoformat(),
        )
    except Exception as exc:
        logger.error("sync_claim_statuses: list fetch failed for assoc %s: %s", association_id, exc)
        return {"error": str(exc)}

    still_unpaid_ids = {c["id"] for c in resp_data.get("data", [])}

    updated = 0
    for claim in unpaid_claims:
        if claim.claim_id in still_unpaid_ids:
            claim.synced_at = tz_now()
            claim.save(update_fields=["synced_at"])
            continue

        # claim_id not in unpaid list — fetch individual status
        try:
            new_status_raw = get_claim_status(claim.claim_id)
        except Exception as exc:
            logger.error(
                "sync_claim_statuses: individual fetch failed for claim %s: %s",
                claim.claim_id, exc,
            )
            continue

        if new_status_raw == "paid":
            claim.status = BankClaimStatus.PAID
            # Mark collection as paid
            Collection.objects.filter(id=claim.collection_id).update(
                status=CollectionStatus.PAID
            )
        elif new_status_raw == "cancelled":
            claim.status = BankClaimStatus.CANCELLED

        claim.synced_at = tz_now()
        claim.save(update_fields=["status", "synced_at"])
        updated += 1

    logger.info(
        "sync_claim_statuses: assoc=%s updated=%s", association_id, updated
    )
    return {"checked": unpaid_claims.count(), "updated": updated}


@shared_task(name="associations.banks.tasks.sync_all_claim_statuses")
def sync_all_claim_statuses() -> dict:
    """Dispatch sync_claim_statuses for every association with UNPAID claims."""
    from associations.models import BankClaim, BankClaimStatus

    assoc_ids = list(
        BankClaim.objects
        .filter(status=BankClaimStatus.UNPAID)
        .values_list("collection__budget__association_id", flat=True)
        .distinct()
    )
    for assoc_id in assoc_ids:
        sync_claim_statuses.delay(assoc_id)

    logger.info("sync_all_claim_statuses: dispatched %s tasks", len(assoc_ids))
    return {"dispatched": len(assoc_ids)}
```

- [ ] **Step 4: Run tests**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/test_sync_date_range.py -v
```

Expected: PASS.

- [ ] **Step 5: Verify system check**

```bash
cd HusfelagPy && poetry run python3 manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 6: Commit**

```bash
cd HusfelagPy
git add associations/banks/tasks.py associations/banks/tests/test_sync_date_range.py
git commit -m "feat: rewrite sync tasks with dynamic date range and claim status sync"
```

---

## Task 8: Bank settings endpoint

**Files:**
- Modify: `HusfelagPy/associations/banks/views.py` — add `AssociationBankSettingsView`
- Modify: `HusfelagPy/associations/urls.py` — register route

- [ ] **Step 1: Write failing test**

Create `HusfelagPy/associations/banks/tests/test_bank_settings_view.py`:

```python
import pytest
from django.test import Client
from associations.models import Association, AssociationAccess, AssociationRole
from users.models import User


@pytest.fixture
def chair_user(db):
    return User.objects.create(
        kennitala="1111111111", name="Chair", email="chair@test.is"
    )


@pytest.fixture
def association(db):
    return Association.objects.create(
        ssn="2222222222", name="Test BA", address="Test st", postal_code="100", city="Reykjavik"
    )


@pytest.fixture
def chair_access(db, chair_user, association):
    AssociationAccess.objects.create(
        user=chair_user, association=association, role=AssociationRole.CHAIR, active=True
    )


@pytest.mark.django_db
def test_get_settings_returns_404_when_not_configured(chair_user, association, chair_access, client):
    client.force_login(chair_user)
    resp = client.get(f"/associations/{association.id}/bank/settings")
    assert resp.status_code == 404


@pytest.mark.django_db
def test_post_settings_creates_template_id(chair_user, association, chair_access, client):
    client.force_login(chair_user)
    resp = client.post(
        f"/associations/{association.id}/bank/settings",
        data={"template_id": "TPL-123"},
        content_type="application/json",
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["template_id"] == "TPL-123"

    # Second POST updates
    resp2 = client.post(
        f"/associations/{association.id}/bank/settings",
        data={"template_id": "TPL-456"},
        content_type="application/json",
    )
    assert resp2.status_code == 200
    assert resp2.json()["template_id"] == "TPL-456"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/test_bank_settings_view.py -v
```

Expected: FAIL — 404 on the route since it doesn't exist yet.

- [ ] **Step 3: Add AssociationBankSettingsView to views.py**

Add these imports at the top of `HusfelagPy/associations/banks/views.py`:
```python
import json
from associations.models import (
    Association, AssociationAccess, AssociationRole,
    AssociationBankSettings,
)
```

Then append the following class at the end of `views.py`:

```python
class AssociationBankSettingsView(APIView):
    """GET/POST /associations/{id}/bank/settings"""
    permission_classes = [IsAuthenticated]

    def get(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response({"detail": "Bankastillingar ekki stilltar."}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            "template_id": bank_settings.template_id,
            "updated_at": bank_settings.updated_at.isoformat(),
        })

    def post(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        template_id = request.data.get("template_id", "").strip()
        if not template_id:
            return Response(
                {"detail": "template_id er nauðsynlegt."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        bank_settings, _ = AssociationBankSettings.objects.update_or_create(
            association=association,
            defaults={"template_id": template_id},
        )
        return Response({
            "template_id": bank_settings.template_id,
            "updated_at": bank_settings.updated_at.isoformat(),
        })
```

- [ ] **Step 4: Register URL in urls.py**

In `HusfelagPy/associations/urls.py`, update the bank imports:
```python
from .banks.views import (
    BankStatusView,
    BankDisconnectView, AdminBankSyncView, AdminBankHealthView,
    AssociationBankSettingsView,
)
```

Add the new route (alongside the other bank routes):
```python
path("associations/<int:association_id>/bank/settings", AssociationBankSettingsView.as_view(), name="bank-settings"),
```

- [ ] **Step 5: Run tests**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/test_bank_settings_view.py -v
```

Expected: PASS.

Note: These tests use Django's `force_login` which bypasses JWT. The real API uses JWT auth — this is fine for unit tests.

- [ ] **Step 6: Commit**

```bash
cd HusfelagPy
git add associations/banks/views.py associations/urls.py associations/banks/tests/test_bank_settings_view.py
git commit -m "feat: add AssociationBankSettingsView GET/POST for template_id management"
```

---

## Task 9: Send claim endpoint

**Files:**
- Create: `HusfelagPy/associations/banks/tests/test_send_claim.py`
- Modify: `HusfelagPy/associations/banks/views.py` — add `SendClaimView`
- Modify: `HusfelagPy/associations/urls.py` — register route

- [ ] **Step 1: Write failing test for create_claim logic**

Create `HusfelagPy/associations/banks/tests/test_send_claim.py`:

```python
import pytest
from datetime import date
from decimal import Decimal
from unittest.mock import patch, MagicMock


@pytest.mark.django_db
def test_create_claim_builds_correct_payload():
    """create_claim() sends a POST with correct due_date and principalAmount."""
    from associations.models import (
        Association, Apartment, Budget, Collection, CollectionStatus,
        AssociationBankSettings, BankAccount,
    )
    from users.models import User

    assoc = Association.objects.create(
        ssn="5555555555", name="BA", address="A", postal_code="100", city="RVK"
    )
    payer = User.objects.create(kennitala="6666666666", name="Owner")
    budget = Budget.objects.create(association=assoc, year=2026, is_active=True)
    apartment = Apartment.objects.create(
        association=assoc, fnr="12345678", anr="0101",
        share=Decimal("100.00"), share_eq=Decimal("100.00"),
    )
    collection = Collection.objects.create(
        budget=budget,
        apartment=apartment,
        payer=payer,
        month=4,
        amount_shared=Decimal("5000.00"),
        amount_equal=Decimal("0.00"),
        amount_total=Decimal("5000.00"),
        status=CollectionStatus.PENDING,
    )
    settings_obj = AssociationBankSettings.objects.create(
        association=assoc, template_id="TPL-999"
    )

    captured_body = {}

    def fake_post(path, body):
        captured_body.update(body)
        return {"id": "CLAIM-ABC123", "status": "unpaid"}

    from associations.banks import landsbankinn
    with patch.object(landsbankinn, "_post", side_effect=fake_post):
        result = landsbankinn.create_claim(collection, settings_obj)

    assert result["id"] == "CLAIM-ABC123"
    assert captured_body["templateId"] == "TPL-999"
    assert captured_body["payorNationalId"] == "6666666666"
    assert captured_body["principalAmount"] == 5000.0
    assert captured_body["dueDate"] == "2026-04-30"  # last day of April 2026
    assert captured_body["description"] == "Húsfélagsgjald 04/2026"
    assert captured_body["secondaryCollection"]["collectionCompanyNationalId"] == "5555555555"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/test_send_claim.py -v
```

Expected: FAIL if `create_claim` not yet implemented (or PASS if Task 6 is done — the function was already written in Task 6). If Task 6 is complete, this test should PASS already.

- [ ] **Step 3: Add SendClaimView to views.py**

Add to imports at top of `HusfelagPy/associations/banks/views.py`:
```python
from django.utils.timezone import now as tz_now
from associations.models import (
    Association, AssociationAccess, AssociationRole,
    AssociationBankSettings, BankClaim, BankClaimStatus, Collection,
)
```

Append to the end of `views.py`:

```python
class SendClaimView(APIView):
    """POST /Collection/{collection_id}/send-claim"""
    permission_classes = [IsAuthenticated]

    def post(self, request, collection_id):
        try:
            collection = Collection.objects.select_related(
                "budget__association", "payer", "apartment"
            ).get(id=collection_id)
        except Collection.DoesNotExist:
            return Response({"detail": "Innheimtufærsla ekki fundin."}, status=status.HTTP_404_NOT_FOUND)

        association = collection.budget.association
        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        # Guard: already sent
        if BankClaim.objects.filter(collection=collection).exists():
            return Response(
                {"detail": "Krafa hefur þegar verið send fyrir þessa færslu."},
                status=status.HTTP_409_CONFLICT,
            )

        # Guard: no payer kennitala
        if not collection.payer or not collection.payer.kennitala:
            return Response(
                {"detail": "Greiðandi hefur enga kennitölu skráða."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        # Load template settings
        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar eru ekki stilltar fyrir þetta félag."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        from associations.banks.landsbankinn import create_claim, _last_day_of_month
        try:
            api_response = create_claim(collection, bank_settings)
        except Exception as exc:
            return Response(
                {"detail": f"Villa við sendingu kröfu: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        due_date = _last_day_of_month(collection.budget.year, collection.month)
        claim = BankClaim.objects.create(
            collection=collection,
            claim_id=api_response["id"],
            payor_national_id=collection.payer.kennitala,
            amount=collection.amount_total,
            due_date=due_date,
            status=BankClaimStatus.UNPAID,
            sent_at=tz_now(),
        )
        return Response({
            "claim_id": claim.claim_id,
            "status": claim.status,
            "due_date": claim.due_date.isoformat(),
            "sent_at": claim.sent_at.isoformat(),
        }, status=status.HTTP_201_CREATED)
```

- [ ] **Step 4: Register URL in urls.py**

Update imports:
```python
from .banks.views import (
    BankStatusView,
    BankDisconnectView, AdminBankSyncView, AdminBankHealthView,
    AssociationBankSettingsView, SendClaimView,
)
```

Add route:
```python
path("Collection/<int:collection_id>/send-claim", SendClaimView.as_view(), name="collection-send-claim"),
```

- [ ] **Step 5: Run all bank tests**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/ -v
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
cd HusfelagPy
git add associations/banks/views.py associations/urls.py associations/banks/tests/test_send_claim.py
git commit -m "feat: add SendClaimView POST /Collection/{id}/send-claim"
```

---

## Task 10: Send all claims endpoint

**Files:**
- Modify: `HusfelagPy/associations/banks/views.py` — add `SendAllClaimsView`
- Modify: `HusfelagPy/associations/urls.py` — register route

- [ ] **Step 1: Add SendAllClaimsView to views.py**

Append to the end of `HusfelagPy/associations/banks/views.py`:

```python
class SendAllClaimsView(APIView):
    """POST /associations/{id}/bank/send-all-claims?month=4&year=2026"""
    permission_classes = [IsAuthenticated]

    def post(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        month = request.query_params.get("month")
        year = request.query_params.get("year")
        if not month or not year:
            return Response(
                {"detail": "month og year eru nauðsynleg."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        month, year = int(month), int(year)

        try:
            bank_settings = AssociationBankSettings.objects.get(association=association)
        except AssociationBankSettings.DoesNotExist:
            return Response(
                {"detail": "Bankastillingar eru ekki stilltar."},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )

        collections = (
            Collection.objects
            .select_related("budget", "payer", "apartment")
            .filter(
                budget__association=association,
                budget__year=year,
                month=month,
            )
            .exclude(bank_claim__isnull=False)  # skip already sent
        )

        from associations.banks.landsbankinn import create_claim, _last_day_of_month
        sent = 0
        skipped = 0
        errors = []

        for collection in collections:
            if not collection.payer or not collection.payer.kennitala:
                skipped += 1
                continue

            try:
                api_response = create_claim(collection, bank_settings)
            except Exception as exc:
                errors.append(f"Íbúð {collection.apartment.anr}: {exc}")
                skipped += 1
                continue

            due_date = _last_day_of_month(year, month)
            BankClaim.objects.create(
                collection=collection,
                claim_id=api_response["id"],
                payor_national_id=collection.payer.kennitala,
                amount=collection.amount_total,
                due_date=due_date,
                status=BankClaimStatus.UNPAID,
                sent_at=tz_now(),
            )
            sent += 1

        response_data = {"sent": sent, "skipped": skipped}
        if errors:
            response_data["errors"] = errors
        return Response(response_data)
```

- [ ] **Step 2: Register URL in urls.py**

Update imports:
```python
from .banks.views import (
    BankStatusView,
    BankDisconnectView, AdminBankSyncView, AdminBankHealthView,
    AssociationBankSettingsView, SendClaimView, SendAllClaimsView,
)
```

Add route:
```python
path("associations/<int:association_id>/bank/send-all-claims", SendAllClaimsView.as_view(), name="bank-send-all-claims"),
```

- [ ] **Step 3: Verify system check**

```bash
cd HusfelagPy && poetry run python3 manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 4: Commit**

```bash
cd HusfelagPy
git add associations/banks/views.py associations/urls.py
git commit -m "feat: add SendAllClaimsView POST /associations/{id}/bank/send-all-claims"
```

---

## Task 11: Adapt existing views

**Files:**
- Modify: `HusfelagPy/associations/banks/views.py` — replace stub bodies in `BankStatusView`, `BankDisconnectView`, `AdminBankHealthView`

- [ ] **Step 1: Replace BankStatusView stub**

Replace the stub `get()` method in `BankStatusView` with:

```python
class BankStatusView(APIView):
    """GET /associations/{id}/bank/status"""
    permission_classes = [IsAuthenticated]

    def get(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        configured = AssociationBankSettings.objects.filter(association=association).exists()

        # Last sync time: most recent GET audit log entry for this association
        last_sync = (
            association.bank_audit_logs
            .filter(http_method="GET")
            .order_by("-timestamp")
            .values_list("timestamp", flat=True)
            .first()
        )

        return Response({
            "configured": configured,
            "last_sync_at": last_sync.isoformat() if last_sync else None,
        })
```

- [ ] **Step 2: Replace BankDisconnectView stub**

Replace the stub `delete()` method in `BankDisconnectView` with:

```python
class BankDisconnectView(APIView):
    """DELETE /associations/{id}/bank/disconnect"""
    permission_classes = [IsAuthenticated]

    def delete(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        deleted_count, _ = AssociationBankSettings.objects.filter(association=association).delete()
        if deleted_count == 0:
            return Response(
                {"detail": "Engar bankastillingar til að hreinsa."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"detail": "Bankastillingar hreinsaðar."})
```

- [ ] **Step 3: Replace AdminBankHealthView stub**

Replace the stub `get()` method in `AdminBankHealthView` with:

```python
class AdminBankHealthView(APIView):
    """GET /admin/bank/health — superadmin only"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superadmin:
            return Response(
                {"detail": "Aðeins kerfisstjórar hafa aðgang."},
                status=status.HTTP_403_FORBIDDEN,
            )

        settings_qs = AssociationBankSettings.objects.select_related("association").all()
        total_configured = settings_qs.count()
        total_unsent_claims = BankClaim.objects.filter(status=BankClaimStatus.UNPAID).count()

        rows = []
        for bs in settings_qs.order_by("association__name"):
            last_sync = (
                bs.association.bank_audit_logs
                .filter(http_method="GET")
                .order_by("-timestamp")
                .values_list("timestamp", flat=True)
                .first()
            )
            rows.append({
                "association_id": bs.association.id,
                "association_name": bs.association.name,
                "template_id": bs.template_id,
                "last_sync_at": last_sync.isoformat() if last_sync else None,
                "unsent_claims": BankClaim.objects.filter(
                    collection__budget__association=bs.association,
                    status=BankClaimStatus.UNPAID,
                ).count(),
            })

        return Response({
            "summary": {
                "configured_associations": total_configured,
                "total_unsent_claims": total_unsent_claims,
            },
            "associations": rows,
        })
```

- [ ] **Step 4: Verify system check**

```bash
cd HusfelagPy && poetry run python3 manage.py check
```

Expected: `System check identified no issues (0 silenced).`

- [ ] **Step 5: Run all tests**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/ -v
```

Expected: All PASS.

- [ ] **Step 6: Commit**

```bash
cd HusfelagPy
git add associations/banks/views.py
git commit -m "feat: adapt BankStatusView, BankDisconnectView, AdminBankHealthView for Customer API"
```

---

## Task 12: Frontend — rewrite BankSettingsPage

**Files:**
- Rewrite: `HusfelagJS/src/controlers/BankSettingsPage.js`

The new page has two cards:
1. **Platform connection** — read-only; shows green "Tengt" if `configured: true`, grey otherwise with note about system admin setup.
2. **Template settings** — text field for `template_id`, "Vista" button. Shown only if CHAIR/CFO/superadmin.

- [ ] **Step 1: Rewrite BankSettingsPage.js**

Replace the entire contents of `HusfelagJS/src/controlers/BankSettingsPage.js` with:

```javascript
import React, { useContext, useEffect, useState } from 'react';
import {
  Box, Typography, Button, Alert, CircularProgress,
  Card, CardContent, Chip, TextField,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SyncIcon from '@mui/icons-material/Sync';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';
import SideBar from './Sidebar';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

export default function BankSettingsPage() {
  const { user, currentAssociation } = useContext(UserContext);
  const [status, setStatus] = useState(null);
  const [bankSettings, setBankSettings] = useState(null);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

  const assocId = currentAssociation?.id;
  const canManageBank = ['Formaður', 'Gjaldkeri', 'Kerfisstjóri'].includes(currentAssociation?.role);

  useEffect(() => {
    if (!assocId) return;
    fetchAll();
  }, [assocId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAll() {
    setLoading(true);
    try {
      const [statusResp, settingsResp] = await Promise.all([
        apiFetch(`${API_URL}/associations/${assocId}/bank/status`),
        apiFetch(`${API_URL}/associations/${assocId}/bank/settings`),
      ]);
      if (statusResp.ok) setStatus(await statusResp.json());
      if (settingsResp.ok) {
        const s = await settingsResp.json();
        setBankSettings(s);
        setTemplateId(s.template_id || '');
      }
    } catch {
      // leave defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSettings() {
    setSaving(true);
    setMessage(null);
    try {
      const resp = await apiFetch(`${API_URL}/associations/${assocId}/bank/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setBankSettings(data);
        setTemplateId(data.template_id);
        setMessage({ type: 'success', text: 'Bankastillingar vistaðar.' });
      } else {
        const err = await resp.json();
        setMessage({ type: 'error', text: err.detail || 'Villa við vistun.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Tenging við þjón mistókst.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      await apiFetch(`${API_URL}/admin/associations/${assocId}/bank/sync`, { method: 'POST' });
      setMessage({ type: 'success', text: 'Samstilling hafin í bakgrunni.' });
    } catch {
      setMessage({ type: 'error', text: 'Villa við samstillingu.' });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) {
    return (
      <div className="dashboard">
        <SideBar />
        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <SideBar />
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <Box sx={{ px: 3, py: 2, background: '#fff', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
          <Typography variant="h5">Bankastillingar</Typography>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>

          {message && (
            <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
              {message.text}
            </Alert>
          )}

          {/* Platform connection status */}
          <Card variant="outlined" sx={{ mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <AccountBalanceIcon />
                <Typography variant="h6">Landsbankinn tenging</Typography>
                {status?.configured ? (
                  <Chip label="Tengt" color="success" size="small" sx={{ ml: 'auto' }} />
                ) : (
                  <Chip label="Ekki stillt" size="small" sx={{ ml: 'auto' }} />
                )}
              </Box>
              {status?.configured ? (
                <Typography variant="body2" color="text.secondary">
                  Kerfisskírteinið er gilt og tenging virk.
                  {status.last_sync_at && (
                    <> Síðast samstillt: {new Date(status.last_sync_at).toLocaleString('is-IS')}.</>
                  )}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Samskipti við Landsbankinn eru stillt af kerfisstjóra.
                </Typography>
              )}
              {user?.is_superadmin && (
                <Box sx={{ mt: 2 }}>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={handleManualSync}
                    disabled={syncing}
                    startIcon={syncing ? <CircularProgress size={14} /> : <SyncIcon />}
                  >
                    Samstilla núna
                  </Button>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Template settings — CHAIR/CFO/superadmin only */}
          {canManageBank && (
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" sx={{ mb: 1 }}>Sniðmát krafna</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                  Sniðmáts-ID frá Landsbankanum. Þarf að vera stillt til að geta sent kröfur.
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                  <TextField
                    label="Sniðmáts-ID"
                    value={templateId}
                    onChange={e => setTemplateId(e.target.value)}
                    size="small"
                    sx={{ minWidth: 220 }}
                  />
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleSaveSettings}
                    disabled={saving || !templateId.trim()}
                  >
                    Vista
                  </Button>
                </Box>
                {bankSettings?.updated_at && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Síðast uppfært: {new Date(bankSettings.updated_at).toLocaleString('is-IS')}
                  </Typography>
                )}
              </CardContent>
            </Card>
          )}

        </Box>
      </Box>
    </div>
  );
}
```

- [ ] **Step 2: Verify no lint errors**

```bash
cd HusfelagJS && npm run build 2>&1 | grep -E "Warning|Error" | head -20
```

Expected: No errors referencing `BankSettingsPage.js`.

- [ ] **Step 3: Commit**

```bash
cd HusfelagJS
git add src/controlers/BankSettingsPage.js
git commit -m "feat: rewrite BankSettingsPage for Customer API (template config, read-only platform status)"
```

---

## Task 13: Frontend — add claim column to CollectionPage

**Files:**
- Modify: `HusfelagJS/src/ui/chips.js` — add claim status entries
- Modify: `HusfelagJS/src/controlers/CollectionPage.js` — add Krafa column, sendClaim handler, batch "Senda allar" button

The collection API (`GET /Collection/{user_id}`) will need to return `bank_claim` data per row. This task modifies the frontend; the backend serializer change is noted below.

**Backend serializer prerequisite:** Before this task is tested end-to-end, add `bank_claim` to the collection row serializer. In `HusfelagPy/associations/views.py`, find the collection row serialization logic and add:

```python
"claim_status": collection.bank_claim.status if hasattr(collection, 'bank_claim') else None,
"claim_id": collection.bank_claim.claim_id if hasattr(collection, 'bank_claim') else None,
```

Find the dict-building loop in `CollectionView.get()` and add these two keys. Also add `bank_settings_configured` to the top-level response so the frontend knows whether the "Senda kröfu" button should be enabled:

In the top-level response dict, add:
```python
"bank_settings_configured": AssociationBankSettings.objects.filter(association=association).exists(),
```

This requires importing `AssociationBankSettings` in `associations/views.py`:
```python
from associations.models import (
    ...,
    AssociationBankSettings,
)
```

- [ ] **Step 1: Add claim status styles to chips.js**

In `HusfelagJS/src/ui/chips.js`, extend the `CHIP_STYLES` object:

```javascript
const CHIP_STYLES = {
    CATEGORISED:     { bg: '#f3f4f6', color: '#555',    label: 'Flokkað'        },
    IMPORTED:        { bg: '#fff8e1', color: '#e65100',  label: 'Óflokkað'       },
    RECONCILED:      { bg: '#e8f4fd', color: '#1565c0',  label: 'Jafnað'         },
    PAID:            { bg: '#e8f5e9', color: '#2e7d32',  label: 'Greitt'         },
    UNPAID:          { bg: '#fff3e0', color: '#e65100',  label: 'Ógreitt'        },
    CLAIM_UNPAID:    { bg: '#fff8e1', color: '#f57c00',  label: 'Sent — Ógreitt' },
    CLAIM_PAID:      { bg: '#e8f5e9', color: '#2e7d32',  label: 'Greitt'         },
    CLAIM_CANCELLED: { bg: '#f3f4f6', color: '#555',     label: 'Afturkallað'    },
};
```

- [ ] **Step 2: Add bank_settings_configured state and sendClaim handler to CollectionPage**

In `HusfelagJS/src/controlers/CollectionPage.js`:

1. Add `secondaryButtonSx` to the existing button import:
   ```javascript
   import { ghostButtonSx, primaryButtonSx, secondaryButtonSx } from '../ui/buttons';
   ```

2. Add `{ StatusChip }` already imported — also add `{ LabelChip }`:
   ```javascript
   import { StatusChip, LabelChip } from '../ui/chips';
   ```
   (LabelChip is already exported from chips.js — it's used as a convenience alias here; we'll use StatusChip with CLAIM_ prefixes instead.)

3. Add state variable after `const [matchError, setMatchError] = useState('');`:
   ```javascript
   const [bankConfigured, setBankConfigured] = useState(false);
   const [claimMessage, setClaimMessage] = useState(null);
   ```

4. In the `load` callback, after `setData(d)` (where `d` is the parsed JSON), also set:
   ```javascript
   .then(d => {
       setData(d);
       setBankConfigured(d.bank_settings_configured ?? false);
   })
   ```

5. Add the `handleSendClaim` function after `handleMatch`:
   ```javascript
   const handleSendClaim = (collectionId) => {
       setClaimMessage(null);
       apiFetch(`${API_URL}/Collection/${collectionId}/send-claim`, { method: 'POST' })
           .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.detail || 'Villa')))
           .then(() => {
               load();
               setClaimMessage({ type: 'success', text: 'Krafa send.' });
           })
           .catch(err => setClaimMessage({ type: 'error', text: typeof err === 'string' ? err : 'Villa við sendingu.' }));
   };

   const handleSendAllClaims = () => {
       setClaimMessage(null);
       apiFetch(`${API_URL}/associations/${currentAssociation?.id}/bank/send-all-claims?month=${month}&year=${year}`, {
           method: 'POST',
       })
           .then(r => r.ok ? r.json() : r.json().then(d => Promise.reject(d.detail || 'Villa')))
           .then(d => {
               load();
               setClaimMessage({ type: 'success', text: `${d.sent} kröfur sendar, ${d.skipped} sleppt.` });
           })
           .catch(err => setClaimMessage({ type: 'error', text: typeof err === 'string' ? err : 'Villa við sendingu.' }));
   };
   ```

6. Add `currentAssociation` to the UserContext destructure:
   ```javascript
   const { user, assocParam, currentAssociation } = React.useContext(UserContext);
   ```

- [ ] **Step 3: Add Krafa column to the table**

In the table `<TableHead>`, after the "Staða" column header, add before the last empty `<TableCell />`:
```javascript
<TableCell align="center" sx={HEAD_CELL_SX}>Krafa</TableCell>
```

In the table `<TableBody>` row, after the status `<TableCell>`, add a new cell:
```javascript
<TableCell align="center" sx={{ width: 140, pr: 1 }}>
    {row.claim_status === 'UNPAID' && (
        <StatusChip status="CLAIM_UNPAID" />
    )}
    {row.claim_status === 'PAID' && (
        <StatusChip status="CLAIM_PAID" />
    )}
    {row.claim_status === 'CANCELLED' && (
        <StatusChip status="CLAIM_CANCELLED" />
    )}
    {!row.claim_status && (
        <Tooltip title={
            !bankConfigured
                ? 'Þú þarft að stilla Landsbankinn sniðmát áður en hægt er að senda kröfur.'
                : 'Senda kröfu'
        }>
            <span>
                <Button
                    size="small"
                    sx={{ ...secondaryButtonSx, fontSize: 11, py: 0.25, px: 1 }}
                    onClick={() => handleSendClaim(row.collection_id)}
                    disabled={!bankConfigured}
                >
                    Senda kröfu
                </Button>
            </span>
        </Tooltip>
    )}
</TableCell>
```

Also update the `<TableFooter>` row `colSpan` values to account for the new column: change `colSpan={3}` to `colSpan={3}` (unchanged), and add an empty `<TableCell />` for the Krafa column before the last action `<TableCell />`.

- [ ] **Step 4: Add "Senda allar" button and claim message in the header**

In the header box (Zone 1), after the existing "Búa til" button and before the help `<IconButton>`, add:
```javascript
{hasItems && bankConfigured && (
    <Button
        variant="outlined"
        size="small"
        sx={secondaryButtonSx}
        onClick={handleSendAllClaims}
        disabled={rows.every(r => r.claim_status)}
    >
        Senda allar kröfur
    </Button>
)}
```

After the `{error && ...}` alert in Zone 3 content, add:
```javascript
{claimMessage && (
    <Alert severity={claimMessage.type} sx={{ mb: 2 }} onClose={() => setClaimMessage(null)}>
        {claimMessage.text}
    </Alert>
)}
```

- [ ] **Step 5: Add bank_settings_configured to CollectionView response (backend)**

In `HusfelagPy/associations/views.py`, find `CollectionView.get()`. In the response dict, add:
```python
"bank_settings_configured": AssociationBankSettings.objects.filter(association=association).exists(),
```

Also, in the collection row dict-building loop, add:
```python
"claim_status": row.bank_claim.status if hasattr(row, 'bank_claim') and row.bank_claim else None,
"claim_id": row.bank_claim.claim_id if hasattr(row, 'bank_claim') and row.bank_claim else None,
```

Add the import to `associations/views.py`:
```python
from associations.models import (
    ...,  # existing imports
    AssociationBankSettings, BankClaim,
)
```

The query in `CollectionView.get()` should prefetch bank claims. Find the queryset and add `prefetch_related('bank_claim')`:
```python
collections = Collection.objects.filter(...).select_related(...).prefetch_related('bank_claim')
```

Note: Since `bank_claim` is a OneToOneField with a `related_name="bank_claim"`, accessing `row.bank_claim` will raise `RelatedObjectDoesNotExist` if no claim exists. Use a try/except or `hasattr` wrapper:
```python
try:
    claim_status = row.bank_claim.status
    claim_id = row.bank_claim.claim_id
except Exception:
    claim_status = None
    claim_id = None
```

Then in the row dict:
```python
"claim_status": claim_status,
"claim_id": claim_id,
```

- [ ] **Step 6: Verify no build errors**

```bash
cd HusfelagJS && npm run build 2>&1 | grep -E "^(ERROR|Warning.*CollectionPage)" | head -10
```

Expected: No errors from `CollectionPage.js`.

- [ ] **Step 7: Run all backend tests**

```bash
cd HusfelagPy && poetry run pytest associations/banks/tests/ -v
```

Expected: All PASS.

- [ ] **Step 8: Commit both frontend and backend changes together**

```bash
# Backend
cd HusfelagPy
git add associations/views.py
git commit -m "feat: add bank_claim status and bank_settings_configured to CollectionView response"

# Frontend
cd ../HusfelagJS
git add src/ui/chips.js src/controlers/CollectionPage.js
git commit -m "feat: add claim column, send-claim button, and batch send-all to CollectionPage"
```

---

## Self-Review

### Spec Coverage

| Spec requirement | Task |
|---|---|
| Delete oauth_client.py, BankConsent, BankConnectView, BankCallbackView | Task 2, 4 |
| Delete check_consent_expiry task | Task 2 |
| Delete BankAuthCallback.js, /bank/callback route | Task 3 |
| BankTokenCache model | Task 4 |
| AssociationBankSettings model | Task 4 |
| BankClaim model | Task 4 |
| mTLS env vars (CERT_PATH, CERT_PASSWORD, API_KEY, AUTH_URL, API_BASE) | Task 5 |
| Remove old PSD2 env vars | Task 5 |
| requests-pkcs12 dependency | Task 5 |
| get_access_token() with 60s buffer | Task 6 |
| _get() / _post() helpers | Task 6 |
| Dynamic date range: last_tx - 1 day / Jan 1 fallback | Task 7 |
| Paginated transaction sync | Task 6 (sync_account_transactions) |
| sync_claim_statuses Celery task | Task 7 |
| sync_all_claim_statuses Celery task | Task 7 |
| CELERY_BEAT_SCHEDULE updated | Task 5 |
| AssociationBankSettingsView GET/POST | Task 8 |
| SendClaimView POST /Collection/{id}/send-claim | Task 9 |
| SendAllClaimsView POST /associations/{id}/bank/send-all-claims | Task 10 |
| BankStatusView returns configured/last_sync_at | Task 11 |
| BankDisconnectView clears AssociationBankSettings | Task 11 |
| AdminBankHealthView without consent columns | Task 11 |
| BankSettingsPage rewrite (read-only platform card, template field) | Task 12 |
| Collections "Krafa" column with per-row claim status | Task 13 |
| "Senda allar" batch button | Task 13 |
| bank_settings_configured in CollectionView response | Task 13 |

### Type Consistency

- `BankClaimStatus.UNPAID/PAID/CANCELLED` used consistently in `models.py`, `tasks.py`, `views.py`
- `_last_day_of_month(year, month)` defined in `landsbankinn.py`, imported by `views.py` in Tasks 9, 10
- `sync_account_transactions(account, from_date, to_date)` defined in `landsbankinn.py`, imported by `tasks.py` in Task 7
- `create_claim(collection, settings_obj)` defined in `landsbankinn.py`, imported by `views.py` in Tasks 9, 10
- `get_claim_status(claim_id)` defined in `landsbankinn.py`, used in `tasks.py` in Task 7
- `AssociationBankSettings` added to `models.py` in Task 4, imported in `views.py` Tasks 8–13
