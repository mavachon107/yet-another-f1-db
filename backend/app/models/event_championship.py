from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class EventChampionshipBase(SQLModel):
    event_id: int = Field(foreign_key="event.id")
    championship_id: int = Field(foreign_key="championship.id")


class EventChampionship(EventChampionshipBase, TimestampMixin, table=True):
    __tablename__ = "event_championship"

    id: Optional[int] = Field(default=None, primary_key=True)


class EventChampionshipCreate(EventChampionshipBase):
    pass


class EventChampionshipRead(EventChampionshipBase, TimestampReadMixin):
    id: int


class EventChampionshipUpdate(SQLModel):
    event_id: Optional[int] = Field(default=None, foreign_key="event.id")
    championship_id: Optional[int] = Field(
        default=None, foreign_key="championship.id"
    )
