from datetime import date
from typing import Optional

from sqlalchemy import UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class EventBase(SQLModel):
    season_short_name: str = Field(foreign_key="season.short_name")
    regulatory_system_id: Optional[int] = Field(
        default=None, foreign_key="regulatory_system.id"
    )
    event_name: Optional[str] = Field(default=None, max_length=200)
    event_official_name: Optional[str] = Field(default=None, max_length=300)
    round: Optional[int] = None
    event_date: date
    circuit_id: int = Field(foreign_key="circuit.id")
    laps: Optional[int] = None
    scheduled_laps: Optional[int] = None
    distance: Optional[str] = Field(default=None, max_length=50)
    scheduled_distance: Optional[str] = Field(default=None, max_length=50)


class Event(EventBase, TimestampMixin, table=True):
    __tablename__ = "event"
    __table_args__ = (
        UniqueConstraint("season_short_name", "round"),
        UniqueConstraint("season_short_name", "slug"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    # Public URL key, unique within a season (e.g. "grand_prix_de_monaco_1956").
    slug: str = Field(index=True, max_length=160)


class EventCreate(EventBase):
    pass


class EventRead(EventBase, TimestampReadMixin):
    id: int
    slug: str


class EventUpdate(SQLModel):
    season_short_name: Optional[str] = Field(
        default=None, foreign_key="season.short_name"
    )
    regulatory_system_id: Optional[int] = Field(
        default=None, foreign_key="regulatory_system.id"
    )
    event_name: Optional[str] = Field(default=None, max_length=200)
    event_official_name: Optional[str] = Field(default=None, max_length=300)
    round: Optional[int] = None
    event_date: Optional[date] = None
    circuit_id: Optional[int] = Field(default=None, foreign_key="circuit.id")
    laps: Optional[int] = None
    scheduled_laps: Optional[int] = None
    distance: Optional[str] = Field(default=None, max_length=50)
    scheduled_distance: Optional[str] = Field(default=None, max_length=50)
