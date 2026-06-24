import os
from typing import Generator

from sqlmodel import SQLModel, Session, create_engine

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db",
)
READONLY_DATABASE_URL = os.getenv("DATABASE_URL_READONLY", DATABASE_URL)

engine = create_engine(DATABASE_URL, echo=False)
readonly_engine = create_engine(READONLY_DATABASE_URL, echo=False)


def init_db() -> None:
    # Ensure all model modules are imported before creating tables.
    from app.models import (  # noqa: F401
        api_key,
        car,
        circuit,
        championship,
        competition,
        constructor,
        constructor_lineage,
        country,
        driver,
        driver_standing,
        entry,
        event,
        event_championship,
        session,
        session_weather,
        session_result,
        season,
        point_system_definition,
        point_system_distance_rule,
        season_point_system,
        regulatory_system,
        scheduler,
        team,
        tire,
        user,
    )

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def get_readonly_session() -> Generator[Session, None, None]:
    with Session(readonly_engine) as session:
        yield session
