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
