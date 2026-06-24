from typing import Optional

from sqlalchemy import CheckConstraint, Column, Float
from sqlmodel import Field, SQLModel

from app.models.mixins import TimestampMixin, TimestampReadMixin


class PointSystemDistanceRuleBase(SQLModel):
    point_system_definition_id: int = Field(foreign_key="point_system_definition.id")
    lower_pct: float = Field(sa_column=Column(Float, nullable=False))
    upper_pct: float = Field(sa_column=Column(Float, nullable=False))
    point_multiplier: float = Field(
        default=1.0, sa_column=Column(Float, nullable=False, server_default="1")
    )


class PointSystemDistanceRule(PointSystemDistanceRuleBase, TimestampMixin, table=True):
    __tablename__ = "point_system_distance_rule"
    __table_args__ = (
        CheckConstraint("lower_pct >= 0", name="ck_ps_distance_rule_lower_non_negative"),
        CheckConstraint(
            "upper_pct <= 1", name="ck_ps_distance_rule_upper_bounded_by_one"
        ),
        CheckConstraint(
            "lower_pct < upper_pct", name="ck_ps_distance_rule_range_order"
        ),
    )

    id: Optional[int] = Field(default=None, primary_key=True)


class PointSystemDistanceRuleCreate(PointSystemDistanceRuleBase):
    pass


class PointSystemDistanceRuleRead(PointSystemDistanceRuleBase, TimestampReadMixin):
    id: int


class PointSystemDistanceRuleUpdate(SQLModel):
    point_system_definition_id: Optional[int] = Field(
        default=None, foreign_key="point_system_definition.id"
    )
    lower_pct: Optional[float] = None
    upper_pct: Optional[float] = None
    point_multiplier: Optional[float] = None
