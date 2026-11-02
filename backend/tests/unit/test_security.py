"""Unit tests for password hashing and JWT."""
import pytest
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
    hash_token,
)


def test_password_hash_and_verify():
    plain = "SecurePass123!"
    hashed = hash_password(plain)
    assert hashed != plain
    assert verify_password(plain, hashed)
    assert not verify_password("wrong", hashed)


def test_access_token_roundtrip():
    token = create_access_token(subject="user123", extra_claims={"role": "USER"})
    payload = decode_token(token)
    assert payload["sub"] == "user123"
    assert payload["type"] == "access"
    assert payload["role"] == "USER"


def test_hash_token_deterministic():
    t = "some-refresh-token"
    assert hash_token(t) == hash_token(t)
    assert len(hash_token(t)) == 64
