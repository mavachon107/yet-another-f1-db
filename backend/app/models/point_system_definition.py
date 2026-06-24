from typing import Any, Optional

from sqlalchemy import CheckConstraint, Column, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class PointSystemDefinitionBase(SQLModel):
    source_file_name: str = Field(sa_column=Column(Text, unique=True, nullable=False))
    start_year: int
    end_year: int
    race_count: Optional[int] = None
    position_points: list[dict[str, Any]] = Field(
        sa_column=Column(JSONB, nullable=False)
    )
    race_count_mode: str = Field(
        default="all", sa_column=Column(Text, nullable=False, server_default="all")
    )


class PointSystemDefinition(PointSystemDefinitionBase, TimestampMixin, table=True):
    __tablename__ = "point_system_definition"
    __table_args__ = (
        CheckConstraint(
            "start_year <= end_year", name="ck_point_system_definition_year_range"
        ),
        CheckConstraint(
            "race_count IS NULL OR race_count > 0",
            name="ck_point_system_definition_race_count_positive",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)


class PointSystemDefinitionCreate(PointSystemDefinitionBase):
    pass


class PointSystemDefinitionRead(PointSystemDefinitionBase, TimestampReadMixin):
    id: int


class PointSystemDefinitionUpdate(SQLModel):
    source_file_name: Optional[str] = None
    start_year: Optional[int] = None
    end_year: Optional[int] = None
    race_count: Optional[int] = None
    position_points: Optional[list[dict[str, Any]]] = None
    race_count_mode: Optional[str] = None
