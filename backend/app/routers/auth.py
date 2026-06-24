from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.core.auth import get_current_user, require_role
from app.core.config import access_token_ttl, refresh_token_ttl
from app.core.security import (
    MAX_BCRYPT_PASSWORD_BYTES,
    create_access_token,
    get_password_hash,
    utcnow,
    verify_password,
)
from app.database import get_session
from app.models.user import (
    RefreshToken,
    User,
    UserCreate,
    UserPreference,
    UserRead,
    UserRole,
)

router = APIRouter(prefix="/api/admin", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


SUPPORTED_PROFILE_LANGUAGES = ("en", "fr")
SUPPORTED_PROFILE_LANGUAGES_SET = set(SUPPORTED_PROFILE_LANGUAGES)


class UserProfileResponse(BaseModel):
    email: str
    role: UserRole
    is_active: bool
    preferred_language: str


class UserProfileUpdateRequest(BaseModel):
    preferred_language: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _normalize_preferred_language(value: str) -> str:
    normalized = str(value or "").strip().replace("_", "-").lower()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Preferred language is required.",
        )
    if normalized not in SUPPORTED_PROFILE_LANGUAGES_SET:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Unsupported language. "
                f"Supported values: {', '.join(SUPPORTED_PROFILE_LANGUAGES)}."
            ),
        )
    return normalized


def _resolve_preferred_language(session: Session, user_id: int) -> str:
    preference = session.get(UserPreference, user_id)
    if preference and preference.preferred_language:
        return preference.preferred_language
    return "en"


def _issue_tokens(user: User, session: Session) -> TokenResponse:
    now = utcnow()
    access_exp = now + access_token_ttl()
    refresh_exp = now + refresh_token_ttl()
    access_token = create_access_token(
        {"sub": str(user.id), "role": user.role.value},
        expires_at=access_exp,
    )
    refresh_token = secrets.token_urlsafe(48)
    refresh_hash = _hash_token(refresh_token)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=refresh_hash,
            expires_at=refresh_exp,
        )
    )
    session.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> TokenResponse:
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is inactive.",
        )
    return _issue_tokens(user, session)


@router.post("/auth/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, session: Session = Depends(get_session)) -> TokenResponse:
    token_hash = _hash_token(payload.refresh_token)
    token = session.exec(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).first()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token.",
        )
    if token.revoked_at is not None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token revoked.",
        )
    if token.expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token expired.",
        )
    user = session.get(User, token.user_id)
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User inactive or missing.",
        )
    token.revoked_at = utcnow()
    session.add(token)
    session.commit()
    return _issue_tokens(user, session)


@router.post("/auth/logout")
def logout(payload: RefreshRequest, session: Session = Depends(get_session)) -> dict:
    token_hash = _hash_token(payload.refresh_token)
    token = session.exec(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).first()
    if token and token.revoked_at is None:
        token.revoked_at = utcnow()
        session.add(token)
        session.commit()
    return {"status": "ok"}


@router.get("/users/me", response_model=UserRead)
def read_me(current_user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.get("/users/me/profile", response_model=UserProfileResponse)
def read_my_profile(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    return UserProfileResponse(
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        preferred_language=_resolve_preferred_language(session, current_user.id),
    )


@router.patch("/users/me/profile", response_model=UserProfileResponse)
def update_my_profile(
    payload: UserProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    preferred_language = _normalize_preferred_language(payload.preferred_language)
    preference = session.get(UserPreference, current_user.id)
    if preference is None:
        preference = UserPreference(
            user_id=current_user.id,
            preferred_language=preferred_language,
        )
    else:
        preference.preferred_language = preferred_language
    session.add(preference)
    session.commit()
    return UserProfileResponse(
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        preferred_language=preferred_language,
    )


@router.post("/users/me/change-password")
def change_my_password(
    payload: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect.",
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password.",
        )
    if len(payload.new_password.encode("utf-8")) > MAX_BCRYPT_PASSWORD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Password is too long for bcrypt. "
                f"Use at most {MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes."
            ),
        )

    current_user.password_hash = get_password_hash(payload.new_password)
    session.add(current_user)

    active_tokens = session.exec(
        select(RefreshToken).where(
            RefreshToken.user_id == current_user.id,
            RefreshToken.revoked_at.is_(None),
        )
    ).all()
    revoked_at = utcnow()
    for token in active_tokens:
        token.revoked_at = revoked_at
        session.add(token)

    session.commit()
    return {"status": "ok"}


@router.post("/users", response_model=UserRead)
def create_user(
    payload: UserCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> UserRead:
    if len(payload.password.encode("utf-8")) > MAX_BCRYPT_PASSWORD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Password is too long for bcrypt. "
                f"Use at most {MAX_BCRYPT_PASSWORD_BYTES} UTF-8 bytes."
            ),
        )
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already in use.",
        )
    user = User(
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return UserRead.model_validate(user)
