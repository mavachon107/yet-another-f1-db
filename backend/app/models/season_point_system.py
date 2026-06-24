from typing import Optional

from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class SeasonPointSystemBase(SQLModel):
    season_id: int = Field(foreign_key="season.id")
    championship_id: int = Field(foreign_key="championship.id")
    point_system_definition_id: int = Field(foreign_key="point_system_definition.id")
    session_type: str


class SeasonPointSystem(SeasonPointSystemBase, TimestampMixin, table=True):
    __tablename__ = "season_point_system"

    id: Optional[int] = Field(default=None, primary_key=True)


class SeasonPointSystemCreate(SeasonPointSystemBase):
    pass


class SeasonPointSystemRead(SeasonPointSystemBase, TimestampReadMixin):
    id: int


class SeasonPointSystemUpdate(SQLModel):
    season_id: Optional[int] = Field(default=None, foreign_key="season.id")
    championship_id: Optional[int] = Field(default=None, foreign_key="championship.id")
    point_system_definition_id: Optional[int] = Field(
        default=None, foreign_key="point_system_definition.id"
    )
    session_type: Optional[str] = None
