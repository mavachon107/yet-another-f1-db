from enum import Enum
from typing import Optional

from sqlalchemy import Column, Enum as SAEnum, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

from app.models.constructor import ConstructorRead
from app.models.mixins import TimestampMixin, TimestampReadMixin


class EngineLayout(str, Enum):
    L = "L"
    V = "V"
    F = "F"
    W = "W"
    H = "H"


class EngineAspirationType(str, Enum):
    NATURALLY_ASPIRED = "naturally_aspired"
    SUPERCHARGED = "supercharged"
    TURBOCHARGED = "turbocharged"
    HYBRID = "hybrid"


class EngineBase(SQLModel):
    constructor_id: Optional[int] = Field(default=None, foreign_key="constructor.id")
    model_number: Optional[str] = Field(default=None, sa_column=Column(Text))
    tagged_indicator: bool = Field(default=False)
    tagged_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    layout_id: Optional[EngineLayout] = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                EngineLayout,
                name="engine_layout",
                values_callable=lambda enum: [item.value for item in enum],
            )
        ),
    )
    cylinder_count: Optional[int] = None
    displacement_cc: Optional[int] = None
    aspiration_type_id: Optional[EngineAspirationType] = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                EngineAspirationType,
                name="engine_aspiration_type",
                values_callable=lambda enum: [item.value for item in enum],
            )
        ),
    )


class Engine(EngineBase, TimestampMixin, table=True):
    __tablename__ = "engine"
    __table_args__ = (
        UniqueConstraint("constructor_id", "model_number", name="uq_engine_constructor_model"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(index=True, unique=True, max_length=160)


class EngineCreate(EngineBase):
    pass


class EngineRead(EngineBase, TimestampReadMixin):
    id: int
    slug: str


class EngineResolved(EngineRead):
    constructor: Optional[ConstructorRead] = None


class EngineUpdate(SQLModel):
    constructor_id: Optional[int] = Field(default=None, foreign_key="constructor.id")
    model_number: Optional[str] = Field(default=None, sa_column=Column(Text))
    tagged_indicator: Optional[bool] = None
    tagged_name: Optional[str] = Field(default=None, sa_column=Column(Text))
    layout_id: Optional[EngineLayout] = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                EngineLayout,
                name="engine_layout",
                values_callable=lambda enum: [item.value for item in enum],
            )
        ),
    )
    cylinder_count: Optional[int] = None
    displacement_cc: Optional[int] = None
    aspiration_type_id: Optional[EngineAspirationType] = Field(
        default=None,
        sa_column=Column(
            SAEnum(
                EngineAspirationType,
                name="engine_aspiration_type",
                values_callable=lambda enum: [item.value for item in enum],
            )
        ),
    )
