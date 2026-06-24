from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.constructor import ConstructorRead
from app.models.driver import DriverRead
from app.models.mixins import TimestampMixin, TimestampReadMixin


class DriverStandingBase(SQLModel):
    event_id: int | None = Field(default=None, foreign_key="event.id")
    season_id: int | None = Field(default=None, foreign_key="season.id")
    standing_type: str = Field(default="DRIVER")
    driver_id: int | None = Field(default=None, foreign_key="driver.id")
    constructor_id: int | None = Field(default=None, foreign_key="constructor.id")
    position: str = Field(sa_column=Column(Text))
    points: float


class DriverStanding(DriverStandingBase, TimestampMixin, table=True):
    __tablename__ = "standing"

    id: int | None = Field(default=None, primary_key=True)


class DriverStandingCreate(DriverStandingBase):
    pass


class DriverStandingRead(DriverStandingBase, TimestampReadMixin):
    id: int


class DriverStandingUpdate(SQLModel):
    event_id: int | None = Field(default=None, foreign_key="event.id")
    season_id: int | None = Field(default=None, foreign_key="season.id")
    standing_type: str | None = None
    driver_id: int | None = Field(default=None, foreign_key="driver.id")
    constructor_id: int | None = Field(default=None, foreign_key="constructor.id")
    position: str | None = None
    points: float | None = None


class DriverStandingResolved(SQLModel):
    id: int
    season_id: int | None = None
    standing_type: str
    position: str
    points: float
    driver: Optional[DriverRead] = None
    constructor: Optional[ConstructorRead] = None


class DriverStandingCalculated(SQLModel):
    season_id: int
    standing_type: str
    position: str
    points: float
    driver: Optional[DriverRead] = None
