from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.entry import EventEntryResolved
from app.models.penalty import PenaltyRead
from app.models.session import SessionRead
from app.models.mixins import TimestampMixin, TimestampReadMixin


class SessionResultBase(SQLModel):
    session_id: int = Field(foreign_key="session.id")
    entry_id: int = Field(foreign_key="event_entry.id")
    shared_drive_entry_id: Optional[int] = Field(
        default=None, foreign_key="event_entry.id"
    )
    position: Optional[str] = Field(default=None, sa_column=Column(Text))
    points: Optional[float] = None
    time: Optional[str] = Field(default=None, sa_column=Column(Text))
    gap: Optional[str] = Field(default=None, sa_column=Column(Text))
    interval: Optional[str] = Field(default=None, sa_column=Column(Text))
    laps: Optional[int] = None
    time_penalty: Optional[str] = Field(default=None, sa_column=Column(Text))
    grid_position: Optional[str] = Field(default=None, sa_column=Column(Text))
    retired_reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    speed_trap: Optional[float] = None


class SessionResult(SessionResultBase, TimestampMixin, table=True):
    __tablename__ = "session_result"

    id: Optional[int] = Field(default=None, primary_key=True)


class SessionResultCreate(SessionResultBase):
    pass


class SessionResultRead(SessionResultBase, TimestampReadMixin):
    id: int


class SessionResultResolved(SQLModel):
    id: int
    position: Optional[str] = None
    points: Optional[float] = None
    time: Optional[str] = None
    gap: Optional[str] = None
    interval: Optional[str] = None
    laps: Optional[int] = None
    time_penalty: Optional[str] = None
    grid_position: Optional[str] = None
    retired_reason: Optional[str] = None
    speed_trap: Optional[float] = None
    shared_drive_entry_id: Optional[int] = None
    entry: Optional[EventEntryResolved] = None
    shared_drive_entry: Optional[EventEntryResolved] = None
    penalties: list[PenaltyRead] = []
    session: Optional[SessionRead] = None


class SessionResultResolvedNoSession(SQLModel):
    id: int
    position: Optional[str] = None
    points: Optional[float] = None
    time: Optional[str] = None
    gap: Optional[str] = None
    interval: Optional[str] = None
    laps: Optional[int] = None
    time_penalty: Optional[str] = None
    grid_position: Optional[str] = None
    retired_reason: Optional[str] = None
    speed_trap: Optional[float] = None
    shared_drive_entry_id: Optional[int] = None
    entry: Optional[EventEntryResolved] = None
    shared_drive_entry: Optional[EventEntryResolved] = None
    penalties: list[PenaltyRead] = []


class SessionResultUpdate(SQLModel):
    session_id: Optional[int] = Field(default=None, foreign_key="session.id")
    entry_id: Optional[int] = Field(default=None, foreign_key="event_entry.id")
    shared_drive_entry_id: Optional[int] = Field(
        default=None, foreign_key="event_entry.id"
    )
    position: Optional[str] = Field(default=None, sa_column=Column(Text))
    points: Optional[float] = None
    time: Optional[str] = Field(default=None, sa_column=Column(Text))
    gap: Optional[str] = Field(default=None, sa_column=Column(Text))
    interval: Optional[str] = Field(default=None, sa_column=Column(Text))
    laps: Optional[int] = None
    time_penalty: Optional[str] = Field(default=None, sa_column=Column(Text))
    grid_position: Optional[str] = Field(default=None, sa_column=Column(Text))
    retired_reason: Optional[str] = Field(default=None, sa_column=Column(Text))
    speed_trap: Optional[float] = None
