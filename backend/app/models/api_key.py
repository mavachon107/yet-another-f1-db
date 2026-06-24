from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, Column, DateTime, Integer, Text, func
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class ApiKeyBase(SQLModel):
    name: str = Field(sa_column=Column(Text, nullable=False))
    is_active: bool = Field(
        default=True,
        sa_column=Column(Boolean, nullable=False, server_default="true"),
    )
    rate_limit_per_minute: int = Field(
        default=60,
        sa_column=Column(Integer, nullable=False, server_default="60"),
    )
    daily_quota: int = Field(
        default=10000,
        sa_column=Column(Integer, nullable=False, server_default="10000"),
    )
    expires_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )


class ApiKey(ApiKeyBase, TimestampMixin, table=True):
    __tablename__ = "api_key"

    id: Optional[int] = Field(default=None, primary_key=True)
    key_hash: str = Field(
        sa_column=Column(Text, nullable=False, unique=True, index=True)
    )
    key_prefix: str = Field(sa_column=Column(Text, nullable=False))
    created_by_user_id: int = Field(
        sa_column=Column(Integer, nullable=False),
    )


class ApiKeyCreate(SQLModel):
    name: str
    rate_limit_per_minute: int = 60
    daily_quota: int = 10000
    expires_at: Optional[datetime] = None


class ApiKeyRead(ApiKeyBase, TimestampReadMixin):
    id: int
    key_prefix: str
    created_by_user_id: int


class ApiKeyReadWithSecret(ApiKeyRead):
    raw_key: str


class ApiKeyUpdate(SQLModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None
    rate_limit_per_minute: Optional[int] = None
    daily_quota: Optional[int] = None
    expires_at: Optional[datetime] = None
