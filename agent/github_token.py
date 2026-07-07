import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

ENCRYPTED_TOKEN_PREFIX = "enc:v1:"


def get_encryption_secret() -> str | None:
    return os.getenv("GITHUB_TOKEN_ENCRYPTION_KEY") or os.getenv("TOKEN_ENCRYPTION_KEY")


def decrypt_github_token(stored_token: str | None) -> str | None:
    if not stored_token:
        return None
    token = stored_token.strip()
    if not token:
        return None

    secret = get_encryption_secret()
    encrypted = token.startswith(ENCRYPTED_TOKEN_PREFIX)
    if not encrypted:
        return token
    if not secret:
        raise RuntimeError("GitHub token is encrypted but no encryption key is configured")

    parts = token[len(ENCRYPTED_TOKEN_PREFIX) :].split(":")
    if len(parts) != 3:
        raise RuntimeError("Unsupported encrypted token format")

    iv_value, tag_value, encrypted_value = parts
    key = hashlib.sha256(secret.encode("utf-8")).digest()
    iv = base64.b64decode(iv_value)
    tag = base64.b64decode(tag_value)
    ciphertext = base64.b64decode(encrypted_value)
    return AESGCM(key).decrypt(iv, ciphertext + tag, None).decode("utf-8")


def get_app_github_token() -> str | None:
    return os.getenv("GITHUB_TOKEN") or os.getenv("GITHUB_PAT")
