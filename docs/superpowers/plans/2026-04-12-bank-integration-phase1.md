# Bank Integration Phase 1 — Landsbankinn AIS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Landsbankinn AIS (Account Information Services) into Húsfjelag — automated daily transaction sync, OAuth consent management, expiry notifications, and a superadmin bank health dashboard.

**Architecture:** A `banks/` module inside `associations/` follows the `skattur_cloud.py` pattern — thin provider files behind a `BankProvider` ABC. New Django models (`BankConsent`, `BankApiAuditLog`, `BankNotificationLog`) live in `associations/models.py`. Celery beat handles daily sync and consent-expiry checks.

**Tech Stack:** Python 3.10, Django 4.1, DRF 3.14, Celery 5 + django-celery-beat, cryptography (Fernet), Redis, React 17, MUI v5.

**Spec:** `docs/superpowers/specs/2026-04-12-bank-integration-design.md`

---

## File Map

### Backend — create
- `associations/banks/__init__.py` — package marker
- `associations/banks/base_provider.py` — `BankProvider` ABC
- `associations/banks/consent_store.py` — Fernet encrypt/decrypt helpers
- `associations/banks/oauth_client.py` — PKCE generation + Redis state management
- `associations/banks/audit.py` — `log_api_call()` and `log_notification()` helpers
- `associations/banks/landsbankinn.py` — Landsbankinn PSD2 client implementing `BankProvider`
- `associations/banks/tasks.py` — Celery tasks: `sync_transactions`, `sync_all_associations`, `check_consent_expiry`
- `associations/banks/views.py` — bank API views
- `HusfelagJS/src/controlers/BankAuthCallback.js` — handles `/bank/callback?status=` redirect
- `HusfelagJS/src/controlers/BankSettingsPage.js` — CHAIR/CFO bank management page
- `HusfelagJS/src/controlers/BankHealthPage.js` — superadmin bank health dashboard

### Backend — modify
- `associations/models.py` — add `BankConsent`, `BankApiAuditLog`, `BankNotificationLog`; add `source` + `external_id` to `Transaction`
- `associations/urls.py` — add bank URL patterns
- `config/settings/base.py` — add `BANK_FERNET_KEY`, feature flags, `django_celery_beat` to `INSTALLED_APPS`, celery beat schedule
- `config/settings/dev.py` — add sandbox URLs and dev bank settings
- `HusfelagPy/.env` — add `BANK_FERNET_KEY`, `BANK_LANDSBANKINN_CLIENT_ID`, `BANK_LANDSBANKINN_CLIENT_SECRET`, `BANK_LANDSBANKINN_REDIRECT_URI`
- `HusfelagJS/src/App.js` — add three new routes
- `HusfelagJS/src/controlers/Sidebar.js` — superadmin collapsible sub-menu

### Tests — add classes to
- `associations/tests.py` — `BankConsentStoreTest`, `BankOAuthClientTest`, `LandsbankinnClientTest`, `BankTasksTest`, `BankViewsTest`

---

## Task 1: Add dependencies

**Files:**
- Modify: `HusfelagPy/pyproject.toml`

- [ ] **Step 1: Add cryptography and django-celery-beat to pyproject.toml**

Open `HusfelagPy/pyproject.toml`. In the `[project]` `dependencies` list add:

```toml
    "cryptography>=42.0",
    "django-celery-beat>=2.6",
```

- [ ] **Step 2: Install new dependencies**

```bash
cd HusfelagPy
poetry install
```

Expected: resolves without errors, `cryptography` and `django_celery_beat` appear in the lock file.

- [ ] **Step 3: Commit**

```bash
git add HusfelagPy/pyproject.toml HusfelagPy/poetry.lock
git commit -m "chore: add cryptography and django-celery-beat dependencies"
```

---

## Task 2: Settings and feature flags

**Files:**
- Modify: `HusfelagPy/config/settings/base.py`
- Modify: `HusfelagPy/config/settings/dev.py`

- [ ] **Step 1: Add django_celery_beat to INSTALLED_APPS in base.py**

In `config/settings/base.py`, add `"django_celery_beat"` to `INSTALLED_APPS`:

```python
INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "django_celery_beat",
    "users",
    "associations",
]
```

- [ ] **Step 2: Add bank settings to base.py**

At the end of `config/settings/base.py`, add:

```python
# ── Bank integration ──────────────────────────────────────────────────────────
BANK_FERNET_KEY = env("BANK_FERNET_KEY", default="")

# Feature flags — set to True per bank once sandbox credentials are in place
BANK_LANDSBANKINN_ENABLED = env.bool("BANK_LANDSBANKINN_ENABLED", default=False)
BANK_ARION_ENABLED = env.bool("BANK_ARION_ENABLED", default=False)
BANK_ISLANDSBANKI_ENABLED = env.bool("BANK_ISLANDSBANKI_ENABLED", default=False)

BANK_LANDSBANKINN_CLIENT_ID = env("BANK_LANDSBANKINN_CLIENT_ID", default="")
BANK_LANDSBANKINN_CLIENT_SECRET = env("BANK_LANDSBANKINN_CLIENT_SECRET", default="")
BANK_LANDSBANKINN_REDIRECT_URI = env(
    "BANK_LANDSBANKINN_REDIRECT_URI",
    default="http://localhost:8000/bank/callback/landsbankinn",
)
BANK_LANDSBANKINN_API_BASE = env(
    "BANK_LANDSBANKINN_API_BASE",
    default="https://psd2.landsbanki.is/sandbox/v1",
)
BANK_LANDSBANKINN_AUTH_URL = env(
    "BANK_LANDSBANKINN_AUTH_URL",
    default="https://psd2.landsbanki.is/sandbox/oauth2/auth",
)
BANK_LANDSBANKINN_TOKEN_URL = env(
    "BANK_LANDSBANKINN_TOKEN_URL",
    default="https://psd2.landsbanki.is/sandbox/oauth2/token",
)

# Celery beat — periodic tasks
from celery.schedules import crontab
CELERY_BEAT_SCHEDULE = {
    "sync-all-bank-transactions": {
        "task": "associations.banks.tasks.sync_all_associations",
        "schedule": crontab(hour=3, minute=0),  # 03:00 daily
    },
    "check-consent-expiry": {
        "task": "associations.banks.tasks.check_consent_expiry",
        "schedule": crontab(hour=4, minute=0),  # 04:00 daily
    },
}
```

- [ ] **Step 3: Commit**

```bash
git add HusfelagPy/config/settings/base.py
git commit -m "chore: add bank integration settings and celery beat schedule"
```

---

## Task 3: Bank models

**Files:**
- Modify: `HusfelagPy/associations/models.py`

- [ ] **Step 1: Write the failing test**

At the bottom of `associations/tests.py`, add:

```python
class BankConsentModelTest(TestCase):
    def setUp(self):
        self.association = Association.objects.create(
            ssn="1234567891", name="Banka Húsfélag",
            address="Bankagata 1", postal_code="101", city="Reykjavík"
        )

    def test_one_consent_per_association(self):
        from .models import BankConsent
        BankConsent.objects.create(
            association=self.association,
            bank="LANDSBANKINN",
            consent_id="c-001",
            access_token="tok",
            token_expires_at=datetime.datetime(2026, 7, 1, tzinfo=datetime.timezone.utc),
            consent_expires_at=datetime.date(2026, 7, 11),
        )
        from django.db import IntegrityError
        with self.assertRaises(IntegrityError):
            BankConsent.objects.create(
                association=self.association,
                bank="ARION",
                consent_id="c-002",
                access_token="tok2",
                token_expires_at=datetime.datetime(2026, 7, 1, tzinfo=datetime.timezone.utc),
                consent_expires_at=datetime.date(2026, 7, 11),
            )

    def test_transaction_source_field(self):
        from .models import TransactionSource
        bank_account = BankAccount.objects.create(
            association=self.association, name="Aðalreikningur", account_number="0101-26-123456"
        )
        tx = Transaction.objects.create(
            bank_account=bank_account,
            date=datetime.date(2026, 4, 1),
            amount=Decimal("1000.00"),
            description="Test",
            source=TransactionSource.BANK_SYNC,
            external_id="ext-001",
        )
        self.assertEqual(tx.source, TransactionSource.BANK_SYNC)
        self.assertEqual(tx.external_id, "ext-001")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankConsentModelTest -v 2
```

