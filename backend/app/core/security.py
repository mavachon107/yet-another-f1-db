from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from jose import jwt
from passlib.context import CryptContext

from app.core.config import JWT_ALGORITHM, JWT_SECRET_KEY

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
MAX_BCRYPT_PASSWORD_BYTES = 72


def _password_exceeds_bcrypt_limit(password: str) -> bool:
    return len(password.encode("utf-8")) > MAX_BCRYPT_PASSWORD_BYTES


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if _password_exceeds_bcrypt_limit(plain_password):
        return False
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    if _password_exceeds_bcrypt_limit(password):
        raise ValueError(
            f"Password cannot exceed {MAX_BCRYPT_PASSWORD_BYTES} bytes for bcrypt."
        )
    return pwd_context.hash(password)


def create_access_token(payload: dict[str, Any], expires_at: datetime) -> str:
    to_encode = payload.copy()
    to_encode["exp"] = expires_at
    return jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)
