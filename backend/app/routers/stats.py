from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlmodel import Session, SQLModel, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.car import Car
from app.models.championship import Championship
from app.models.circuit import Circuit
from app.models.constructor import Constructor
from app.models.driver import Driver
from app.models.driver_standing import DriverStanding
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.season import Season
from app.models.team import Team
from app.models.user import User, UserRole
from app.routers.season import _haversine_km

router = APIRouter(prefix="/stats", tags=["stats"])
public_router = APIRouter(prefix="/v1/stats", tags=["stats"])
admin_router = APIRouter(
    prefix="/api/admin/stats",
    tags=["stats"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


class EntrantsByYear(SQLModel):
    year: int
    entrants: int


class SeasonChampionDriver(SQLModel):
    id: int
    first_name: str | None = None
    last_name: str | None = None
    short_name: str | None = None
    nationality: str | None = None
    constructor_name: str | None = None


class SeasonChampionConstructor(SQLModel):
    id: int
    name: str | None = None
    short_name: str | None = None
    country: str | None = None


class SeasonChampions(SQLModel):
    season_id: int
    year: int | None = None
    driver: SeasonChampionDriver | None = None
    constructor: SeasonChampionConstructor | None = None


class OverviewCounts(SQLModel):
    seasons: int
    events: int
    circuits: int
    drivers: int
    teams: int


@public_router.get("/number_entrants_by_year", response_model=list[EntrantsByYear])
def number_entrants_by_year_public(
    session: Session = Depends(get_readonly_session),
) -> list[EntrantsByYear]:
    return number_entrants_by_year(session=session)


@admin_router.get("/number_entrants_by_year", response_model=list[EntrantsByYear])
@router.get("/number_entrants_by_year", response_model=list[EntrantsByYear])
def number_entrants_by_year(
    session: Session = Depends(get_session),
) -> list[EntrantsByYear]:
    statement = (
        select(
            Season.year,
            func.count(func.distinct(EventEntry.driver_id)).label("entrants"),
        )
        .join(Event, Event.season_short_name == Season.short_name)
        .join(EventEntry, EventEntry.event_id == Event.id)
        .group_by(Season.year)
        .order_by(Season.year)
    )
    rows = session.exec(statement).all()
    return [EntrantsByYear(year=row[0], entrants=int(row[1] or 0)) for row in rows]


@public_router.get("/season_champions", response_model=list[SeasonChampions])
def season_champions_public(
    session: Session = Depends(get_readonly_session),
) -> list[SeasonChampions]:
    return season_champions(session=session)


@admin_router.get("/season_champions", response_model=list[SeasonChampions])
@router.get("/season_champions", response_model=list[SeasonChampions])
def season_champions(session: Session = Depends(get_session)) -> list[SeasonChampions]:
    driver_rows = session.exec(
        select(
            DriverStanding.season_id,
            Season.year,
            Driver.id,
            Driver.first_name,
            Driver.last_name,
            Driver.short_name,
            Driver.nationality,
            Constructor.name,
        )
        .join(Driver, Driver.id == DriverStanding.driver_id)
        .join(Season, Season.id == DriverStanding.season_id)
        .outerjoin(Constructor, Constructor.id == DriverStanding.constructor_id)
        .where(DriverStanding.event_id.is_(None))
        .where(DriverStanding.standing_type == "DRIVER")
        .where(DriverStanding.position == "1")
    ).all()
    constructor_rows = session.exec(
        select(
            DriverStanding.season_id,
            Season.year,
            Constructor.id,
            Constructor.name,
            Constructor.short_name,
            Constructor.country,
        )
        .join(Constructor, Constructor.id == DriverStanding.constructor_id)
        .join(Season, Season.id == DriverStanding.season_id)
        .where(DriverStanding.event_id.is_(None))
        .where(DriverStanding.standing_type == "CONSTRUCTOR")
        .where(DriverStanding.position == "1")
    ).all()
    champion_map: dict[int, SeasonChampions] = {}
    # Resolve constructor for each champion driver via their season entries
    driver_season_pairs = [
        (row[2], row[0]) for row in driver_rows  # (driver_id, season_id)
    ]
    driver_constructor_map: dict[tuple[int, int], str] = {}
    if driver_season_pairs:
        season_ids_set = {s for _, s in driver_season_pairs}
        season_short_names = dict(
            session.exec(
                select(Season.id, Season.short_name).where(Season.id.in_(season_ids_set))
            ).all()
        )
        for driver_id, season_id in driver_season_pairs:
            short_name_val = season_short_names.get(season_id)
            if not short_name_val:
                continue
            row = session.exec(
                select(Constructor.name)
                .join(Car, Car.constructor_id == Constructor.id)
                .join(EventEntry, EventEntry.car_id == Car.id)
                .join(Event, Event.id == EventEntry.event_id)
                .where(EventEntry.driver_id == driver_id)
                .where(Event.season_short_name == short_name_val)
                .order_by(Event.event_date.desc())
                .limit(1)
            ).first()
            if row:
                driver_constructor_map[(driver_id, season_id)] = row

    for season_id, year, driver_id, first_name, last_name, short_name, nationality, _constructor_name in driver_rows:
        item = champion_map.setdefault(
            season_id, SeasonChampions(season_id=season_id, year=year)
        )
        item.year = year
        item.driver = SeasonChampionDriver(
            id=driver_id,
            first_name=first_name,
            last_name=last_name,
            short_name=short_name,
            nationality=nationality,
            constructor_name=driver_constructor_map.get((driver_id, season_id)),
        )
    for season_id, year, constructor_id, name, short_name, country in constructor_rows:
        item = champion_map.setdefault(
            season_id, SeasonChampions(season_id=season_id, year=year)
        )
        if not item.year:
            item.year = year
        item.constructor = SeasonChampionConstructor(
            id=constructor_id,
            name=name,
            short_name=short_name,
            country=country,
        )
    return sorted(champion_map.values(), key=lambda item: (item.year or 0, item.season_id))


class KmByYear(SQLModel):
    year: int
    km: float


def _km_by_year(session: Session) -> list[KmByYear]:
    """Compute KM travelled between circuits per season year.

    Uses the same haversine calculation as the season stats endpoint:
    sum of great-circle distances between consecutive F1 World Championship
    circuits in calendar order.
    """
    rows = session.exec(
        select(
            Season.year,
            Event.round,
            Event.event_date,
            Event.id.label("event_id"),
            Circuit.lat,
            Circuit.lon,
        )
        .join(Event, Event.season_short_name == Season.short_name)
        .join(Circuit, Circuit.id == Event.circuit_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Championship.short_name == "f1_driver_world")
        .group_by(Season.year, Event.round, Event.event_date, Event.id, Circuit.lat, Circuit.lon)
        .order_by(Season.year, func.coalesce(Event.round, 9999), Event.event_date.asc(), Event.id.asc())
    ).all()

    totals: dict[int, float] = {}
    prev: dict[int, tuple[float, float]] = {}
    for row in rows:
        year = row.year
        if row.lat is None or row.lon is None:
            continue
        coords = (float(row.lat), float(row.lon))
        if year in prev:
            totals[year] = totals.get(year, 0.0) + _haversine_km(
                prev[year][0], prev[year][1], coords[0], coords[1]
            )
        prev[year] = coords

    return [
        KmByYear(year=year, km=round(km, 1))
        for year, km in sorted(totals.items())
    ]


@public_router.get("/km_by_year", response_model=list[KmByYear])
def km_by_year_public(
    session: Session = Depends(get_readonly_session),
) -> list[KmByYear]:
    return _km_by_year(session=session)


@admin_router.get("/km_by_year", response_model=list[KmByYear])
@router.get("/km_by_year", response_model=list[KmByYear])
def km_by_year(session: Session = Depends(get_session)) -> list[KmByYear]:
    return _km_by_year(session=session)


@public_router.get("/overview", response_model=OverviewCounts)
def overview_public(session: Session = Depends(get_readonly_session)) -> OverviewCounts:
    return overview(session=session)


@admin_router.get("/overview", response_model=OverviewCounts)
@router.get("/overview", response_model=OverviewCounts)
def overview(session: Session = Depends(get_session)) -> OverviewCounts:
    seasons = session.exec(select(func.count()).select_from(Season)).first()
    events = session.exec(select(func.count()).select_from(Event)).first()
    circuits = session.exec(select(func.count()).select_from(Circuit)).first()
    drivers = session.exec(select(func.count()).select_from(Driver)).first()
    teams = session.exec(select(func.count()).select_from(Team)).first()
    return OverviewCounts(
        seasons=int(seasons or 0),
        events=int(events or 0),
        circuits=int(circuits or 0),
        drivers=int(drivers or 0),
        teams=int(teams or 0),
    )
