from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin
from app.models.car import CarRead
from app.models.driver import DriverRead
from app.models.team import TeamRead


class DriverOfTheDayBase(SQLModel):
    event_id: int = Field(foreign_key="event.id")
    entry_id: int = Field(foreign_key="event_entry.id")
    position: int
    percentage: Optional[float] = None


class DriverOfTheDay(DriverOfTheDayBase, TimestampMixin, table=True):
    __tablename__ = "driver_of_the_day"

    id: Optional[int] = Field(default=None, primary_key=True)


class DriverOfTheDayCreate(DriverOfTheDayBase):
    pass


class DriverOfTheDayRead(DriverOfTheDayBase, TimestampReadMixin):
    id: int


class DriverOfTheDayUpdate(SQLModel):
    event_id: Optional[int] = None
    entry_id: Optional[int] = None
    position: Optional[int] = None
    percentage: Optional[float] = None


class DriverOfTheDayResolved(SQLModel):
    id: int
    event_id: int
    entry_id: int
    position: int
    percentage: float | None = None
    driver: DriverRead | None = None
    team: TeamRead | None = None
    car: CarRead | None = None
