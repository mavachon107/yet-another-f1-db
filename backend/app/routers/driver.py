import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import case, func
from sqlmodel import Session, SQLModel, select

from app.core.auth import require_role
from app.core.slug import unique_driver_slug
from app.database import get_readonly_session, get_session
from app.models.championship import Championship
from app.models.car import Car, CarRead
from app.models.driver import Driver, DriverCreate, DriverRead, DriverUpdate
from app.models.driver_of_the_day import DriverOfTheDay
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.session import Session as EventSession
from app.models.session import SessionType
from app.models.session_result import SessionResult
from app.models.team import Team, TeamRead
from app.routers.team import _resolve_teams
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/drivers", tags=["drivers"])
public_router = APIRouter(prefix="/v1/drivers", tags=["drivers"])
admin_router = APIRouter(
    prefix="/api/admin/drivers",
    tags=["drivers"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)
F1_DRIVER_CHAMPIONSHIP = "f1_driver_world"
DRIVER_IMAGE_BASE_URL = os.getenv("DRIVER_IMAGE_BASE_URL", "/static/uploads/drivers")
DRIVER_IMAGE_DIR = Path(
    os.getenv(
        "DRIVER_IMAGE_DIR",
        Path(__file__).resolve().parents[1] / "static" / "uploads" / "drivers",
    )
)
MAX_IMAGE_BYTES = int(os.getenv("DRIVER_IMAGE_MAX_BYTES", str(5 * 1024 * 1024)))
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}




class DriverStats(SQLModel):
    starts: int
    poles: int
    wins: int
    podiums: int
    years_active: int
    first_event_name: str | None = None
    last_event_name: str | None = None


class DriverWinEntry(SQLModel):
    event_id: int
    event_slug: str | None = None
    event_name: str | None = None
    year: int
    team: TeamRead | None = None
    car: CarRead | None = None


class DriverCount(SQLModel):
    driver_id: int
    slug: str | None = None
    first_name: str | None = None
    last_name: str | None = None
    short_name: str | None = None
    nationality: str | None = None
    total: int


class DriverWinsByYear(SQLModel):
    year: int
    wins: int
    events: int


def _local_image_path(image_url: str | None) -> Path | None:
    if not image_url:
        return None
    base = DRIVER_IMAGE_BASE_URL.rstrip("/")
    if not image_url.startswith(base):
        return None
    relative = image_url[len(base) :].lstrip("/")
    if not relative:
        return None
    resolved = (DRIVER_IMAGE_DIR / relative).resolve()
    if not resolved.is_relative_to(DRIVER_IMAGE_DIR.resolve()):
        return None
    return resolved


def _resolve_drivers(
    drivers: list[Driver], session: Session
) -> list[DriverRead]:
    driver_ids = [d.id for d in drivers if d.id is not None]
    entry_counts: dict = {}
    first_last_years: dict = {}
    wins_counts: dict = {}
    if driver_ids:
        entry_counts = dict(
            session.exec(
                select(EventEntry.driver_id, func.count(EventEntry.id))
                .where(EventEntry.driver_id.in_(driver_ids))
                .group_by(EventEntry.driver_id)
            ).all()
        )
        year_expr = func.extract("year", Event.event_date)
        first_last_years = {
            row[0]: (row[1], row[2])
            for row in session.exec(
                select(
                    EventEntry.driver_id,
                    func.min(year_expr),
                    func.max(year_expr),
                )
                .join(Event, Event.id == EventEntry.event_id)
                .where(EventEntry.driver_id.in_(driver_ids))
                .group_by(EventEntry.driver_id)
            ).all()
        }
        wins_counts = dict(
            session.exec(
                select(
                    EventEntry.driver_id,
                    func.coalesce(
                        func.sum(case((SessionResult.position == "1", 1), else_=0)),
                        0,
                    ),
                )
                .join(SessionResult, SessionResult.entry_id == EventEntry.id)
                .join(EventSession, EventSession.id == SessionResult.session_id)
                .where(
                    EventEntry.driver_id.in_(driver_ids),
                    EventSession.type == SessionType.RACE,
                )
                .group_by(EventEntry.driver_id)
            ).all()
        )
    return [
        DriverRead(
            **model_dump(driver),
            event_entry_count=int(entry_counts.get(driver.id, 0)),
            first_run_year=(
                int(first_last_years.get(driver.id, (None, None))[0])
                if first_last_years.get(driver.id, (None, None))[0] is not None
                else None
            ),
            last_run_year=(
                int(first_last_years.get(driver.id, (None, None))[1])
                if first_last_years.get(driver.id, (None, None))[1] is not None
                else None
            ),
            wins_count=int(wins_counts.get(driver.id, 0)),
        )
        for driver in drivers
    ]


