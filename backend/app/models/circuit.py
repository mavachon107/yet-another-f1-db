from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, DateTime, Enum as SAEnum, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class TrackDirection(str, Enum):
    CLOCKWISE = "clockwise"
    COUNTERCLOCKWISE = "counterclockwise"


class CircuitType(str, Enum):
    CIRCUIT = "circuit"
    STREET = "street"
    HYBRID = "hybrid"
    TEMPORARY = "temporary"
    OVAL = "oval"
    ROAD = "road"

class CircuitBase(SQLModel):
    short_name: str = Field(sa_column=Column(Text, index=True))
    name: str = Field(sa_column=Column(Text))
    city: Optional[str] = Field(default=None, sa_column=Column(Text))
    country: Optional[str] = Field(default=None, sa_column=Column(Text))
    timezone: Optional[str] = Field(default=None, sa_column=Column(Text))
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt: Optional[float] = None
    url: Optional[str] = Field(default=None, sa_column=Column(Text))
    opened_year: Optional[int] = None
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))


class Circuit(CircuitBase, TimestampMixin, table=True):
    __tablename__ = "circuit"
    __table_args__ = (UniqueConstraint("short_name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=120)


class CircuitCreate(CircuitBase):
    pass


class CircuitRead(CircuitBase, TimestampReadMixin):
    id: int
    slug: str
    event_count: Optional[int] = None
    first_run_year: Optional[int] = None
    last_run_year: Optional[int] = None


class CircuitUpdate(SQLModel):
    short_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    name: Optional[str] = Field(default=None, sa_column=Column(Text))
    city: Optional[str] = Field(default=None, sa_column=Column(Text))
    country: Optional[str] = Field(default=None, sa_column=Column(Text))
    timezone: Optional[str] = Field(default=None, sa_column=Column(Text))
    lat: Optional[float] = None
    lon: Optional[float] = None
    alt: Optional[float] = None
    url: Optional[str] = Field(default=None, sa_column=Column(Text))
    opened_year: Optional[int] = None
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))


class CircuitVersionBase(SQLModel):
    circuit_id: int = Field(foreign_key="circuit.id")
    version_name: str = Field(sa_column=Column(Text))
    valid_from: Optional[int] = None
    valid_to: Optional[int] = None
    lap_length_m: Optional[int] = Field(default=None, ge=1)
    length_km: Optional[float] = Field(default=None, ge=0)
    turns: Optional[int] = None
    circuit_type: Optional[CircuitType] = Field(
        default=None,
        sa_column=Column(SAEnum(CircuitType, name="circuit_type")),
    )
    direction: Optional[TrackDirection] = Field(
        default=None,
        sa_column=Column(SAEnum(TrackDirection, name="track_direction")),
    )
    layout_key: Optional[str] = Field(default=None, sa_column=Column(Text))
    source: Optional[str] = Field(default=None, sa_column=Column(Text))
    source_ref: Optional[str] = Field(default=None, sa_column=Column(Text))
    layout_image_url: Optional[str] = Field(default=None, sa_column=Column(Text))
    layout_image_updated_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )


class CircuitVersion(CircuitVersionBase, TimestampMixin, table=True):
    __tablename__ = "circuit_version"
    __table_args__ = (UniqueConstraint("circuit_id", "version_name", "valid_from"),)

    id: Optional[int] = Field(default=None, primary_key=True)


class CircuitVersionCreate(CircuitVersionBase):
    pass


class CircuitVersionRead(CircuitVersionBase, TimestampReadMixin):
    id: int


class CircuitVersionUpdate(SQLModel):
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuit.id")
    version_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    valid_from: Optional[int] = None
    valid_to: Optional[int] = None
    lap_length_m: Optional[int] = Field(default=None, ge=1)
    length_km: Optional[float] = Field(default=None, ge=0)
    turns: Optional[int] = None
    circuit_type: Optional[CircuitType] = Field(
        default=None,
        sa_column=Column(SAEnum(CircuitType, name="circuit_type")),
    )
    direction: Optional[TrackDirection] = Field(
        default=None,
        sa_column=Column(SAEnum(TrackDirection, name="track_direction")),
    )
    layout_key: Optional[str] = Field(default=None, sa_column=Column(Text))
    source: Optional[str] = Field(default=None, sa_column=Column(Text))
    source_ref: Optional[str] = Field(default=None, sa_column=Column(Text))
    layout_image_url: Optional[str] = Field(default=None, sa_column=Column(Text))
    layout_image_updated_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )
