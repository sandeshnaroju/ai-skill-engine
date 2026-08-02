import os
import base64
import hashlib

def get_keystream(key: bytes, length: int) -> bytes:
    """Generates a pseudo-random keystream of specified length using SHA-256 feedback."""
    keystream = b""
    counter = 0
    while len(keystream) < length:
        h = hashlib.sha256(key + str(counter).encode()).digest()
        keystream += h
        counter += 1
    return keystream[:length]

def xor_bytes(data: bytes, key: bytes) -> bytes:
    keystream = get_keystream(key, len(data))
    return bytes(a ^ b for a, b in zip(data, keystream))

def encrypt_key(plain_text: str) -> str:
    if not plain_text:
        return ""
    secret = os.getenv("ENCRYPTION_SECRET_KEY", "asr-default-super-secret-key-32-chars-").encode("utf-8")
    encrypted = xor_bytes(plain_text.encode("utf-8"), secret)
    return base64.b64encode(encrypted).decode("utf-8")

def decrypt_key(cipher_text: str) -> str:
    if not cipher_text:
        return ""
    secret = os.getenv("ENCRYPTION_SECRET_KEY", "asr-default-super-secret-key-32-chars-").encode("utf-8")
    try:
        decoded = base64.b64decode(cipher_text.encode("utf-8"))
        decrypted = xor_bytes(decoded, secret)
        return decrypted.decode("utf-8")
    except Exception:
        return ""
