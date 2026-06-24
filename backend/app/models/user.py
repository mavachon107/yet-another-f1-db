from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Enum as SAEnum, Text, func
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class UserRole(str, Enum):
    admin = "admin"
    editor = "editor"


class UserBase(SQLModel):
    email: str = Field(
        sa_column=Column(Text, unique=True, nullable=False, index=True)
    )
    role: UserRole = Field(
        default=UserRole.editor,
        sa_column=Column(SAEnum(UserRole, name="user_role"), nullable=False),
    )
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
    )


class User(UserBase, TimestampMixin, table=True):
    __tablename__ = "user"

    id: Optional[int] = Field(default=None, primary_key=True)
    password_hash: str = Field(sa_column=Column(Text, nullable=False))


class UserPreference(TimestampMixin, table=True):
    __tablename__ = "user_preference"

    user_id: int = Field(default=None, foreign_key="user.id", primary_key=True)
    preferred_language: str = Field(
        default="en",
        sa_column=Column(Text, nullable=False, server_default="en"),
    )


class UserCreate(SQLModel):
    email: str
    password: str
    role: UserRole = UserRole.editor
    is_active: bool = True


class UserRead(UserBase, TimestampReadMixin):
    id: int


class UserUpdate(SQLModel):
    email: Optional[str] = None
    password: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None


class RefreshToken(SQLModel, table=True):
    __tablename__ = "refresh_token"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="user.id")
    token_hash: str = Field(sa_column=Column(Text, nullable=False, unique=True))
    expires_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
    revoked_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )
    created_at: datetime = Field(
        default=None,
        sa_column=Column(
            DateTime(timezone=True),
            nullable=False,
            server_default=func.now(),
        ),
    )


class RefreshTokenRead(SQLModel):
    id: int
    user_id: int
    expires_at: datetime
    revoked_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
