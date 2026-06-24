from datetime import datetime
from typing import Optional

from sqlalchemy import Column, DateTime, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.constructor import ConstructorRead
from app.models.engine import EngineResolved
from app.models.mixins import TimestampMixin, TimestampReadMixin


class CarBase(SQLModel):
    constructor_id: Optional[int] = Field(default=None, foreign_key="constructor.id")
    chassis_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    engine_id: Optional[int] = Field(default=None, foreign_key="engine.id")
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_updated_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )


class Car(CarBase, TimestampMixin, table=True):
    __tablename__ = "car"
    __table_args__ = (
        UniqueConstraint("constructor_id", "chassis_name", "engine_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=160)


class CarCreate(CarBase):
    pass


class CarRead(CarBase, TimestampReadMixin):
    id: int
    slug: str
    event_entry_count: Optional[int] = None
    first_run_year: Optional[int] = None
    last_run_year: Optional[int] = None
    wins_count: Optional[int] = None
    world_driver_entries: Optional[int] = None
    world_constructor_entries: Optional[int] = None


class CarResolved(CarRead):
    constructor: Optional[ConstructorRead] = None
    engine: Optional[EngineResolved] = None


class CarUpdate(SQLModel):
    constructor_id: Optional[int] = Field(default=None, foreign_key="constructor.id")
    chassis_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    engine_id: Optional[int] = Field(default=None, foreign_key="engine.id")
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_url: Optional[str] = Field(default=None, sa_column=Column(Text))
    image_updated_at: Optional[datetime] = Field(
        default=None, sa_column=Column(DateTime(timezone=True))
    )
