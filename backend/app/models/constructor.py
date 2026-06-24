from typing import Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class ConstructorBase(SQLModel):
    short_name: str = Field(sa_column=Column(Text))
    name: str = Field(sa_column=Column(Text))
    country: Optional[str] = Field(default=None, sa_column=Column(Text))
    founded_year: Optional[int] = None
    defunct_year: Optional[int] = None
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))


class Constructor(ConstructorBase, TimestampMixin, table=True):
    __tablename__ = "constructor"
    __table_args__ = (UniqueConstraint("short_name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=120)


class ConstructorCreate(ConstructorBase):
    pass


class ConstructorRead(ConstructorBase, TimestampReadMixin):
    id: int
    slug: str
    event_entry_count: Optional[int] = None
    first_run_year: Optional[int] = None
    last_run_year: Optional[int] = None
    wins_count: Optional[int] = None


class ConstructorUpdate(SQLModel):
    short_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    name: Optional[str] = Field(default=None, sa_column=Column(Text))
    country: Optional[str] = Field(default=None, sa_column=Column(Text))
    founded_year: Optional[int] = None
    defunct_year: Optional[int] = None
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
