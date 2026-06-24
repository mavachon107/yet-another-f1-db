from __future__ import annotations

import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.auth import get_current_user, require_role
from app.core.api_key_auth import get_key_usage, invalidate_key_cache
from app.database import get_session
from app.models.api_key import (
    ApiKey,
    ApiKeyCreate,
    ApiKeyRead,
    ApiKeyReadWithSecret,
    ApiKeyUpdate,
)
from app.models.user import User, UserRole

admin_router = APIRouter(
    prefix="/api/admin/api-keys",
    tags=["api-keys"],
    dependencies=[Depends(require_role({UserRole.admin}))],
)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_raw_key() -> str:
    return f"f1_{secrets.token_urlsafe(32)}"


@admin_router.post("", response_model=ApiKeyReadWithSecret, status_code=201)
def create_api_key(
    payload: ApiKeyCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApiKeyReadWithSecret:
    raw_key = _generate_raw_key()
    api_key = ApiKey(
        name=payload.name,
        key_hash=_hash_key(raw_key),
        key_prefix=raw_key[:11],  # "f1_" + first 8 chars of token
        is_active=True,
        rate_limit_per_minute=payload.rate_limit_per_minute,
        daily_quota=payload.daily_quota,
        expires_at=payload.expires_at,
        created_by_user_id=current_user.id,
    )
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    return ApiKeyReadWithSecret(
        **ApiKeyRead.model_validate(api_key).model_dump(),
        raw_key=raw_key,
    )


@admin_router.get("", response_model=list[ApiKeyRead])
def list_api_keys(session: Session = Depends(get_session)) -> list[ApiKeyRead]:
    keys = session.exec(select(ApiKey).order_by(ApiKey.created_at.desc())).all()
    return [ApiKeyRead.model_validate(k) for k in keys]


@admin_router.get("/{key_id}", response_model=ApiKeyRead)
def get_api_key(
    key_id: int, session: Session = Depends(get_session)
) -> ApiKeyRead:
    api_key = session.get(ApiKey, key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found.")
    return ApiKeyRead.model_validate(api_key)


@admin_router.patch("/{key_id}", response_model=ApiKeyRead)
def update_api_key(
    key_id: int,
    payload: ApiKeyUpdate,
    session: Session = Depends(get_session),
) -> ApiKeyRead:
    api_key = session.get(ApiKey, key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found.")
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(api_key, field, value)
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    invalidate_key_cache(api_key.key_hash)
    return ApiKeyRead.model_validate(api_key)


@admin_router.delete("/{key_id}", status_code=204)
def delete_api_key(
    key_id: int, session: Session = Depends(get_session)
) -> None:
    api_key = session.get(ApiKey, key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found.")
    old_hash = api_key.key_hash
    session.delete(api_key)
    session.commit()
    invalidate_key_cache(old_hash)


@admin_router.post("/{key_id}/rotate", response_model=ApiKeyReadWithSecret)
def rotate_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ApiKeyReadWithSecret:
    api_key = session.get(ApiKey, key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found.")
    old_hash = api_key.key_hash
    raw_key = _generate_raw_key()
    api_key.key_hash = _hash_key(raw_key)
    api_key.key_prefix = raw_key[:11]
    session.add(api_key)
    session.commit()
    session.refresh(api_key)
    invalidate_key_cache(old_hash)
    return ApiKeyReadWithSecret(
        **ApiKeyRead.model_validate(api_key).model_dump(),
        raw_key=raw_key,
    )


@admin_router.get("/{key_id}/usage")
def get_api_key_usage(
    key_id: int, session: Session = Depends(get_session)
) -> dict:
    api_key = session.get(ApiKey, key_id)
    if not api_key:
        raise HTTPException(status_code=404, detail="API key not found.")
    usage = get_key_usage(api_key.id)
    return {
        "key_id": key_id,
        "name": api_key.name,
        "rate_limit_per_minute": api_key.rate_limit_per_minute,
        "daily_quota": api_key.daily_quota,
        **usage,
    }
