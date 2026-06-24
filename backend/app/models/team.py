from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class TeamBase(SQLModel):
    team_name: str = Field(sa_column=Column(Text))
    short_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    country: Optional[str] = Field(default=None, sa_column=Column(Text))
    url: Optional[str] = Field(default=None, sa_column=Column(Text))
    constructor_id: Optional[int] = Field(default=None, foreign_key="constructor.id")


class Team(TeamBase, TimestampMixin, table=True):
    __tablename__ = "team"

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=120)


class TeamCreate(TeamBase):
    pass


class TeamRead(TeamBase, TimestampReadMixin):
    id: int
    slug: str
    event_entry_count: Optional[int] = None
    first_run_year: Optional[int] = None
    last_run_year: Optional[int] = None
    wins_count: Optional[int] = None
    constructor_name: Optional[str] = None
    constructor_slug: Optional[str] = None


class TeamUpdate(SQLModel):
    team_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    short_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    country: Optional[str] = Field(default=None, sa_column=Column(Text))
    url: Optional[str] = Field(default=None, sa_column=Column(Text))
    constructor_id: Optional[int] = Field(default=None, foreign_key="constructor.id")