def _list_drivers(
    session: Session,
    offset: int,
    limit: int,
) -> list[DriverRead]:
    statement = (
        select(Driver)
        .offset(offset)
        .limit(limit)
    )
    drivers = session.exec(statement).all()
    return _resolve_drivers(drivers, session)


def _get_driver_collection_stats(session: Session) -> dict:
    total = (
        session.exec(
            select(func.count()).select_from(Driver)
        ).first()
        or 0
    )
    active = (
        session.exec(
            select(func.count()).where(
                Driver.dod.is_(None)
            )
        ).first()
        or 0
    )
    earliest_dob = session.exec(
        select(func.min(Driver.dob))
    ).first()
    latest_dob = session.exec(
        select(func.max(Driver.dob))
    ).first()
    return {
        "total": int(total or 0),
        "active": int(active or 0),
        "earliest_dob": str(earliest_dob) if earliest_dob else None,
        "latest_dob": str(latest_dob) if latest_dob else None,
    }


def _driver_counts_by_session_type(
    session: Session,
    session_type: SessionType,
    position_column=SessionResult.position,
) -> list[DriverCount]:
    statement = (
        select(
            Driver.id,
            Driver.first_name,
            Driver.last_name,
            Driver.short_name,
            Driver.nationality,
            func.count(SessionResult.id).label("total"),
            Driver.slug,
        )
        .join(EventEntry, EventEntry.driver_id == Driver.id)
        .join(SessionResult, SessionResult.entry_id == EventEntry.id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventSession.type == session_type)
        .where(position_column == "1")
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .group_by(Driver.id)
        .order_by(func.count(SessionResult.id).desc(), Driver.id.asc())
    )
    rows = session.exec(statement).all()
    return [
        DriverCount(
            driver_id=row[0],
            first_name=row[1],
            last_name=row[2],
            short_name=row[3],
            nationality=row[4],
            total=int(row[5] or 0),
            slug=row[6],
        )
        for row in rows
    ]


def _list_drivers_by_last_name(
    session: Session,
    starts_with: str,
    offset: int,
    limit: int,
) -> list[DriverRead]:
    prefix = starts_with.strip().lower()
    statement = (
        select(Driver)
        .where(
            Driver.last_name.ilike(f"{prefix}%"),
        )
        .order_by(Driver.last_name.asc(), Driver.first_name.asc())
        .offset(offset)
        .limit(limit)
    )
    drivers = session.exec(statement).all()
    return _resolve_drivers(drivers, session)


def _search_drivers(
    session: Session,
    q: str,
    offset: int,
    limit: int,
) -> list[DriverRead]:
    term = f"%{q.strip()}%"
    statement = (
        select(Driver)
        .where(
            Driver.first_name.ilike(term) | Driver.last_name.ilike(term),
        )
        .order_by(Driver.last_name.asc(), Driver.first_name.asc())
        .offset(offset)
        .limit(limit)
    )
    drivers = session.exec(statement).all()
    return _resolve_drivers(drivers, session)


