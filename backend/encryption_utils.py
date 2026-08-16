"""
encryption_utils.py
Secure encryption for stored secrets (LLM API keys, SMTP passwords, storage credentials, etc.)

Scheme: Fernet — AES-128-CBC with PKCS7 padding + HMAC-SHA256 authentication.
        Provided by the standard `cryptography` Python library.

Key management:
  - Read from ENCRYPTION_SECRET_KEY environment variable.
  - If missing/invalid, server raises RuntimeError at startup.

Migration:
  - Blobs encrypted with the old XOR scheme are auto-detected and re-encrypted
    on startup by database.py migrate_encryption(). This module exposes
    _legacy_xor_decrypt() solely for that purpose.
"""
import os
import base64
import hashlib
import logging

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────
# Fernet — primary encryption (new)
# ─────────────────────────────────────────────────────────────────

_FERNET_PREFIX = b"gAAAAA"   # All Fernet tokens start with this prefix


def _get_fernet():
    """Return a configured Fernet instance. Raises RuntimeError if key is missing."""
    from cryptography.fernet import Fernet, InvalidToken  # noqa: F401
    raw = os.getenv("ENCRYPTION_SECRET_KEY", "").strip()
    if not raw:
        raise RuntimeError(
            "ENCRYPTION_SECRET_KEY environment variable is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        return Fernet(raw.encode())
    except Exception as e:
        raise RuntimeError(f"ENCRYPTION_SECRET_KEY is not a valid Fernet key: {e}")


def encrypt_key(plain_text: str) -> str:
    """Encrypt a plaintext secret using Fernet. Returns a base64url token string."""
    if not plain_text:
        return ""
    fernet = _get_fernet()
    token = fernet.encrypt(plain_text.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_key(cipher_text: str) -> str:
    """
    Decrypt a stored secret.
    Handles both new Fernet tokens and old XOR blobs (auto-detected by prefix).
    Old XOR blobs are decrypted transparently — they will be re-encrypted by
    the migration routine on startup, so this fallback is purely for safety.
    """
    if not cipher_text:
        return ""

    # New Fernet token
    if cipher_text.encode().startswith(_FERNET_PREFIX):
        try:
            from cryptography.fernet import InvalidToken
            fernet = _get_fernet()
            return fernet.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
        except Exception as e:
            logger.error(f"Fernet decryption failed: {e}")
            return ""

    # Legacy XOR blob — try current key then fallback key
    secret = os.getenv("ENCRYPTION_SECRET_KEY", "").strip()
    if secret:
        result = _legacy_xor_decrypt(cipher_text, secret.encode("utf-8"))
        if result:
            return result
    # Try old hardcoded fallback key
    return _legacy_xor_decrypt(cipher_text, _LEGACY_FALLBACK_KEY)


# ─────────────────────────────────────────────────────────────────
# Legacy XOR helpers — used only by migration & decrypt fallback
# ─────────────────────────────────────────────────────────────────

_LEGACY_FALLBACK_KEY = b"asr-default-super-secret-key-32-chars-"


def _legacy_keystream(key: bytes, length: int) -> bytes:
    keystream = b""
    counter = 0
    while len(keystream) < length:
        keystream += hashlib.sha256(key + str(counter).encode()).digest()
        counter += 1
    return keystream[:length]


def _legacy_xor_decrypt(cipher_text: str, key: bytes) -> str:
    """Try to XOR-decrypt a base64-encoded blob. Returns '' on any failure."""
    try:
        decoded = base64.b64decode(cipher_text.encode("utf-8"))
        keystream = _legacy_keystream(key, len(decoded))
        plain = bytes(a ^ b for a, b in zip(decoded, keystream))
        return plain.decode("utf-8")
    except Exception:
        return ""
