from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class CompetitionBase(SQLModel):
    name: str = Field(sa_column=Column(Text))
    era: Optional[str] = Field(default=None, sa_column=Column(Text))
    scope: Optional[str] = Field(default=None, sa_column=Column(Text))


class Competition(CompetitionBase, TimestampMixin, table=True):
    __tablename__ = "competition"

    id: Optional[int] = Field(default=None, primary_key=True)


class CompetitionCreate(CompetitionBase):
    pass


class CompetitionRead(CompetitionBase, TimestampReadMixin):
    id: int


class CompetitionUpdate(SQLModel):
    name: Optional[str] = Field(default=None, sa_column=Column(Text))
    era: Optional[str] = Field(default=None, sa_column=Column(Text))
    scope: Optional[str] = Field(default=None, sa_column=Column(Text))
