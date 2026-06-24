from typing import Optional

from pydantic import ConfigDict
from sqlalchemy import CheckConstraint, Column, ForeignKey, Integer, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class ConstructorLineageBase(SQLModel):
    constructor_id: int = Field(sa_column=Column(Integer, ForeignKey("constructor.id"), nullable=False))
    parent_constructor_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("constructor.id"), nullable=True),
    )
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))


class ConstructorLineage(ConstructorLineageBase, TimestampMixin, table=True):
    __tablename__ = "constructor_lineage"
    __table_args__ = (
        UniqueConstraint("constructor_id", name="uq_constructor_lineage_constructor"),
        CheckConstraint(
            "constructor_id <> parent_constructor_id",
            name="ck_constructor_lineage_not_self",
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)


class ConstructorLineageCreate(ConstructorLineageBase):
    model_config = ConfigDict(extra="forbid")


class ConstructorLineageRead(ConstructorLineageBase, TimestampReadMixin):
    id: int


class ConstructorLineageUpdate(SQLModel):
    parent_constructor_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("constructor.id"), nullable=True),
    )
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))

    model_config = ConfigDict(extra="forbid")
