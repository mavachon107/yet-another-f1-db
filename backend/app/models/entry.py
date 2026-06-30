from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.car import CarResolved
from app.models.driver import DriverRead
from app.models.event import EventRead
from app.models.team import TeamRead
from app.models.tire import TireRead
from app.models.mixins import TimestampMixin, TimestampReadMixin

class EventEntryBase(SQLModel):
    event_id: int = Field(foreign_key="event.id")
    car_id: int = Field(foreign_key="car.id")
    driver_id: int = Field(foreign_key="driver.id")
    team_id: Optional[int] = Field(default=None, foreign_key="team.id")
    tire_id: Optional[int] = Field(default=None, foreign_key="tire.id")
    car_number: Optional[int] = None
    # When set, this entry is a substitute (e.g. an FP1-only stand-in) sharing the
    # car of the referenced primary entry. Substitute rows are excluded from
    # entry/car counts so they do not show up as an additional registered entry.
    substitute_entry_id: Optional[int] = Field(
        default=None, foreign_key="event_entry.id"
    )


class EventEntry(EventEntryBase, TimestampMixin, table=True):
    __tablename__ = "event_entry"

    id: Optional[int] = Field(default=None, primary_key=True)


class EventEntryCreate(EventEntryBase):
    pass


class EventEntryRead(EventEntryBase, TimestampReadMixin):
    id: int


class EventEntryResolved(SQLModel):
    id: int
    car_number: Optional[int] = None
    substitute_entry_id: Optional[int] = None
    driver: Optional[DriverRead] = None
    team: Optional[TeamRead] = None
    car: Optional[CarResolved] = None
    tire: Optional[TireRead] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class EventEntryResolvedWithEvent(SQLModel):
    id: int
    car_number: Optional[int] = None
    substitute_entry_id: Optional[int] = None
    driver: Optional[DriverRead] = None
    team: Optional[TeamRead] = None
    car: Optional[CarResolved] = None
    tire: Optional[TireRead] = None
    event: Optional[EventRead] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class EventEntryUpdate(SQLModel):
    event_id: Optional[int] = Field(default=None, foreign_key="event.id")
    car_id: Optional[int] = Field(default=None, foreign_key="car.id")
    driver_id: Optional[int] = Field(default=None, foreign_key="driver.id")
    team_id: Optional[int] = Field(default=None, foreign_key="team.id")
    tire_id: Optional[int] = Field(default=None, foreign_key="tire.id")
    car_number: Optional[int] = None
    substitute_entry_id: Optional[int] = Field(
        default=None, foreign_key="event_entry.id"
    )
