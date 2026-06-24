from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel


class CountryBase(SQLModel):
    code: str = Field(sa_column=Column(Text, primary_key=True))
    alpha2_code: Optional[str] = Field(default=None, sa_column=Column(Text))
    name: str = Field(sa_column=Column(Text))
    nationality: Optional[str] = Field(default=None, sa_column=Column(Text))


class Country(CountryBase, table=True):
    __tablename__ = "country"


class CountryCreate(CountryBase):
    pass


class CountryRead(CountryBase):
    pass


class CountryUpdate(SQLModel):
    alpha2_code: Optional[str] = Field(default=None, sa_column=Column(Text))
    name: Optional[str] = Field(default=None, sa_column=Column(Text))
    nationality: Optional[str] = Field(default=None, sa_column=Column(Text))