def _get_driver_stats_by_id(
    driver_id: int,
    session: Session,
) -> DriverStats:
    driver = session.get(Driver, driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    position_upper = func.upper(SessionResult.position)
    starts_condition = (
        SessionResult.position.isnot(None)
        & (~position_upper.in_(["DNS", "DNQ", "FL"]))
    )

    base_stmt = (
        select(
            func.coalesce(
                func.sum(case((starts_condition, 1), else_=0)), 0
            ).label("starts"),
            func.coalesce(
                func.sum(case((SessionResult.position == "1", 1), else_=0)), 0
            ).label("wins"),
            func.coalesce(
                func.sum(
                    case(
                        (SessionResult.position.in_(["1", "2", "3"]), 1),
                        else_=0,
                    )
                ),
                0,
            ).label("podiums"),
        )
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventEntry.driver_id == driver_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
    )
    race_stmt = base_stmt.where(EventSession.type == SessionType.RACE)

    race_row = session.exec(race_stmt).first()
    if race_row:
        starts = int(race_row[0] or 0)
        wins = int(race_row[1] or 0)
        podiums = int(race_row[2] or 0)
    else:
        starts = 0
        wins = 0
        podiums = 0

    # Poles are based on the qualifying grid (grid_position == 1), so a grid
    # penalty that drops the fastest qualifier is reflected.
    pole_stmt = (
        select(
            func.coalesce(
                func.sum(case((SessionResult.grid_position == "1", 1), else_=0)), 0
            ).label("poles")
        )
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventEntry.driver_id == driver_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.QUALI)
    )
    pole_row = session.exec(pole_stmt).first()
    poles = int(pole_row or 0) if pole_row is not None else 0

    years_stmt = (
        select(func.count(func.distinct(func.extract("year", Event.event_date))))
        .select_from(SessionResult)
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventEntry.driver_id == driver_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .where(starts_condition)
    )
    years_row = session.exec(years_stmt).first()
    years_active = int(years_row or 0) if years_row is not None else 0

    first_event_stmt = (
        select(Event.event_name)
        .select_from(SessionResult)
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventEntry.driver_id == driver_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .where(starts_condition)
        .order_by(Event.event_date.asc(), Event.id.asc())
        .limit(1)
    )
    first_event_name = session.exec(first_event_stmt).first()

    last_event_stmt = (
        select(Event.event_name)
        .select_from(SessionResult)
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventEntry.driver_id == driver_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .where(starts_condition)
        .order_by(Event.event_date.desc(), Event.id.desc())
        .limit(1)
    )
    last_event_name = session.exec(last_event_stmt).first()

    return DriverStats(
        starts=starts,
        poles=poles,
        wins=wins,
        podiums=podiums,
        years_active=years_active,
        first_event_name=first_event_name,
        last_event_name=last_event_name,
    )


