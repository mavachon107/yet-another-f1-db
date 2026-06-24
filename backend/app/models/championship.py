from typing import Optional

from sqlalchemy import Column, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class ChampionshipBase(SQLModel):
    short_name: str = Field(sa_column=Column(Text))
    championship_name: str = Field(sa_column=Column(Text))


class Championship(ChampionshipBase, TimestampMixin, table=True):
    __tablename__ = "championship"
    __table_args__ = (UniqueConstraint("short_name"),)

    id: Optional[int] = Field(default=None, primary_key=True)


class ChampionshipCreate(ChampionshipBase):
    pass


class ChampionshipRead(ChampionshipBase, TimestampReadMixin):
    id: int


class ChampionshipUpdate(SQLModel):
    short_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    championship_name: Optional[str] = Field(default=None, sa_column=Column(Text))
