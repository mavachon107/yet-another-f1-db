from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, Enum as SAEnum
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin

class SessionType(str, Enum):
    FP1 = "FP1"
    FP2 = "FP2"
    FP3 = "FP3"
    QUALI = "QUALI"
    Q1 = "Q1"
    Q2 = "Q2"
    Q3 = "Q3"
    SQ = "SQ"
    SR = "SR"
    SQ1 = "SQ1"
    SQ2 = "SQ2"
    SQ3 = "SQ3"
    RACE = "RACE"


class SessionBase(SQLModel):
    event_id: int = Field(foreign_key="event.id")
    type: SessionType = Field(sa_column=Column(SAEnum(SessionType, name="session_type")))
    date_time_start: datetime
    date_time_end: Optional[datetime] = None
    is_cancelled: bool = Field(default=False)
    cancel_reason: Optional[str] = Field(default=None, max_length=500)


class Session(SessionBase, TimestampMixin, table=True):
    __tablename__ = "session"

    id: Optional[int] = Field(default=None, primary_key=True)


class SessionCreate(SessionBase):
    pass


class SessionRead(SessionBase, TimestampReadMixin):
    id: int
    air_temperature_min: Optional[float] = None
    air_temperature_max: Optional[float] = None
    track_temperature_min: Optional[float] = None
    track_temperature_max: Optional[float] = None
    rainfall: Optional[float] = None
    wind_speed_min: Optional[float] = None
    wind_speed_max: Optional[float] = None
    weather_code: Optional[int] = None


class SessionUpdate(SQLModel):
    event_id: Optional[int] = Field(default=None, foreign_key="event.id")
    type: Optional[SessionType] = Field(
        default=None, sa_column=Column(SAEnum(SessionType, name="session_type"))
    )
    date_time_start: Optional[datetime] = None
    date_time_end: Optional[datetime] = None
    is_cancelled: Optional[bool] = None
    cancel_reason: Optional[str] = None
