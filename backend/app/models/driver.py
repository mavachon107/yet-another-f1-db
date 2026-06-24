from datetime import date, datetime
from typing import Optional

from sqlalchemy import Column, DateTime, Text
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class DriverBase(SQLModel):
    first_name: str = Field(index=True, max_length=50)
    last_name: str = Field(index=True, max_length=50)
    short_name: Optional[str] = Field(default=None, max_length=100)
    driverCode: Optional[str] = Field(default=None, max_length=250)
    url: Optional[str] = Field(default=None, max_length=2048)
    dob: Optional[date] = None
    dod: Optional[date] = None
    nationality: Optional[str] = Field(default=None, max_length=50)
    j_driver_id: Optional[str] = Field(default=None, max_length=100)
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_updated_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )


class Driver(DriverBase, TimestampMixin, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=120)


class DriverCreate(DriverBase):
    pass


class DriverRead(DriverBase, TimestampReadMixin):
    id: int
    slug: str
    event_entry_count: Optional[int] = None
    first_run_year: Optional[int] = None
    last_run_year: Optional[int] = None
    wins_count: Optional[int] = None


class DriverUpdate(SQLModel):
    first_name: Optional[str] = Field(default=None, max_length=50)
    last_name: Optional[str] = Field(default=None, max_length=50)
    short_name: Optional[str] = Field(default=None, max_length=100)
    driverCode: Optional[str] = Field(default=None, max_length=250)
    url: Optional[str] = Field(default=None, max_length=2048)
    dob: Optional[date] = None
    dod: Optional[date] = None
    nationality: Optional[str] = Field(default=None, max_length=50)
    j_driver_id: Optional[str] = Field(default=None, max_length=100)
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_updated_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )
