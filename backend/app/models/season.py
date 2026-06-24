from typing import Optional

from sqlalchemy import Column, String, Text
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class SeasonBase(SQLModel):
    year: int
    short_name: str = Field(sa_column=Column(String(32), unique=True))
    competition_id: int = Field(foreign_key="competition.id")
    rules: Optional[str] = Field(default=None, sa_column=Column(Text))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))


class Season(SeasonBase, TimestampMixin, table=True):
    __tablename__ = "season"

    id: Optional[int] = Field(default=None, primary_key=True)


class SeasonCreate(SeasonBase):
    pass


class SeasonRead(SeasonBase, TimestampReadMixin):
    id: int


class SeasonUpdate(SQLModel):
    year: Optional[int] = None
    short_name: Optional[str] = None
    competition_id: Optional[int] = Field(default=None, foreign_key="competition.id")
    rules: Optional[str] = Field(default=None, sa_column=Column(Text))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