Expected: ImportError or AttributeError — `BankConsent` and `TransactionSource` do not exist yet.

- [ ] **Step 3: Add models to associations/models.py**

At the top of `associations/models.py`, add `import datetime` if not already present (check first).

After the `Transaction` class, add `TransactionSource` and update `Transaction`. Find the `Transaction` model and add two fields inside it:

```python
class TransactionSource(models.TextChoices):
    MANUAL    = "MANUAL",    "Handvirkt"
    BANK_SYNC = "BANK_SYNC", "Bankajöfnun"
```

Inside the `Transaction` model class, after the `created_at` field, add:

```python
    source      = models.CharField(
        max_length=10, choices=TransactionSource.choices,
        default=TransactionSource.MANUAL,
    )
    external_id = models.CharField(max_length=255, blank=True, default="")
```

After the `Transaction` class definition add the three new bank models:

```python
class BankChoice(models.TextChoices):
    LANDSBANKINN = "LANDSBANKINN", "Landsbankinn"
    ARION        = "ARION",        "Arion"
    ISLANDSBANKI = "ISLANDSBANKI", "Íslandsbanki"


class BankConsent(models.Model):
    association      = models.OneToOneField(
        Association, on_delete=models.CASCADE, related_name="bank_consent"
    )
    bank             = models.CharField(max_length=20, choices=BankChoice.choices)
    consent_id       = models.CharField(max_length=255, blank=True)
    access_token     = models.TextField()          # Fernet-encrypted
    refresh_token    = models.TextField(blank=True)  # Fernet-encrypted
    token_expires_at = models.DateTimeField()
    consent_expires_at = models.DateField()
    is_active        = models.BooleanField(default=True)
    renewal_notified_at = models.DateTimeField(null=True, blank=True)
    created_at       = models.DateTimeField(auto_now_add=True)
    updated_at       = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "associations_bankconsent"

    def __str__(self):
        return f"{self.association} — {self.bank}"


class BankApiAuditLog(models.Model):
    association = models.ForeignKey(
        Association, on_delete=models.CASCADE, related_name="bank_audit_logs"
    )
    user        = models.ForeignKey(
        "users.User", null=True, blank=True,
        on_delete=models.SET_NULL, related_name="bank_audit_logs"
    )
    bank        = models.CharField(max_length=20, choices=BankChoice.choices)
    endpoint    = models.CharField(max_length=500)
    http_method = models.CharField(max_length=10)
    status_code = models.IntegerField()
    timestamp   = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "associations_bankapiauditlog"
        ordering = ["-timestamp"]

    def __str__(self):
        return f"{self.bank} {self.http_method} {self.endpoint} → {self.status_code}"


class BankNotificationLog(models.Model):
    class NotificationType(models.TextChoices):
        CONSENT_EXPIRY = "CONSENT_EXPIRY", "Samþykki rennur út"

    association       = models.ForeignKey(
        Association, on_delete=models.CASCADE, related_name="bank_notification_logs"
    )
    notification_type = models.CharField(max_length=30, choices=NotificationType.choices)
    recipients        = models.JSONField()   # list of email strings
    sent_at           = models.DateTimeField(auto_now_add=True)
    success           = models.BooleanField()
    error             = models.TextField(blank=True)

    class Meta:
        db_table = "associations_banknotificationlog"
        ordering = ["-sent_at"]

    def __str__(self):
        return f"{self.association} — {self.notification_type} ({'ok' if self.success else 'failed'})"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankConsentModelTest -v 2
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add HusfelagPy/associations/models.py HusfelagPy/associations/tests.py
git commit -m "feat: add BankConsent, BankApiAuditLog, BankNotificationLog models and Transaction source/external_id"
```

---

## Task 4: Migrations

**Files:**
- Create: `HusfelagPy/associations/migrations/XXXX_bank_models.py` (auto-generated)

- [ ] **Step 1: Generate migration**

```bash
cd HusfelagPy
poetry run python3 manage.py makemigrations associations --name bank_models
```

Expected: creates `associations/migrations/XXXX_bank_models.py` with `CreateModel` for `BankConsent`, `BankApiAuditLog`, `BankNotificationLog` and `AddField` for `Transaction.source`, `Transaction.external_id`.

- [ ] **Step 2: Generate django-celery-beat migrations**

```bash
poetry run python3 manage.py migrate
```

Expected: applies new associations migration + all django_celery_beat migrations without errors.

- [ ] **Step 3: Commit**

```bash
git add HusfelagPy/associations/migrations/
git commit -m "feat: migration for bank models and transaction source fields"
```

---

## Task 5: Fernet helpers

**Files:**
- Create: `HusfelagPy/associations/banks/__init__.py`
- Create: `HusfelagPy/associations/banks/consent_store.py`

- [ ] **Step 1: Write the failing test**

In `associations/tests.py`, add:

```python
class BankConsentStoreTest(TestCase):
    def test_encrypt_decrypt_round_trip(self):
        from django.test.utils import override_settings
        from cryptography.fernet import Fernet
        key = Fernet.generate_key().decode()
        with override_settings(BANK_FERNET_KEY=key):
            from associations.banks.consent_store import encrypt_token, decrypt_token
            original = "super-secret-access-token"
            encrypted = encrypt_token(original)
            self.assertNotEqual(encrypted, original)
            self.assertEqual(decrypt_token(encrypted), original)

    def test_encrypt_produces_different_ciphertext_each_time(self):
        from django.test.utils import override_settings
        from cryptography.fernet import Fernet
        key = Fernet.generate_key().decode()
        with override_settings(BANK_FERNET_KEY=key):
            from associations.banks.consent_store import encrypt_token
            # Fernet uses random IV so same plaintext → different ciphertext
            enc1 = encrypt_token("token")
            enc2 = encrypt_token("token")
            self.assertNotEqual(enc1, enc2)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankConsentStoreTest -v 2
```

Expected: ModuleNotFoundError — `associations.banks.consent_store` does not exist.

- [ ] **Step 3: Create package and consent_store.py**

Create `associations/banks/__init__.py` (empty):

```python
```

Create `associations/banks/consent_store.py`:

```python
from cryptography.fernet import Fernet
from django.conf import settings


def _fernet() -> Fernet:
    key = settings.BANK_FERNET_KEY
    if not key:
        raise RuntimeError("BANK_FERNET_KEY is not configured")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(value: str) -> str:
    """Encrypt a plaintext token string. Returns base64-encoded ciphertext."""
    return _fernet().encrypt(value.encode()).decode()


def decrypt_token(value: str) -> str:
    """Decrypt a Fernet-encrypted token string."""
    return _fernet().decrypt(value.encode()).decode()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankConsentStoreTest -v 2
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add HusfelagPy/associations/banks/
git commit -m "feat: Fernet token encryption helpers in banks/consent_store.py"
```

---

## Task 6: BankProvider ABC

**Files:**
- Create: `HusfelagPy/associations/banks/base_provider.py`

- [ ] **Step 1: Create base_provider.py**

```python
from abc import ABC, abstractmethod
from datetime import date


class BankProvider(ABC):
    """
    Abstract base for all bank integrations.
    Each bank (Landsbankinn, Arion, Íslandsbanki) implements this interface.
    """

    @abstractmethod
    def get_authorization_url(self, state: str, code_challenge: str) -> str:
        """Return the full OAuth2 authorization URL to redirect the user to."""

    @abstractmethod
    def exchange_code(self, code: str, code_verifier: str) -> dict:
        """
        Exchange an authorization code for tokens.
        Returns dict with keys: access_token, refresh_token (optional),
        expires_in (seconds), consent_id.
        """

    @abstractmethod
    def get_transactions(
        self, consent, from_date: date, to_date: date
    ) -> list[dict]:
        """
        Fetch booked transactions for all accounts under this consent.
        Returns list of dicts, each with keys:
          account_id, external_id, date, amount (Decimal), description, reference.
        `consent` is a BankConsent model instance — access_token decrypted by caller.
        """

    @abstractmethod
    def get_balance(self, consent, account_id: str) -> dict:
        """
        Fetch balance for a single account.
        Returns dict with keys: account_id, amount (Decimal), currency.
        `consent` is a BankConsent model instance — access_token decrypted by caller.
        """

    def create_claim(self, *args, **kwargs):
        """Claim (kröfu) creation — pending partner agreement with bank."""
        raise NotImplementedError(
            "Kröfustofnun bíður samnings við bankann. "
            "Notaðu PDF kröfu í bili."
        )
```

