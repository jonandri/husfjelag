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
def test_get_access_token_refreshes_when_no_cache():
    """If no cache row exists, fetch a new token via mTLS POST."""
    from associations.models import BankTokenCache

    BankTokenCache.objects.filter(id=1).delete()

    mock_resp = MagicMock()
    mock_resp.json.return_value = {"access_token": "fresh-token", "expires_in": 1200}
    mock_resp.raise_for_status = MagicMock()

    from associations.banks import landsbankinn
    with patch.object(landsbankinn, "requests_pkcs12") as mock_lib:
        mock_lib.post.return_value = mock_resp
        result = landsbankinn.get_access_token()

    assert result == "fresh-token"
    assert BankTokenCache.objects.filter(id=1).exists()
    mock_lib.post.assert_called_once()
