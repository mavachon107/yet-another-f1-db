from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


class RegulatorySystemBase(SQLModel):
    abbreviation: str = Field(sa_column=Column(Text))
    name: str = Field(sa_column=Column(Text))


class RegulatorySystem(RegulatorySystemBase, table=True):
    __tablename__ = "regulatory_system"

    id: Optional[int] = Field(default=None, primary_key=True)


class RegulatorySystemCreate(RegulatorySystemBase):
    pass


class RegulatorySystemRead(RegulatorySystemBase):
    id: int


class RegulatorySystemUpdate(SQLModel):
    abbreviation: Optional[str] = Field(default=None, sa_column=Column(Text))
    name: Optional[str] = Field(default=None, sa_column=Column(Text))