- [ ] **Step 2: Commit**

```bash
git add HusfelagPy/associations/banks/base_provider.py
git commit -m "feat: BankProvider ABC"
```

---

## Task 7: PKCE OAuth helpers

**Files:**
- Create: `HusfelagPy/associations/banks/oauth_client.py`

- [ ] **Step 1: Write the failing test**

In `associations/tests.py`, add:

```python
class BankOAuthClientTest(TestCase):
    def test_pkce_pair_lengths(self):
        from associations.banks.oauth_client import generate_pkce_pair
        verifier, challenge = generate_pkce_pair()
        # Verifier: 43-128 chars (RFC 7636)
        self.assertGreaterEqual(len(verifier), 43)
        self.assertLessEqual(len(verifier), 128)
        # Challenge is base64url (no padding)
        self.assertNotIn("=", challenge)
        self.assertNotIn("+", challenge)
        self.assertNotIn("/", challenge)

    def test_pkce_challenge_is_sha256_of_verifier(self):
        import hashlib, base64
        from associations.banks.oauth_client import generate_pkce_pair
        verifier, challenge = generate_pkce_pair()
        expected = base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()
        ).rstrip(b"=").decode()
        self.assertEqual(challenge, expected)

    def test_store_and_pop_state(self):
        from unittest.mock import patch, MagicMock
        from associations.banks.oauth_client import store_oauth_state, pop_oauth_state
        fake_cache = {}
        with patch("associations.banks.oauth_client.cache") as mock_cache:
            mock_cache.set = lambda k, v, timeout: fake_cache.update({k: v})
            mock_cache.get = lambda k: fake_cache.get(k)
            mock_cache.delete = lambda k: fake_cache.pop(k, None)
            store_oauth_state("state-abc", {"association_id": 1, "bank": "LANDSBANKINN", "user_id": 5})
            result = pop_oauth_state("state-abc")
        self.assertEqual(result["association_id"], 1)
        self.assertEqual(result["bank"], "LANDSBANKINN")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankOAuthClientTest -v 2
```

Expected: ModuleNotFoundError — `associations.banks.oauth_client` does not exist.

- [ ] **Step 3: Create oauth_client.py**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankOAuthClientTest -v 2
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add HusfelagPy/associations/banks/oauth_client.py HusfelagPy/associations/tests.py
git commit -m "feat: PKCE generation and OAuth state management"
```

---

## Task 8: Audit logger

**Files:**
- Create: `HusfelagPy/associations/banks/audit.py`

- [ ] **Step 1: Create audit.py**

```python
from associations.models import BankApiAuditLog, BankNotificationLog


def log_api_call(
    *,
    association,
    bank: str,
    endpoint: str,
    http_method: str,
    status_code: int,
    user=None,
) -> None:
    """Write one row to BankApiAuditLog. Never raises — audit failures must not break the caller."""
    try:
        BankApiAuditLog.objects.create(
            association=association,
            user=user,
            bank=bank,
            endpoint=endpoint,
            http_method=http_method,
            status_code=status_code,
        )
    except Exception:
        pass


def log_notification(
    *,
    association,
    notification_type: str,
    recipients: list[str],
    success: bool,
    error: str = "",
) -> None:
    """Write one row to BankNotificationLog. Never raises."""
    try:
        BankNotificationLog.objects.create(
            association=association,
            notification_type=notification_type,
            recipients=recipients,
            success=success,
            error=error,
        )
    except Exception:
        pass
```

- [ ] **Step 2: Commit**

```bash
git add HusfelagPy/associations/banks/audit.py
git commit -m "feat: bank API and notification audit log helpers"
```

---

## Task 9: Landsbankinn client

**Files:**
- Create: `HusfelagPy/associations/banks/landsbankinn.py`

- [ ] **Step 1: Write the failing test**

In `associations/tests.py`, add:

```python
class LandsbankinnClientTest(TestCase):
    def _make_client(self):
        from django.test.utils import override_settings
        with override_settings(
            BANK_LANDSBANKINN_CLIENT_ID="test-client",
            BANK_LANDSBANKINN_CLIENT_SECRET="test-secret",
            BANK_LANDSBANKINN_REDIRECT_URI="http://localhost/bank/callback/landsbankinn",
            BANK_LANDSBANKINN_AUTH_URL="https://psd2.landsbanki.is/sandbox/oauth2/auth",
            BANK_LANDSBANKINN_TOKEN_URL="https://psd2.landsbanki.is/sandbox/oauth2/token",
            BANK_LANDSBANKINN_API_BASE="https://psd2.landsbanki.is/sandbox/v1",
        ):
            from associations.banks.landsbankinn import LandsbankinnProvider
            return LandsbankinnProvider()

    def test_get_authorization_url_contains_required_params(self):
        from django.test.utils import override_settings
        with override_settings(
            BANK_LANDSBANKINN_CLIENT_ID="test-client",
            BANK_LANDSBANKINN_CLIENT_SECRET="test-secret",
            BANK_LANDSBANKINN_REDIRECT_URI="http://localhost/bank/callback/landsbankinn",
            BANK_LANDSBANKINN_AUTH_URL="https://psd2.landsbanki.is/sandbox/oauth2/auth",
            BANK_LANDSBANKINN_TOKEN_URL="https://psd2.landsbanki.is/sandbox/oauth2/token",
            BANK_LANDSBANKINN_API_BASE="https://psd2.landsbanki.is/sandbox/v1",
        ):
            from associations.banks.landsbankinn import LandsbankinnProvider
            provider = LandsbankinnProvider()
            url = provider.get_authorization_url(state="test-state", code_challenge="test-challenge")
        self.assertIn("state=test-state", url)
        self.assertIn("code_challenge=test-challenge", url)
        self.assertIn("code_challenge_method=S256", url)
        self.assertIn("client_id=test-client", url)
        self.assertIn("response_type=code", url)

    @patch("associations.banks.landsbankinn.requests.post")
    def test_exchange_code_returns_token_dict(self, mock_post):
        from django.test.utils import override_settings
        mock_post.return_value.json.return_value = {
            "access_token": "at-123",
            "refresh_token": "rt-456",
            "expires_in": 3600,
        }
        mock_post.return_value.status_code = 200
        mock_post.return_value.raise_for_status = lambda: None
        with override_settings(
            BANK_LANDSBANKINN_CLIENT_ID="test-client",
            BANK_LANDSBANKINN_CLIENT_SECRET="test-secret",
            BANK_LANDSBANKINN_REDIRECT_URI="http://localhost/bank/callback/landsbankinn",
            BANK_LANDSBANKINN_AUTH_URL="https://psd2.landsbanki.is/sandbox/oauth2/auth",
            BANK_LANDSBANKINN_TOKEN_URL="https://psd2.landsbanki.is/sandbox/oauth2/token",
            BANK_LANDSBANKINN_API_BASE="https://psd2.landsbanki.is/sandbox/v1",
        ):
            from associations.banks.landsbankinn import LandsbankinnProvider
            provider = LandsbankinnProvider()
            result = provider.exchange_code(code="code-xyz", code_verifier="verifier-abc")
        self.assertEqual(result["access_token"], "at-123")
        self.assertEqual(result["refresh_token"], "rt-456")
        self.assertIn("expires_in", result)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.LandsbankinnClientTest -v 2
```

Expected: ModuleNotFoundError — `associations.banks.landsbankinn` does not exist.

- [ ] **Step 3: Create landsbankinn.py**

```python
import uuid
from datetime import date, datetime, timezone, timedelta
from decimal import Decimal
from urllib.parse import urlencode

import requests
from django.conf import settings

from .base_provider import BankProvider
from .audit import log_api_call
from .consent_store import decrypt_token

