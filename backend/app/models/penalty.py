from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class PenaltyBase(SQLModel):
    session_result_id: int = Field(foreign_key="session_result.id")
    # Free-text penalty kind: not just "Grid" / "Time" but also things like
    # "Start from the back of the grid" or "Start from the pit lane".
    type: str = Field(sa_column=Column(Text))
    amount: Optional[float] = None
    reason: Optional[str] = Field(default=None, sa_column=Column(Text))


class Penalty(PenaltyBase, TimestampMixin, table=True):
    __tablename__ = "penalty"

    id: Optional[int] = Field(default=None, primary_key=True)


class PenaltyCreate(PenaltyBase):
    pass


class PenaltyRead(PenaltyBase, TimestampReadMixin):
    id: int


class PenaltyUpdate(SQLModel):
    session_result_id: Optional[int] = Field(
        default=None, foreign_key="session_result.id"
    )
    type: Optional[str] = Field(default=None, sa_column=Column(Text))
    amount: Optional[float] = None
    reason: Optional[str] = Field(default=None, sa_column=Column(Text))