def _get_driver_wins(
    driver_id: int,
    session: Session,
) -> list[DriverWinEntry]:
    driver = session.get(Driver, driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    rows = session.exec(
        select(
            Event.id,
            Event.slug,
            Event.event_name,
            Event.event_date,
            Team,
            Car,
        )
        .join(EventEntry, EventEntry.event_id == Event.id)
        .join(SessionResult, SessionResult.entry_id == EventEntry.id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .outerjoin(Team, Team.id == EventEntry.team_id)
        .outerjoin(Car, Car.id == EventEntry.car_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventEntry.driver_id == driver_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .where(SessionResult.position == "1")
        .order_by(Event.event_date.desc(), Event.id.desc())
    ).all()

    results = []
    for event_id, event_slug, event_name, event_date, team, car in rows:
        if not event_date:
            continue
        results.append(
            DriverWinEntry(
                event_id=event_id,
                event_slug=event_slug,
                event_name=event_name,
                year=event_date.year,
                team=team,
                car=car,
            )
        )
    return results


def _resolve_driver(slug: str, session: Session) -> Driver:
    """Look up a driver by its public slug, 404 if not found."""
    driver = session.exec(select(Driver).where(Driver.slug == slug)).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    return driver


def _get_driver(
    slug: str,
    session: Session,
) -> DriverRead:
    return _resolve_driver(slug, session)


@admin_router.post("", response_model=DriverRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=DriverRead, status_code=status.HTTP_201_CREATED)
def create_driver(
    driver_in: DriverCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> DriverRead:
    driver = Driver(**model_dump(driver_in))
    driver.slug = unique_driver_slug(session, driver.first_name, driver.last_name)
    session.add(driver)
    session.commit()
    session.refresh(driver)
    return driver


@public_router.get("", response_model=list[DriverRead])
def list_drivers_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[DriverRead]:
    return _list_drivers(session=session, offset=offset, limit=limit)


@admin_router.get("", response_model=list[DriverRead])
@router.get("", response_model=list[DriverRead])
def list_drivers(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[DriverRead]:
    return _list_drivers(session=session, offset=offset, limit=limit)


@public_router.get("/stats")
def get_driver_collection_stats_public(
    session: Session = Depends(get_readonly_session),
) -> dict:
    return _get_driver_collection_stats(session)


@admin_router.get("/stats")
@router.get("/stats")
def get_driver_collection_stats(
    session: Session = Depends(get_session),
) -> dict:
    return _get_driver_collection_stats(session)


@public_router.get("/stats/number_wins", response_model=list[DriverCount])
def number_wins_public(
    session: Session = Depends(get_readonly_session),
) -> list[DriverCount]:
    return number_wins(session=session)


@admin_router.get("/stats/number_wins", response_model=list[DriverCount])
@router.get("/stats/number_wins", response_model=list[DriverCount])
def number_wins(session: Session = Depends(get_session)) -> list[DriverCount]:
    return _driver_counts_by_session_type(session, SessionType.RACE)


@public_router.get("/stats/number_pole_positions", response_model=list[DriverCount])
def number_pole_positions_public(
    session: Session = Depends(get_readonly_session),
) -> list[DriverCount]:
    return number_pole_positions(session=session)


@admin_router.get("/stats/number_pole_positions", response_model=list[DriverCount])
@router.get("/stats/number_pole_positions", response_model=list[DriverCount])
def number_pole_positions(session: Session = Depends(get_session)) -> list[DriverCount]:
    # Pole positions are counted from the qualifying grid (grid_position == 1),
    # which reflects grid penalties, rather than the qualifying classification.
    return _driver_counts_by_session_type(
        session, SessionType.QUALI, SessionResult.grid_position
    )


def _dotd_wins(session: Session) -> list[DriverCount]:
    statement = (
        select(
            Driver.id.label("driver_id"),
            Driver.slug,
            Driver.first_name,
            Driver.last_name,
            Driver.short_name,
            Driver.nationality,
            func.count(DriverOfTheDay.id).label("total"),
        )
        .join(EventEntry, EventEntry.driver_id == Driver.id)
        .join(
            DriverOfTheDay,
            (DriverOfTheDay.entry_id == EventEntry.id)
            & (DriverOfTheDay.position == 1),
        )
        .group_by(Driver.id, Driver.slug, Driver.first_name, Driver.last_name, Driver.short_name, Driver.nationality)
        .order_by(func.count(DriverOfTheDay.id).desc())
    )
    rows = session.exec(statement).all()
    return [
        DriverCount(
            driver_id=row.driver_id,
            slug=row.slug,
            first_name=row.first_name,
            last_name=row.last_name,
            short_name=row.short_name,
            nationality=row.nationality,
            total=row.total,
        )
        for row in rows
    ]


@public_router.get("/stats/dotd_wins", response_model=list[DriverCount])
def dotd_wins_public(
    session: Session = Depends(get_readonly_session),
) -> list[DriverCount]:
    return _dotd_wins(session=session)


@admin_router.get("/stats/dotd_wins", response_model=list[DriverCount])
@router.get("/stats/dotd_wins", response_model=list[DriverCount])
def dotd_wins(session: Session = Depends(get_session)) -> list[DriverCount]:
    return _dotd_wins(session=session)


class CountryWinCount(SQLModel):
    country: str
    total: int


def _wins_by_country(session: Session) -> list[CountryWinCount]:
    statement = (
        select(
            Driver.nationality,
            func.count(SessionResult.id).label("total"),
        )
        .join(EventEntry, EventEntry.driver_id == Driver.id)
        .join(SessionResult, SessionResult.entry_id == EventEntry.id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventSession.type == SessionType.RACE)
        .where(SessionResult.position == "1")
        .where(Driver.nationality.isnot(None))
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .group_by(Driver.nationality)
        .order_by(func.count(SessionResult.id).desc())
    )
    rows = session.exec(statement).all()
    return [
        CountryWinCount(country=row[0], total=int(row[1] or 0))
        for row in rows
        if row[0]
    ]


@public_router.get("/stats/wins_by_country", response_model=list[CountryWinCount])
def wins_by_country_public(
    session: Session = Depends(get_readonly_session),
) -> list[CountryWinCount]:
    return _wins_by_country(session)


@admin_router.get("/stats/wins_by_country", response_model=list[CountryWinCount])
@router.get("/stats/wins_by_country", response_model=list[CountryWinCount])
def wins_by_country(session: Session = Depends(get_session)) -> list[CountryWinCount]:
    return _wins_by_country(session)


@public_router.get("/by-last-name", response_model=list[DriverRead])
def list_drivers_by_last_name_public(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[DriverRead]:
    return _list_drivers_by_last_name(
        session=session,
        starts_with=starts_with,
        offset=offset,
        limit=limit,
    )


@admin_router.get("/by-last-name", response_model=list[DriverRead])
@router.get("/by-last-name", response_model=list[DriverRead])
def list_drivers_by_last_name(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[DriverRead]:
    return _list_drivers_by_last_name(
        session=session,
        starts_with=starts_with,
        offset=offset,
        limit=limit,
    )


@public_router.get("/search", response_model=list[DriverRead])
def search_drivers_public(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[DriverRead]:
    return _search_drivers(
        session=session,
        q=q,
        offset=offset,
        limit=limit,
    )


@admin_router.get("/search", response_model=list[DriverRead])
@router.get("/search", response_model=list[DriverRead])
def search_drivers(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[DriverRead]:
    return _search_drivers(
        session=session,
        q=q,
        offset=offset,
        limit=limit,
    )


def _list_drivers_by_season(
    session: Session,
    season_short_name: str,
) -> list[DriverRead]:
    statement = (
        select(Driver)
        .join(EventEntry, EventEntry.driver_id == Driver.id)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season_short_name)
        .distinct()
        .order_by(Driver.last_name.asc(), Driver.first_name.asc())
    )
    drivers = session.exec(statement).all()
    return _resolve_drivers(drivers, session)


@public_router.get("/by-season", response_model=list[DriverRead])
def list_drivers_by_season_public(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_readonly_session),
) -> list[DriverRead]:
    return _list_drivers_by_season(session=session, season_short_name=season)


@admin_router.get("/by-season", response_model=list[DriverRead])
@router.get("/by-season", response_model=list[DriverRead])
def list_drivers_by_season(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_session),
) -> list[DriverRead]:
    return _list_drivers_by_season(session=session, season_short_name=season)


@public_router.get("/{slug}/stats", response_model=DriverStats)
def get_driver_stats_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> DriverStats:
    driver = _resolve_driver(slug, session)
    return _get_driver_stats_by_id(driver_id=driver.id, session=session)


@admin_router.get("/{slug}/stats", response_model=DriverStats)
@router.get("/{slug}/stats", response_model=DriverStats)
def get_driver_stats(
    slug: str,
    session: Session = Depends(get_session),
) -> DriverStats:
    driver = _resolve_driver(slug, session)
    return _get_driver_stats_by_id(driver_id=driver.id, session=session)


@public_router.get("/{slug}/teams")
def get_driver_teams_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
):
    driver = _resolve_driver(slug, session)
    return _get_driver_teams(driver_id=driver.id, session=session)


def _get_driver_teams(driver_id: int, session: Session) -> list[TeamRead]:
    """Return teams for a driver with year periods scoped to this driver."""
    from app.routers.team import _compute_year_periods

    statement = (
        select(Team)
        .join(EventEntry, EventEntry.team_id == Team.id)
        .where(EventEntry.driver_id == driver_id)
        .distinct()
    )
    teams = session.exec(statement).all()
    team_ids = [t.id for t in teams if t.id is not None]
    if not team_ids:
        return []

    # Distinct years per team, scoped to this driver
    year_expr = func.extract("year", Event.event_date)
    rows = session.exec(
        select(EventEntry.team_id, year_expr)
        .join(Event, Event.id == EventEntry.event_id)
        .where(
            EventEntry.driver_id == driver_id,
            EventEntry.team_id.in_(team_ids),
        )
        .group_by(EventEntry.team_id, year_expr)
        .order_by(EventEntry.team_id, year_expr)
    ).all()
    team_years: dict[int, list[int]] = {}
    for tid, year in rows:
        team_years.setdefault(tid, []).append(int(year))

    # Resolve constructor names + slugs
    from app.models.constructor import Constructor
    constructor_ids = {t.constructor_id for t in teams if t.constructor_id}
    constructor_info: dict[int, tuple[str, str]] = {}
    if constructor_ids:
        for cid, cname, cslug in session.exec(
            select(Constructor.id, Constructor.name, Constructor.slug)
            .where(Constructor.id.in_(constructor_ids))
        ).all():
            constructor_info[cid] = (cname, cslug)

    result = []
    for team in teams:
        periods = _compute_year_periods(team_years.get(team.id, []))
        base = model_dump(team)
        cinfo = constructor_info.get(team.constructor_id) if team.constructor_id else None
        cname = cinfo[0] if cinfo else None
        cslug = cinfo[1] if cinfo else None
        if len(periods) <= 1:
            fl = periods[0] if periods else [None, None]
            result.append(TeamRead(
                **base,
                first_run_year=fl[0],
                last_run_year=fl[1],
                constructor_name=cname,
                constructor_slug=cslug,
            ))
        else:
            for start, end in periods:
                result.append(TeamRead(
                    **base,
                    first_run_year=start,
                    last_run_year=end,
                    constructor_name=cname,
                    constructor_slug=cslug,
                ))
    result.sort(key=lambda t: (t.last_run_year or 0), reverse=True)
    return result


@public_router.get("/{slug}/wins", response_model=list[DriverWinEntry])
def get_driver_wins_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[DriverWinEntry]:
    driver = _resolve_driver(slug, session)
    return _get_driver_wins(driver_id=driver.id, session=session)


@admin_router.get("/{slug}/wins", response_model=list[DriverWinEntry])
@router.get("/{slug}/wins", response_model=list[DriverWinEntry])
def get_driver_wins(
    slug: str,
    session: Session = Depends(get_session),
) -> list[DriverWinEntry]:
    driver = _resolve_driver(slug, session)
    return _get_driver_wins(driver_id=driver.id, session=session)


def _get_driver_wins_by_year(driver_id: int, session: Session) -> list[DriverWinsByYear]:
    driver = session.get(Driver, driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    year_col = func.extract("year", Event.event_date).label("year")
    stmt = (
        select(
            year_col,
            func.coalesce(
                func.sum(case((SessionResult.position == "1", 1), else_=0)), 0
            ).label("wins"),
            func.count(func.distinct(Event.id)).label("events"),
        )
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventEntry.driver_id == driver_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .group_by(year_col)
        .order_by(year_col.asc())
    )
    rows = session.exec(stmt).all()
    return [
        DriverWinsByYear(year=int(row[0]), wins=int(row[1]), events=int(row[2]))
        for row in rows
        if int(row[2]) > 0
    ]


@public_router.get("/{slug}/wins-by-year", response_model=list[DriverWinsByYear])
def get_driver_wins_by_year_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[DriverWinsByYear]:
    driver = _resolve_driver(slug, session)
    return _get_driver_wins_by_year(driver_id=driver.id, session=session)


@admin_router.get("/{slug}/wins-by-year", response_model=list[DriverWinsByYear])
@router.get("/{slug}/wins-by-year", response_model=list[DriverWinsByYear])
def get_driver_wins_by_year(
    slug: str,
    session: Session = Depends(get_session),
) -> list[DriverWinsByYear]:
    driver = _resolve_driver(slug, session)
    return _get_driver_wins_by_year(driver_id=driver.id, session=session)


@public_router.get("/{slug}", response_model=DriverRead)
def get_driver_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> DriverRead:
    return _get_driver(slug=slug, session=session)


@admin_router.get("/{slug}", response_model=DriverRead)
@router.get("/{slug}", response_model=DriverRead)
def get_driver(
    slug: str,
    session: Session = Depends(get_session),
) -> DriverRead:
    return _get_driver(slug=slug, session=session)


@admin_router.patch("/{slug}", response_model=DriverRead)
@router.patch("/{slug}", response_model=DriverRead)
def update_driver(
    slug: str,
    driver_in: DriverUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> DriverRead:
    driver = _resolve_driver(slug, session)

    update_data = model_dump(driver_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(driver, key, value)

    # Regenerate the URL slug when the name changes.
    if "first_name" in update_data or "last_name" in update_data:
        driver.slug = unique_driver_slug(
            session, driver.first_name, driver.last_name, exclude_id=driver.id
        )

    session.add(driver)
    session.commit()
    session.refresh(driver)
    return driver


@admin_router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    driver = _resolve_driver(slug, session)

    session.delete(driver)
    session.commit()
    return None


@admin_router.post("/{slug}/image", status_code=status.HTTP_201_CREATED)
@router.post("/{slug}/image", status_code=status.HTTP_201_CREATED)
async def upload_driver_image(
    slug: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    driver = _resolve_driver(slug, session)

    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use JPG, PNG, or WEBP.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file upload.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large. Max size is {MAX_IMAGE_BYTES} bytes.",
        )

    ext = ALLOWED_IMAGE_TYPES[content_type]
    target_dir = DRIVER_IMAGE_DIR / str(driver.id)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.{ext}"
    target_path = target_dir / filename
    target_path.write_bytes(data)

    old_path = _local_image_path(driver.image_url)
    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass

    image_url = f"{DRIVER_IMAGE_BASE_URL.rstrip('/')}/{driver.id}/{filename}"
    driver.image_url = image_url
    driver.image_updated_at = datetime.utcnow()
    session.add(driver)
    session.commit()
    session.refresh(driver)

    return {"image_url": image_url}


@admin_router.delete("/{slug}/image", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{slug}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver_image(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> None:
    driver = _resolve_driver(slug, session)

    old_path = _local_image_path(driver.image_url)
    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass

    driver.image_url = None
    driver.image_updated_at = None
    session.add(driver)
    session.commit()
    return None