BANK = "LANDSBANKINN"


class LandsbankinnProvider(BankProvider):
    """
    Landsbankinn AIS client — Berlin Group NextGenPSD2.
    Sandbox base: https://psd2.landsbanki.is/sandbox/v1
    """

    def _api_base(self) -> str:
        return settings.BANK_LANDSBANKINN_API_BASE

    def _auth_url(self) -> str:
        return settings.BANK_LANDSBANKINN_AUTH_URL

    def _token_url(self) -> str:
        return settings.BANK_LANDSBANKINN_TOKEN_URL

    def _client_id(self) -> str:
        return settings.BANK_LANDSBANKINN_CLIENT_ID

    def _client_secret(self) -> str:
        return settings.BANK_LANDSBANKINN_CLIENT_SECRET

    def _redirect_uri(self) -> str:
        return settings.BANK_LANDSBANKINN_REDIRECT_URI

    # ── OAuth ──────────────────────────────────────────────────────────────────

    def get_authorization_url(self, state: str, code_challenge: str) -> str:
        params = {
            "response_type": "code",
            "client_id": self._client_id(),
            "redirect_uri": self._redirect_uri(),
            "scope": "AIS",
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{self._auth_url()}?{urlencode(params)}"

    def exchange_code(self, code: str, code_verifier: str) -> dict:
        """Exchange authorization code for tokens. Returns raw token response dict."""
        resp = requests.post(
            self._token_url(),
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": self._redirect_uri(),
                "client_id": self._client_id(),
                "client_secret": self._client_secret(),
                "code_verifier": code_verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json()

    # ── AIS ────────────────────────────────────────────────────────────────────

    def _headers(self, access_token: str, consent_id: str) -> dict:
        return {
            "Authorization": f"Bearer {access_token}",
            "Consent-ID": consent_id,
            "X-Request-ID": str(uuid.uuid4()),
            "Accept": "application/json",
        }

    def get_accounts(self, consent) -> list[dict]:
        """
        Return list of accounts under this consent.
        Each dict has: account_id, iban, name.
        consent: BankConsent instance.
        """
        access_token = decrypt_token(consent.access_token)
        url = f"{self._api_base()}/accounts"
        resp = requests.get(
            url,
            headers=self._headers(access_token, consent.consent_id),
            timeout=15,
        )
        log_api_call(
            association=consent.association,
            bank=BANK,
            endpoint="/accounts",
            http_method="GET",
            status_code=resp.status_code,
        )
        resp.raise_for_status()
        data = resp.json()
        accounts = data.get("accounts", [])
        return [
            {
                "account_id": a.get("resourceId", a.get("iban", "")),
                "iban": a.get("iban", ""),
                "name": a.get("name", a.get("iban", "")),
            }
            for a in accounts
        ]

    def get_balance(self, consent, account_id: str) -> dict:
        access_token = decrypt_token(consent.access_token)
        url = f"{self._api_base()}/accounts/{account_id}/balances"
        resp = requests.get(
            url,
            headers=self._headers(access_token, consent.consent_id),
            timeout=15,
        )
        log_api_call(
            association=consent.association,
            bank=BANK,
            endpoint=f"/accounts/{account_id}/balances",
            http_method="GET",
            status_code=resp.status_code,
        )
        resp.raise_for_status()
        balances = resp.json().get("balances", [])
        # Prefer closingBooked balance
        for b in balances:
            if b.get("balanceType") == "closingBooked":
                return {
                    "account_id": account_id,
                    "amount": Decimal(str(b["balanceAmount"]["amount"])),
                    "currency": b["balanceAmount"].get("currency", "ISK"),
                }
        if balances:
            b = balances[0]
            return {
                "account_id": account_id,
                "amount": Decimal(str(b["balanceAmount"]["amount"])),
                "currency": b["balanceAmount"].get("currency", "ISK"),
            }
        return {"account_id": account_id, "amount": Decimal("0"), "currency": "ISK"}

    def get_transactions(self, consent, from_date: date, to_date: date) -> list[dict]:
        """
        Fetch booked transactions across all accounts for the given date range.
        Returns list of dicts: account_id, external_id, date, amount, description, reference.
        """
        accounts = self.get_accounts(consent)
        access_token = decrypt_token(consent.access_token)
        all_txs = []
        for account in accounts:
            account_id = account["account_id"]
            url = f"{self._api_base()}/accounts/{account_id}/transactions"
            params = {
                "dateFrom": from_date.isoformat(),
                "dateTo": to_date.isoformat(),
                "bookingStatus": "booked",
            }
            resp = requests.get(
                url,
                params=params,
                headers=self._headers(access_token, consent.consent_id),
                timeout=30,
            )
            log_api_call(
                association=consent.association,
                bank=BANK,
                endpoint=f"/accounts/{account_id}/transactions",
                http_method="GET",
                status_code=resp.status_code,
            )
            resp.raise_for_status()
            raw_txs = (
                resp.json()
                .get("transactions", {})
                .get("booked", [])
            )
            for tx in raw_txs:
                all_txs.append({
                    "account_id": account_id,
                    "external_id": tx.get("transactionId", ""),
                    "date": date.fromisoformat(tx["bookingDate"]),
                    "amount": Decimal(str(tx["transactionAmount"]["amount"])),
                    "description": tx.get("remittanceInformationUnstructured", ""),
                    "reference": tx.get("endToEndId", ""),
                })
        return all_txs
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.LandsbankinnClientTest -v 2
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add HusfelagPy/associations/banks/landsbankinn.py HusfelagPy/associations/tests.py
git commit -m "feat: Landsbankinn PSD2 client (AIS)"
```

---

## Task 10: Celery tasks

**Files:**
- Create: `HusfelagPy/associations/banks/tasks.py`

- [ ] **Step 1: Write the failing test**

In `associations/tests.py`, add:

```python
class BankTasksTest(TestCase):
    def setUp(self):
        self.association = Association.objects.create(
            ssn="1234567892", name="Task Húsfélag",
            address="Taskgata 1", postal_code="101", city="Reykjavík"
        )
        self.bank_account = BankAccount.objects.create(
            association=self.association,
            name="Aðalreikningur",
            account_number="0101-26-999999",
        )

    @patch("associations.banks.tasks.LandsbankinnProvider")
    def test_sync_transactions_creates_new_transaction(self, MockProvider):
        import datetime as dt
        from cryptography.fernet import Fernet
        from django.test.utils import override_settings
        from associations.models import BankConsent, TransactionSource
        key = Fernet.generate_key().decode()
        with override_settings(BANK_FERNET_KEY=key):
            from associations.banks.consent_store import encrypt_token
            consent = BankConsent.objects.create(
                association=self.association,
                bank="LANDSBANKINN",
                consent_id="c-tasks-001",
                access_token=encrypt_token("fake-token"),
                token_expires_at=dt.datetime(2026, 7, 1, tzinfo=dt.timezone.utc),
                consent_expires_at=dt.date(2026, 7, 11),
                is_active=True,
            )
            mock_instance = MockProvider.return_value
            mock_instance.get_transactions.return_value = [{
                "account_id": "0101-26-999999",
                "external_id": "ext-tx-001",
                "date": dt.date(2026, 4, 10),
                "amount": Decimal("5000.00"),
                "description": "Húsaleiga",
                "reference": "ref-001",
            }]
            mock_instance.get_accounts.return_value = [
                {"account_id": "0101-26-999999", "iban": "", "name": "Aðalreikningur"}
            ]

            from associations.banks.tasks import sync_transactions
            sync_transactions(self.association.id)

        tx = Transaction.objects.filter(external_id="ext-tx-001").first()
        self.assertIsNotNone(tx)
        self.assertEqual(tx.source, TransactionSource.BANK_SYNC)
        self.assertEqual(tx.amount, Decimal("5000.00"))

    @patch("associations.banks.tasks.LandsbankinnProvider")
    def test_sync_transactions_skips_duplicate(self, MockProvider):
        import datetime as dt
        from cryptography.fernet import Fernet
        from django.test.utils import override_settings
        from associations.models import BankConsent, TransactionSource
        key = Fernet.generate_key().decode()
        with override_settings(BANK_FERNET_KEY=key):
            from associations.banks.consent_store import encrypt_token
            BankConsent.objects.create(
                association=self.association,
                bank="LANDSBANKINN",
                consent_id="c-tasks-002",
                access_token=encrypt_token("fake-token"),
                token_expires_at=dt.datetime(2026, 7, 1, tzinfo=dt.timezone.utc),
                consent_expires_at=dt.date(2026, 7, 11),
                is_active=True,
            )
            # Pre-create transaction with same external_id
            Transaction.objects.create(
                bank_account=self.bank_account,
                date=dt.date(2026, 4, 10),
                amount=Decimal("5000.00"),
                description="Already imported",
                external_id="ext-dup-001",
                source=TransactionSource.BANK_SYNC,
            )
            mock_instance = MockProvider.return_value
            mock_instance.get_transactions.return_value = [{
                "account_id": "0101-26-999999",
                "external_id": "ext-dup-001",
                "date": dt.date(2026, 4, 10),
                "amount": Decimal("5000.00"),
                "description": "Húsaleiga",
                "reference": "ref-001",
            }]
            mock_instance.get_accounts.return_value = [
                {"account_id": "0101-26-999999", "iban": "", "name": "Aðalreikningur"}
            ]

            from associations.banks.tasks import sync_transactions
            sync_transactions(self.association.id)

        # Still exactly one transaction with this external_id
        self.assertEqual(Transaction.objects.filter(external_id="ext-dup-001").count(), 1)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankTasksTest -v 2
```

Expected: ModuleNotFoundError — `associations.banks.tasks` does not exist.

- [ ] **Step 3: Create tasks.py**

```python
import logging
from datetime import date, timedelta, datetime, timezone

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.utils.timezone import now

logger = logging.getLogger(__name__)


def _get_provider(bank: str):
    """Return the appropriate BankProvider instance for the given bank slug."""
    if bank == "LANDSBANKINN":
        from .landsbankinn import LandsbankinnProvider
        return LandsbankinnProvider()
    raise ValueError(f"Unknown bank: {bank}")


@shared_task(name="associations.banks.tasks.sync_transactions")
def sync_transactions(association_id: int) -> dict:
    """
    Fetch the last 30 days of transactions from the bank for one association
    and upsert into Transaction. Returns summary dict.
    """
    from associations.models import Association, BankConsent, BankAccount, Transaction, TransactionSource

    try:
        consent = BankConsent.objects.select_related("association").get(
            association_id=association_id, is_active=True
        )
    except BankConsent.DoesNotExist:
        logger.warning("sync_transactions: no active consent for association %s", association_id)
        return {"skipped": True, "reason": "no_active_consent"}

    if not getattr(settings, f"BANK_{consent.bank}_ENABLED", False):
        logger.info("sync_transactions: %s integration disabled, skipping", consent.bank)
        return {"skipped": True, "reason": "bank_disabled"}

    provider = _get_provider(consent.bank)
    to_date = date.today()
    from_date = to_date - timedelta(days=30)

    try:
        transactions = provider.get_transactions(consent, from_date, to_date)
    except Exception as exc:
        logger.error("sync_transactions: fetch failed for association %s: %s", association_id, exc)
        return {"error": str(exc)}

    created = 0
    skipped = 0
    for tx_data in transactions:
        external_id = tx_data.get("external_id", "")

        # Find or create the BankAccount record for this account
        bank_account, _ = BankAccount.objects.get_or_create(
            association=consent.association,
            account_number=tx_data["account_id"],
            defaults={"name": tx_data["account_id"]},
        )

        # Skip if already imported (upsert by external_id)
        if external_id and Transaction.objects.filter(
            bank_account=bank_account, external_id=external_id
        ).exists():
            skipped += 1
            continue

        Transaction.objects.create(
            bank_account=bank_account,
            date=tx_data["date"],
            amount=tx_data["amount"],
            description=tx_data["description"],
            reference=tx_data.get("reference", ""),
            source=TransactionSource.BANK_SYNC,
            external_id=external_id,
        )
        created += 1

    logger.info(
        "sync_transactions: association=%s created=%s skipped=%s",
        association_id, created, skipped
    )
    return {"created": created, "skipped": skipped}


@shared_task(name="associations.banks.tasks.sync_all_associations")
def sync_all_associations() -> dict:
    """
    Trigger sync_transactions for every association with an active bank consent.
    Dispatches tasks asynchronously.
    """
    from associations.models import BankConsent

    consent_ids = list(
        BankConsent.objects.filter(is_active=True).values_list("association_id", flat=True)
    )
    for assoc_id in consent_ids:
        sync_transactions.delay(assoc_id)

    logger.info("sync_all_associations: dispatched %s tasks", len(consent_ids))
    return {"dispatched": len(consent_ids)}


@shared_task(name="associations.banks.tasks.check_consent_expiry")
def check_consent_expiry() -> dict:
    """
    Find active consents expiring within 10 days.
    Send email to CHAIR and CFO. Write BankNotificationLog. Set renewal_notified_at.
    """
    from associations.models import BankConsent, AssociationAccess, AssociationRole
    from associations.banks.audit import log_notification

    threshold = date.today() + timedelta(days=10)
    expiring = BankConsent.objects.filter(
        is_active=True,
        consent_expires_at__lte=threshold,
        renewal_notified_at__isnull=True,
    ).select_related("association")

    notified = 0
    for consent in expiring:
        # Collect CHAIR and CFO emails
        recipients = list(
            AssociationAccess.objects.filter(
                association=consent.association,
                role__in=[AssociationRole.CHAIR, AssociationRole.CFO],
                active=True,
            ).select_related("user").values_list("user__email", flat=True)
        )
        recipients = [e for e in recipients if e]
        if not recipients:
            continue

        days_left = (consent.consent_expires_at - date.today()).days
        subject = f"Bankasamþykki rennur út eftir {days_left} daga — {consent.association.name}"
        body = (
            f"Kæri stjórnandi,\n\n"
            f"Bankasamþykki {consent.association.name} við {consent.get_bank_display()} "
            f"rennur út {consent.consent_expires_at.strftime('%d.%m.%Y')} "
            f"({days_left} dagar eftir).\n\n"
            f"Vinsamlega endurnýjið tenginguna í Bankastillingum félagsins.\n\n"
            f"Kveðja,\nHúsfjelag"
        )
        try:
            send_mail(subject, body, None, recipients, fail_silently=False)
            log_notification(
                association=consent.association,
                notification_type="CONSENT_EXPIRY",
                recipients=recipients,
                success=True,
            )
            consent.renewal_notified_at = now()
            consent.save(update_fields=["renewal_notified_at"])
            notified += 1
        except Exception as exc:
            logger.error("check_consent_expiry: email failed for %s: %s", consent.association, exc)
            log_notification(
                association=consent.association,
                notification_type="CONSENT_EXPIRY",
                recipients=recipients,
                success=False,
                error=str(exc),
            )

    logger.info("check_consent_expiry: notified=%s", notified)
    return {"notified": notified}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankTasksTest -v 2
```

Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add HusfelagPy/associations/banks/tasks.py HusfelagPy/associations/tests.py
git commit -m "feat: Celery tasks for transaction sync and consent expiry notifications"
```

---

## Task 11: Bank views and URLs

**Files:**
- Create: `HusfelagPy/associations/banks/views.py`
- Modify: `HusfelagPy/associations/urls.py`
- Modify: `HusfelagPy/config/urls.py`

- [ ] **Step 1: Write the failing test**

In `associations/tests.py`, add:

```python
class BankViewsTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.user = User.objects.create(
            kennitala="1234567890", name="Stjórnandi",
            email="stjorn@test.is", is_superadmin=False
        )
        self.association = Association.objects.create(
            ssn="1234567893", name="View Húsfélag",
            address="Viewgata 1", postal_code="101", city="Reykjavík"
        )
        AssociationAccess.objects.create(
            user=self.user, association=self.association,
            role="CHAIR", active=True
        )
        # Give user a JWT-like token via the existing auth mechanism
        from users.oidc import create_access_token
        self.token = create_access_token(self.user)

    def test_bank_status_no_consent_returns_404(self):
        resp = self.client.get(
            f"/associations/{self.association.id}/bank/status",
            HTTP_AUTHORIZATION=f"Bearer {self.token}",
        )
        self.assertEqual(resp.status_code, 404)

    def test_bank_disconnect_no_consent_returns_404(self):
        resp = self.client.delete(
            f"/associations/{self.association.id}/bank/disconnect",
            HTTP_AUTHORIZATION=f"Bearer {self.token}",
        )
        self.assertEqual(resp.status_code, 404)

    def test_bank_callback_invalid_state_returns_redirect_with_error(self):
        resp = self.client.get(
            "/bank/callback/landsbankinn?code=abc&state=nonexistent-state"
        )
        # Should redirect to frontend with error param
        self.assertEqual(resp.status_code, 302)
        self.assertIn("status=error", resp["Location"])
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankViewsTest -v 2
```

Expected: 404 (URL not found) — bank URLs not registered yet.

- [ ] **Step 3: Create associations/banks/views.py**

```python
import secrets
from datetime import datetime, timezone, timedelta, date

from django.conf import settings
from django.http import HttpResponseRedirect
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny

from associations.models import (
    Association, AssociationAccess, AssociationRole,
    BankConsent, BankApiAuditLog, BankNotificationLog,
)
from associations.banks.oauth_client import generate_pkce_pair, store_oauth_state, pop_oauth_state
from associations.banks.consent_store import encrypt_token, decrypt_token

FRONTEND_BANK_SETTINGS = settings.FRONTEND_URL + "/bank-settings"  # set in settings


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


def _get_provider(bank: str):
    if bank == "LANDSBANKINN":
        from associations.banks.landsbankinn import LandsbankinnProvider
        return LandsbankinnProvider()
    raise ValueError(f"Unknown bank: {bank}")


class BankConnectView(APIView):
    """GET /associations/{id}/bank/connect?bank=LANDSBANKINN"""
    permission_classes = [IsAuthenticated]

    def get(self, request, association_id):
        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return Response({"detail": "Félag ekki fundið."}, status=status.HTTP_404_NOT_FOUND)

        err = _require_chair_or_cfo(request, association)
        if err:
            return err

        bank = request.query_params.get("bank", "LANDSBANKINN").upper()
        if not getattr(settings, f"BANK_{bank}_ENABLED", False):
            return Response(
                {"detail": f"{bank} samþætting er ekki virk."},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        verifier, challenge = generate_pkce_pair()
        state = secrets.token_urlsafe(32)
        store_oauth_state(state, {
            "association_id": association_id,
            "bank": bank,
            "user_id": request.user.id,
            "verifier": verifier,
        })

        provider = _get_provider(bank)
        url = provider.get_authorization_url(state=state, code_challenge=challenge)
        return HttpResponseRedirect(url)


class BankCallbackView(APIView):
    """GET /bank/callback/{bank} — open endpoint, no JWT"""
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, bank):
        bank = bank.upper()
        code = request.query_params.get("code")
        state = request.query_params.get("state")
        frontend_base = getattr(settings, "FRONTEND_URL", "http://localhost:3010")

        if not code or not state:
            return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=error&reason=missing_params")

        payload = pop_oauth_state(state)
        if not payload:
            return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=error&reason=invalid_state")

        association_id = payload["association_id"]
        verifier = payload["verifier"]

        try:
            association = Association.objects.get(id=association_id)
        except Association.DoesNotExist:
            return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=error&reason=assoc_not_found")

        try:
            provider = _get_provider(bank)
            token_data = provider.exchange_code(code=code, code_verifier=verifier)
        except Exception as exc:
            return HttpResponseRedirect(
                f"{frontend_base}/bank-settings?status=error&reason=token_exchange_failed"
            )

        access_token = token_data.get("access_token", "")
        refresh_token = token_data.get("refresh_token", "")
        expires_in = int(token_data.get("expires_in", 3600))
        consent_id = token_data.get("consent_id", "")

        token_expires_at = datetime.now(tz=timezone.utc) + timedelta(seconds=expires_in)
        consent_expires_at = date.today() + timedelta(days=90)

        BankConsent.objects.update_or_create(
            association=association,
            defaults={
                "bank": bank,
                "consent_id": consent_id,
                "access_token": encrypt_token(access_token),
                "refresh_token": encrypt_token(refresh_token) if refresh_token else "",
                "token_expires_at": token_expires_at,
                "consent_expires_at": consent_expires_at,
                "is_active": True,
                "renewal_notified_at": None,
            },
        )

        return HttpResponseRedirect(f"{frontend_base}/bank-settings?status=ok&assoc={association_id}")


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

        try:
            consent = BankConsent.objects.get(association=association, is_active=True)
        except BankConsent.DoesNotExist:
            return Response({"detail": "Engin virk bankatengind."}, status=status.HTTP_404_NOT_FOUND)

        days_left = (consent.consent_expires_at - date.today()).days
        return Response({
            "bank": consent.bank,
            "bank_display": consent.get_bank_display(),
            "consent_expires_at": consent.consent_expires_at.isoformat(),
            "days_until_expiry": days_left,
            "is_expiring_soon": days_left <= 10,
            "updated_at": consent.updated_at.isoformat(),
        })


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

        try:
            consent = BankConsent.objects.get(association=association, is_active=True)
        except BankConsent.DoesNotExist:
            return Response({"detail": "Engin virk bankatengind."}, status=status.HTTP_404_NOT_FOUND)

        consent.is_active = False
        consent.access_token = ""
        consent.refresh_token = ""
        consent.save(update_fields=["is_active", "access_token", "refresh_token", "updated_at"])
        return Response({"detail": "Bankatengind aftengt."})


class AdminBankSyncView(APIView):
    """POST /admin/associations/{id}/bank/sync — superadmin only"""
    permission_classes = [IsAuthenticated]

    def post(self, request, association_id):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)

        from associations.banks.tasks import sync_transactions
        sync_transactions.delay(association_id)
        return Response({"detail": "Samstilling hafin."}, status=status.HTTP_202_ACCEPTED)


class AdminBankHealthView(APIView):
    """GET /admin/bank/health — superadmin only"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_superadmin:
            return Response({"detail": "Aðeins kerfisstjórar hafa aðgang."}, status=status.HTTP_403_FORBIDDEN)

        today = date.today()
        in_14 = today + timedelta(days=14)

        consents = BankConsent.objects.select_related("association").filter(is_active=True)
        active = consents.count()
        expiring_14 = consents.filter(consent_expires_at__lte=in_14).count()

        expired = BankConsent.objects.filter(
            is_active=True, consent_expires_at__lt=today
        ).count()

        from django.utils.timezone import now
        month_start = now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        notifications_this_month = BankNotificationLog.objects.filter(
            sent_at__gte=month_start, success=True
        ).count()

        rows = []
        for c in consents.order_by("consent_expires_at"):
            days_left = (c.consent_expires_at - today).days
            last_sync = (
                c.association.bank_audit_logs
                .filter(http_method="GET")
                .order_by("-timestamp")
                .values_list("timestamp", flat=True)
                .first()
            )
            last_notif = (
                c.association.bank_notification_logs
                .order_by("-sent_at")
                .values_list("sent_at", flat=True)
                .first()
            )
            rows.append({
                "association_id": c.association.id,
                "association_name": c.association.name,
                "bank": c.bank,
                "bank_display": c.get_bank_display(),
                "consent_expires_at": c.consent_expires_at.isoformat(),
                "days_until_expiry": days_left,
                "is_expiring_soon": days_left <= 14,
                "last_sync_at": last_sync.isoformat() if last_sync else None,
                "last_notification_at": last_notif.isoformat() if last_notif else None,
            })

        return Response({
            "summary": {
                "active_connections": active,
                "expiring_within_14_days": expiring_14,
                "expired": expired,
                "notifications_this_month": notifications_this_month,
            },
            "associations": rows,
        })
```

- [ ] **Step 4: Add FRONTEND_URL to settings**

In `config/settings/base.py`, add after the existing env vars:

```python
FRONTEND_URL = env("FRONTEND_URL", default="http://localhost:3010")
```

In `config/settings/dev.py`, ensure `.env` has `FRONTEND_URL=http://localhost:3010`.

- [ ] **Step 5: Add bank URL patterns to associations/urls.py**

At the top of `associations/urls.py`, add the bank view imports:

```python
from .banks.views import (
    BankConnectView, BankCallbackView, BankStatusView,
    BankDisconnectView, AdminBankSyncView, AdminBankHealthView,
)
```

Add these paths to the `urlpatterns` list:

```python
    # Bank integration
    path("associations/<int:association_id>/bank/connect", BankConnectView.as_view(), name="bank-connect"),
    path("associations/<int:association_id>/bank/status", BankStatusView.as_view(), name="bank-status"),
    path("associations/<int:association_id>/bank/disconnect", BankDisconnectView.as_view(), name="bank-disconnect"),
    path("bank/callback/<str:bank>", BankCallbackView.as_view(), name="bank-callback"),
    path("admin/associations/<int:association_id>/bank/sync", AdminBankSyncView.as_view(), name="admin-bank-sync"),
    path("admin/bank/health", AdminBankHealthView.as_view(), name="admin-bank-health"),
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations.tests.BankViewsTest -v 2
```

Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add HusfelagPy/associations/banks/views.py HusfelagPy/associations/urls.py HusfelagPy/config/settings/base.py HusfelagPy/associations/tests.py
git commit -m "feat: bank API views and URL patterns (connect, callback, status, disconnect, admin sync, health)"
```

---

## Task 12: Frontend — BankAuthCallback

**Files:**
- Create: `HusfelagJS/src/controlers/BankAuthCallback.js`
- Modify: `HusfelagJS/src/App.js`

- [ ] **Step 1: Create BankAuthCallback.js**

```javascript
import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography, Alert } from '@mui/material';

export default function BankAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    const bankStatus = searchParams.get('status');
    const reason = searchParams.get('reason');
    const assocId = searchParams.get('assoc');

    if (bankStatus === 'ok') {
      setTimeout(() => {
        navigate(`/bank-settings${assocId ? `?assoc=${assocId}` : ''}?connected=1`);
      }, 1200);
    } else {
      setError(reason || 'unknown_error');
      setTimeout(() => {
        navigate('/bank-settings?status=error');
      }, 3000);
    }
  }, [searchParams, navigate]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 2 }}>
      {error ? (
        <Alert severity="error">
          Tenging við banka mistókst ({error}). Þú verður vísað áfram...
        </Alert>
      ) : (
        <>
          <CircularProgress />
          <Typography>Tenging við banka staðfest. Hleð...</Typography>
        </>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Add route to App.js**

In `HusfelagJS/src/App.js`, add the import after existing imports:

```javascript
import BankAuthCallback from './controlers/BankAuthCallback';
import BankSettingsPage from './controlers/BankSettingsPage';
import BankHealthPage from './controlers/BankHealthPage';
```

Add the routes inside the `<Routes>` block (before the closing `</Routes>`):

```jsx
<Route path="/bank/callback" element={<BankAuthCallback />} />
<Route path="/bank-settings" element={<ProtectedRoute><BankSettingsPage /></ProtectedRoute>} />
<Route path="/admin/bank-health" element={<ProtectedRoute><BankHealthPage /></ProtectedRoute>} />
```

- [ ] **Step 3: Commit**

```bash
git add HusfelagJS/src/controlers/BankAuthCallback.js HusfelagJS/src/App.js
git commit -m "feat: BankAuthCallback route and App.js route stubs"
```

---

## Task 13: Frontend — BankSettingsPage

**Files:**
- Create: `HusfelagJS/src/controlers/BankSettingsPage.js`

- [ ] **Step 1: Create BankSettingsPage.js**

```javascript
import React, { useContext, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Button, Alert, CircularProgress,
  Card, CardContent, Chip, Divider, MenuItem, Select, FormControl, InputLabel,
} from '@mui/material';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SyncIcon from '@mui/icons-material/Sync';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

const BANK_OPTIONS = [
  { value: 'LANDSBANKINN', label: 'Landsbankinn' },
];

export default function BankSettingsPage() {
  const { user, currentAssociation } = useContext(UserContext);
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState(null);       // bank consent status from API
  const [loading, setLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState('LANDSBANKINN');
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

  const assocId = currentAssociation?.id;

  useEffect(() => {
    if (!assocId) return;
    fetchStatus();
    // Show success/error messages from OAuth callback redirect
    if (searchParams.get('connected') === '1') {
      setMessage({ type: 'success', text: 'Bankatengind tókst!' });
    } else if (searchParams.get('status') === 'error') {
      setMessage({ type: 'error', text: 'Villa við tengingu við banka.' });
    }
  }, [assocId]);

  async function fetchStatus() {
    setLoading(true);
    try {
      const resp = await apiFetch(`${API_URL}/associations/${assocId}/bank/status`);
      if (resp.status === 404) {
        setStatus(null);
      } else {
        const data = await resp.json();
        setStatus(data);
      }
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleConnect() {
    window.location.href = `${API_URL}/associations/${assocId}/bank/connect?bank=${selectedBank}`;
  }

  async function handleDisconnect() {
    if (!window.confirm('Aftengja banka? Þetta stöðvar sjálfvirka færsluinnflutning.')) return;
    await apiFetch(`${API_URL}/associations/${assocId}/bank/disconnect`, { method: 'DELETE' });
    setStatus(null);
    setMessage({ type: 'info', text: 'Bankatengind aftengt.' });
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

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ p: 3, maxWidth: 600 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Bankastillingar
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {status?.is_expiring_soon && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Bankasamþykki rennur út eftir {status.days_until_expiry} daga.{' '}
          <strong>Endurnýjaðu tenginguna.</strong>
        </Alert>
      )}

      <Card variant="outlined" sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AccountBalanceIcon />
            <Typography variant="h6">Bankatengind</Typography>
            {status ? (
              <Chip label="Tengt" color="success" size="small" sx={{ ml: 'auto' }} />
            ) : (
              <Chip label="Ekki tengt" size="small" sx={{ ml: 'auto' }} />
            )}
          </Box>

          {status ? (
            <>
              <Typography variant="body2" color="text.secondary">
                <strong>Banki:</strong> {status.bank_display}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Samþykki gildir til:</strong>{' '}
                {new Date(status.consent_expires_at).toLocaleDateString('is-IS')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                <strong>Síðast uppfært:</strong>{' '}
                {new Date(status.updated_at).toLocaleDateString('is-IS')}
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleConnect}
                  startIcon={<AccountBalanceIcon />}
                >
                  Endurnýja tengingu
                </Button>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={handleDisconnect}
                  startIcon={<LinkOffIcon />}
                >
                  Aftengja
                </Button>
                {user?.is_superadmin && (
                  <Button
                    variant="outlined"
                    onClick={handleManualSync}
                    disabled={syncing}
                    startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                  >
                    Samstilla núna
                  </Button>
                )}
              </Box>
            </>
          ) : (
            <>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Engin bankatengind virk. Veldu banka og tengdu félagið.
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel>Banki</InputLabel>
                  <Select
                    value={selectedBank}
                    label="Banki"
                    onChange={(e) => setSelectedBank(e.target.value)}
                  >
                    {BANK_OPTIONS.map((b) => (
                      <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleConnect}
                  startIcon={<AccountBalanceIcon />}
                >
                  Tengja banka
                </Button>
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add HusfelagJS/src/controlers/BankSettingsPage.js
git commit -m "feat: BankSettingsPage — bank connection management for CHAIR/CFO"
```

---

## Task 14: Frontend — BankHealthPage and Sidebar sub-menu

**Files:**
- Create: `HusfelagJS/src/controlers/BankHealthPage.js`
- Modify: `HusfelagJS/src/controlers/Sidebar.js`

- [ ] **Step 1: Create BankHealthPage.js**

```javascript
import React, { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, CircularProgress, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Paper, Chip, Card, CardContent, Grid,
} from '@mui/material';
import { UserContext } from './UserContext';
import { apiFetch } from '../api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8010';

function StatCard({ label, value, color }) {
  return (
    <Card variant="outlined">
      <CardContent sx={{ textAlign: 'center' }}>
        <Typography variant="h3" sx={{ color: color || 'inherit', fontWeight: 200 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
      </CardContent>
    </Card>
  );
}

export default function BankHealthPage() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user?.is_superadmin) { navigate('/dashboard'); return; }
    apiFetch(`${API_URL}/admin/bank/health`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Villa við að sækja gögn.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ p: 3 }}><CircularProgress /></Box>;
  if (error) return <Box sx={{ p: 3 }}><Alert severity="error">{error}</Alert></Box>;

  const { summary, associations } = data;

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3, fontWeight: 600 }}>
        Bankaheilsa — yfirlit
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <StatCard label="Virkar tengingar" value={summary.active_connections} color="#08C076" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Renna út á 14 dögum" value={summary.expiring_within_14_days} color="#f59e0b" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Útrunnið" value={summary.expired} color="#ef4444" />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard label="Tilkynningar þ.m." value={summary.notifications_this_month} />
        </Grid>
      </Grid>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Félag</TableCell>
              <TableCell>Banki</TableCell>
              <TableCell>Samþykki gildir til</TableCell>
              <TableCell>Staða</TableCell>
              <TableCell>Síðasta samstilling</TableCell>
              <TableCell>Síðasta tilkynning</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {associations.map((row) => (
              <TableRow
                key={row.association_id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => navigate(`/bank-settings?assoc=${row.association_id}`)}
              >
                <TableCell>{row.association_name}</TableCell>
                <TableCell>{row.bank_display}</TableCell>
                <TableCell>
                  {new Date(row.consent_expires_at).toLocaleDateString('is-IS')}
                </TableCell>
                <TableCell>
                  {row.days_until_expiry < 0 ? (
                    <Chip label="Útrunnið" color="error" size="small" />
                  ) : row.is_expiring_soon ? (
                    <Chip label={`${row.days_until_expiry}d`} color="warning" size="small" />
                  ) : (
                    <Chip label="Í lagi" color="success" size="small" />
                  )}
                </TableCell>
                <TableCell>
                  {row.last_sync_at
                    ? new Date(row.last_sync_at).toLocaleDateString('is-IS')
                    : '—'}
                </TableCell>
                <TableCell>
                  {row.last_notification_at
                    ? new Date(row.last_notification_at).toLocaleDateString('is-IS')
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
            {associations.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} sx={{ textAlign: 'center', color: 'text.secondary' }}>
                  Engar bankatengingar skráðar.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
```

- [ ] **Step 2: Add superadmin sub-menu to Sidebar.js**

Find the section in `Sidebar.js` where the superadmin nav item is rendered (around line 236–241):

```jsx
{user?.is_superadmin && (
    <NavItem
        label="Kerfisstjóri"
        icon={<AdminPanelSettingsOutlinedIcon sx={{ fontSize: 20 }} />}
        collapsed={collapsed}
        active={location.pathname === '/superadmin'}
        onClick={() => navigate('/superadmin')}
    />
)}
```

Replace it with an expandable sub-menu:

```jsx
{user?.is_superadmin && (
    <>
        <Box
            onClick={() => setAdminOpen((v) => !v)}
            sx={{
                display: 'flex', alignItems: 'center', gap: 1.5,
                px: 1.5, py: 0.85, mx: 1, borderRadius: 2, cursor: 'pointer',
                backgroundColor: location.pathname.startsWith('/superadmin') || location.pathname.startsWith('/admin')
                    ? ACTIVE_BG : 'transparent',
                '&:hover': { backgroundColor: HOVER_BG },
                transition: 'background-color 0.15s',
                justifyContent: collapsed ? 'center' : 'flex-start',
                minHeight: 40,
            }}
        >
            <Box sx={{ color: TEXT, display: 'flex', flexShrink: 0 }}>
                <AdminPanelSettingsOutlinedIcon sx={{ fontSize: 20 }} />
            </Box>
            {!collapsed && (
                <Typography sx={{ color: TEXT, fontFamily: '"Inter", sans-serif', fontWeight: 400, fontSize: '0.9rem', flex: 1 }}>
                    Kerfisstjórn
                </Typography>
            )}
            {!collapsed && (
                <Box sx={{ color: TEXT, fontSize: 16 }}>{adminOpen ? '▲' : '▼'}</Box>
            )}
        </Box>
        {adminOpen && !collapsed && (
            <Box sx={{ pl: 2 }}>
                <NavItem
                    path="/superadmin"
                    label="Félög"
                    icon={<AdminPanelSettingsOutlinedIcon sx={{ fontSize: 18 }} />}
                    collapsed={false}
                    active={location.pathname === '/superadmin'}
                    onClick={() => navigate('/superadmin')}
                />
                <NavItem
                    path="/admin/bank-health"
                    label="Bankaheilsa"
                    icon={<AccountBalanceWalletOutlinedIcon sx={{ fontSize: 18 }} />}
                    collapsed={false}
                    active={location.pathname === '/admin/bank-health'}
                    onClick={() => navigate('/admin/bank-health')}
                />
            </Box>
        )}
    </>
)}
```

- [ ] **Step 3: Add adminOpen state to Sidebar.js**

In `Sidebar.js`, find the existing `const [...]` state declarations at the top of the component function. Add:

```javascript
const [adminOpen, setAdminOpen] = useState(false);
```

- [ ] **Step 4: Add BankHealthPage route to App.js** (already done in Task 12 Step 2 — verify it is there).

- [ ] **Step 5: Commit**

```bash
git add HusfelagJS/src/controlers/BankHealthPage.js HusfelagJS/src/controlers/Sidebar.js
git commit -m "feat: BankHealthPage and superadmin collapsible sub-menu in Sidebar"
```

---

## Task 15: End-to-end smoke test and final commit

- [ ] **Step 1: Run the full test suite**

```bash
cd HusfelagPy
poetry run python3 manage.py test associations -v 2
```

Expected: all tests pass. Note the count — it should include all new bank test classes.

- [ ] **Step 2: Start backend and verify Swagger shows new endpoints**

```bash
poetry run python3 manage.py runserver 8000
```

Open `http://localhost:8000/swagger/`. Verify these endpoints appear:
- `GET /associations/{association_id}/bank/connect`
- `GET /associations/{association_id}/bank/status`
- `DELETE /associations/{association_id}/bank/disconnect`
- `GET /bank/callback/{bank}`
- `POST /admin/associations/{association_id}/bank/sync`
- `GET /admin/bank/health`

- [ ] **Step 3: Start frontend and verify routes load**

```bash
cd HusfelagJS
npm start
```

Log in and verify:
- `/bank-settings` loads BankSettingsPage (shows "Ekki tengt" state)
- Superadmin: Sidebar shows "Kerfisstjórn" with expandable sub-menu → Bankaheilsa
- `/admin/bank-health` loads BankHealthPage (empty table if no consents)
- Non-superadmin user: `/admin/bank-health` redirects to `/dashboard`

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 1 bank integration complete — Landsbankinn AIS, consent management, health dashboard"
```

---

## Environment setup

Add to `HusfelagPy/.env`:

```bash
# Bank integration
BANK_FERNET_KEY=<generate with: python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
BANK_LANDSBANKINN_ENABLED=false
BANK_LANDSBANKINN_CLIENT_ID=
BANK_LANDSBANKINN_CLIENT_SECRET=
BANK_LANDSBANKINN_REDIRECT_URI=http://localhost:8000/bank/callback/landsbankinn
BANK_LANDSBANKINN_API_BASE=https://psd2.landsbanki.is/sandbox/v1
BANK_LANDSBANKINN_AUTH_URL=https://psd2.landsbanki.is/sandbox/oauth2/auth
BANK_LANDSBANKINN_TOKEN_URL=https://psd2.landsbanki.is/sandbox/oauth2/token
FRONTEND_URL=http://localhost:3010
```

Set `BANK_LANDSBANKINN_ENABLED=true` only after sandbox credentials are obtained from Landsbankinn.

---

## What is NOT in this plan

- mTLS / eIDAS QWAC certificates (required for Landsbankinn production — sandbox uses standard OAuth)
- Arion and Íslandsbanki clients (Phase 2 and 3)
- Kröfu (claim/invoice) creation — `create_claim` raises `NotImplementedError`
- Multi-bank per association
