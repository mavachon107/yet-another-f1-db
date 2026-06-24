from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class ReferenceBase(SQLModel):
    entity_type: str = Field(sa_column=Column(Text))
    entity_id: int
    ref_type: str = Field(sa_column=Column(Text))
    url: Optional[str] = Field(default=None, sa_column=Column(Text))
    citation: Optional[str] = Field(default=None, sa_column=Column(Text))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))


class Reference(ReferenceBase, TimestampMixin, table=True):
    __tablename__ = "reference"

    id: Optional[int] = Field(default=None, primary_key=True)


class ReferenceCreate(ReferenceBase):
    pass


class ReferenceRead(ReferenceBase, TimestampReadMixin):
    id: int


class ReferenceUpdate(SQLModel):
    ref_type: Optional[str] = Field(default=None, sa_column=Column(Text))
    url: Optional[str] = Field(default=None, sa_column=Column(Text))
    citation: Optional[str] = Field(default=None, sa_column=Column(Text))
    notes: Optional[str] = Field(default=None, sa_column=Column(Text))
