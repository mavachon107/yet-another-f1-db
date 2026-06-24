from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class TireBase(SQLModel):
    short_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    abbreviation: Optional[str] = Field(default=None, sa_column=Column(Text))
    tire_type: str = Field(sa_column=Column(Text))
    manufactor_name: str = Field(sa_column=Column(Text))


class Tire(TireBase, TimestampMixin, table=True):
    __tablename__ = "tire"

    id: Optional[int] = Field(default=None, primary_key=True)


class TireCreate(TireBase):
    pass


class TireRead(TireBase, TimestampReadMixin):
    id: int


class TireUpdate(SQLModel):
    short_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    abbreviation: Optional[str] = Field(default=None, sa_column=Column(Text))
    tire_type: Optional[str] = Field(default=None, sa_column=Column(Text))
    manufactor_name: Optional[str] = Field(default=None, sa_column=Column(Text))
