from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, Float, Integer, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class SessionWeatherBase(SQLModel):
    session_id: int = Field(foreign_key="session.id")
    recorded_at: datetime = Field(sa_column=Column(DateTime, nullable=False, index=True))
    air_temperature: Optional[float] = Field(default=None, sa_column=Column(Float))
    track_temperature: Optional[float] = Field(default=None, sa_column=Column(Float))
    rainfall: Optional[float] = Field(default=None, sa_column=Column(Float))
    weather_code: Optional[int] = Field(default=None, sa_column=Column(Integer))
    wind_speed: Optional[float] = Field(default=None, sa_column=Column(Float))


class SessionWeather(SessionWeatherBase, TimestampMixin, table=True):
    __tablename__ = "session_weather"
    __table_args__ = (
        UniqueConstraint("session_id", "recorded_at", name="uq_session_weather_session_recorded_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)


class SessionWeatherRead(SessionWeatherBase, TimestampReadMixin):
    id: int


class SessionWeatherSummary(SQLModel):
    session_id: int
    sample_count: int = 0
    air_temperature_min: Optional[float] = None
    air_temperature_max: Optional[float] = None
    track_temperature_min: Optional[float] = None
    track_temperature_max: Optional[float] = None
    rainfall: Optional[float] = None
    wind_speed_min: Optional[float] = None
    wind_speed_max: Optional[float] = None
    weather_code: Optional[int] = None


class SessionWeatherSeriesRead(SessionWeatherSummary):
    points: list[SessionWeatherRead] = []
