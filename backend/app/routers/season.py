import math

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlmodel import Field, Session, SQLModel, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.car import Car, CarResolved
from app.models.championship import Championship
from app.models.circuit import Circuit
from app.models.constructor import Constructor
from app.models.driver import Driver, DriverRead
from app.models.engine import Engine, EngineResolved
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.entry import EventEntry
from app.models.season import Season, SeasonCreate, SeasonRead, SeasonUpdate
from app.models.team import Team, TeamRead
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/seasons", tags=["seasons"])
public_router = APIRouter(prefix="/v1/seasons", tags=["seasons"])
admin_router = APIRouter(
    prefix="/api/admin/seasons",
    tags=["seasons"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


class SeasonEventCounts(SQLModel):
    season_short_name: str
    championship_events: int
    non_championship_events: int


class SeasonStats(SQLModel):
    season_id: int
    f1_world_rounds: int
    f1_non_championship_rounds: int
    entrants: int
    different_teams: int
    different_drivers: int
    different_cars: int
    km_travelled: float


class SeasonEntriesOverviewRound(SQLModel):
    event_id: int
    slug: str | None = None
    round: int | None = None


class SeasonEntriesOverviewDriver(SQLModel):
    driver: DriverRead | None = None
    car_number: int | None = None
    rounds: list[SeasonEntriesOverviewRound] = Field(default_factory=list)


class SeasonEntriesOverviewRow(SQLModel):
    team: TeamRead | None = None
    car: CarResolved | None = None
    engine: EngineResolved | None = None
    drivers: list[SeasonEntriesOverviewDriver] = Field(default_factory=list)




def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0088
    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)
    dlat = lat2_rad - lat1_rad
    dlon = lon2_rad - lon1_rad
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_km * c


def _resolve_cars(cars: list[Car], session: Session) -> dict[int, CarResolved]:
    constructor_ids = {car.constructor_id for car in cars if car.constructor_id}
    engine_ids = {car.engine_id for car in cars if car.engine_id}
    constructors = (
        session.exec(select(Constructor).where(Constructor.id.in_(constructor_ids))).all()
        if constructor_ids
        else []
    )
    constructor_map = {constructor.id: constructor for constructor in constructors}
    engines = (
        session.exec(select(Engine).where(Engine.id.in_(engine_ids))).all()
        if engine_ids
        else []
    )
    engine_constructor_ids = {
        engine.constructor_id for engine in engines if engine.constructor_id
    }
    if engine_constructor_ids:
        more_constructors = session.exec(
            select(Constructor).where(Constructor.id.in_(engine_constructor_ids))
        ).all()
        for constructor in more_constructors:
            constructor_map.setdefault(constructor.id, constructor)
    engine_map = {
        engine.id: EngineResolved(
            **model_dump(engine),
            constructor=constructor_map.get(engine.constructor_id),
        )
        for engine in engines
    }
    return {
        car.id: CarResolved(
            **model_dump(car),
            constructor=constructor_map.get(car.constructor_id),
            engine=engine_map.get(car.engine_id),
        )
        for car in cars
    }


@admin_router.post("", response_model=SeasonRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=SeasonRead, status_code=status.HTTP_201_CREATED)
def create_season(
    season_in: SeasonCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SeasonRead:
    season = Season(**model_dump(season_in))
    session.add(season)
    session.commit()
    session.refresh(season)
    return season


@public_router.get("", response_model=list[SeasonRead])
def list_seasons_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[SeasonRead]:
    return list_seasons(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[SeasonRead])
@router.get("", response_model=list[SeasonRead])
def list_seasons(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[SeasonRead]:
    statement = (
        select(Season)
        
        .order_by(Season.year.asc())
        .offset(offset)
        .limit(limit)
    )
    seasons = session.exec(statement).all()
    return seasons


@public_router.get("/event-counts", response_model=list[SeasonEventCounts])
def list_season_event_counts_public(
    session: Session = Depends(get_readonly_session),
) -> list[SeasonEventCounts]:
    return list_season_event_counts(session=session)


@admin_router.get("/event-counts", response_model=list[SeasonEventCounts])
@router.get("/event-counts", response_model=list[SeasonEventCounts])
def list_season_event_counts(
    session: Session = Depends(get_session),
) -> list[SeasonEventCounts]:
    statement = (
        select(
            Event.season_short_name,
            func.count(Event.id).label("total_events"),
            func.count(func.distinct(EventChampionship.event_id)).label(
                "championship_events"
            ),
        )
        .select_from(Event)
        .outerjoin(EventChampionship, EventChampionship.event_id == Event.id)
        
        .group_by(Event.season_short_name)
    )
    rows = session.exec(statement).all()
    results = []
    for row in rows:
        total_events = int(row.total_events or 0)
        championship_events = int(row.championship_events or 0)
        results.append(
            SeasonEventCounts(
                season_short_name=row.season_short_name,
                championship_events=championship_events,
                non_championship_events=max(total_events - championship_events, 0),
            )
        )
    return results


@public_router.get("/{season_id}", response_model=SeasonRead)
def get_season_public(
    season_id: int,
    session: Session = Depends(get_readonly_session),
) -> SeasonRead:
    return get_season(season_id=season_id, session=session)


@admin_router.get("/{season_id}", response_model=SeasonRead)
@router.get("/{season_id}", response_model=SeasonRead)
def get_season(
    season_id: int,
    session: Session = Depends(get_session),
) -> SeasonRead:
    season = session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


@public_router.get("/{season_id}/stats", response_model=SeasonStats)
def get_season_stats_public(
    season_id: int,
    session: Session = Depends(get_readonly_session),
) -> SeasonStats:
    return get_season_stats(season_id=season_id, session=session)


@public_router.get(
    "/{season_id}/entries-overview",
    response_model=list[SeasonEntriesOverviewRow],
)
def get_season_entries_overview_public(
    season_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[SeasonEntriesOverviewRow]:
    return get_season_entries_overview(season_id=season_id, session=session)


@admin_router.get(
    "/{season_id}/entries-overview",
    response_model=list[SeasonEntriesOverviewRow],
)
@router.get(
    "/{season_id}/entries-overview",
    response_model=list[SeasonEntriesOverviewRow],
)
def get_season_entries_overview(
    season_id: int,
    session: Session = Depends(get_session),
) -> list[SeasonEntriesOverviewRow]:
    season = session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    entry_rows = session.exec(
        select(EventEntry, Event)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season.short_name)
        .order_by(func.coalesce(Event.round, 9999), Event.event_date.asc(), Event.id.asc())
    ).all()
    if not entry_rows:
        return []

    driver_ids = {entry.driver_id for entry, _ in entry_rows if entry.driver_id}
    team_ids = {entry.team_id for entry, _ in entry_rows if entry.team_id}
    car_ids = {entry.car_id for entry, _ in entry_rows if entry.car_id}

    drivers = (
        session.exec(select(Driver).where(Driver.id.in_(driver_ids))).all()
        if driver_ids
        else []
    )
    teams = (
        session.exec(select(Team).where(Team.id.in_(team_ids))).all()
        if team_ids
        else []
    )
    cars = (
        session.exec(select(Car).where(Car.id.in_(car_ids))).all()
        if car_ids
        else []
    )

    driver_map = {driver.id: driver for driver in drivers}
    team_map = {team.id: team for team in teams}
    car_map = _resolve_cars(cars, session)

    grouped: dict[
        tuple[int | None, int | None],
        dict[str, object],
    ] = {}

    for entry, event in entry_rows:
        group_key = (entry.team_id, entry.car_id)
        if group_key not in grouped:
            resolved_car = car_map.get(entry.car_id)
            grouped[group_key] = {
                "team": team_map.get(entry.team_id),
                "car": resolved_car,
                "engine": resolved_car.engine if resolved_car else None,
                "drivers": {},
            }
        group = grouped[group_key]
        round_item = SeasonEntriesOverviewRound(
            event_id=event.id, slug=event.slug, round=event.round
        )
        resolved_driver = driver_map.get(entry.driver_id)
        driver_name_key = (
            f"{resolved_driver.first_name or ''} {resolved_driver.last_name or ''}".strip()
            if resolved_driver
            else "—"
        )
        driver_key = (
            resolved_driver.id if resolved_driver else f"driver:{driver_name_key}",
            entry.car_number,
        )
        drivers_map = group["drivers"]
        if driver_key not in drivers_map:
            drivers_map[driver_key] = {
                "driver": resolved_driver,
                "car_number": entry.car_number,
                "rounds": {},
            }
        drivers_map[driver_key]["rounds"][event.id] = round_item

    def _team_label(team: TeamRead | None) -> str:
        if not team:
            return "—"
        return team.team_name or team.short_name or "—"

    def _car_label(car: CarResolved | None) -> str:
        if not car:
            return "—"
        return car.chassis_name or "—"

    def _driver_sort_key(item: dict[str, object]) -> tuple[int, str]:
        number = item["car_number"] if item["car_number"] is not None else 9999
        driver = item["driver"]
        label = (
            f"{driver.last_name or ''} {driver.first_name or ''}".strip()
            if driver
            else "—"
        )
        return number, label

    result = []
    for group in grouped.values():
        drivers = []
        for driver_item in sorted(group["drivers"].values(), key=_driver_sort_key):
            rounds = sorted(
                driver_item["rounds"].values(),
                key=lambda round_item: (
                    round_item.round if round_item.round is not None else 9999,
                    round_item.event_id,
                ),
            )
            drivers.append(
                SeasonEntriesOverviewDriver(
                    driver=driver_item["driver"],
                    car_number=driver_item["car_number"],
                    rounds=rounds,
                )
            )
        result.append(
            SeasonEntriesOverviewRow(
                team=group["team"],
                car=group["car"],
                engine=group["engine"],
                drivers=drivers,
            )
        )

    result.sort(key=lambda row: (_team_label(row.team), _car_label(row.car)))
    return result


@admin_router.get("/{season_id}/stats", response_model=SeasonStats)
@router.get("/{season_id}/stats", response_model=SeasonStats)
def get_season_stats(
    season_id: int,
    session: Session = Depends(get_session),
) -> SeasonStats:
    season = session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    round_counts = session.exec(
        select(
            func.count(
                func.distinct(
                    case(
                        (Championship.short_name == "f1_driver_world", Event.id),
                        else_=None,
                    )
                )
            ).label("f1_world_rounds"),
            func.count(
                func.distinct(
                    case(
                        (
                            Championship.short_name.in_(
                                ["fi_non_world", "f1_non_world", "f1_non_championship"]
                            ),
                            Event.id,
                        ),
                        else_=None,
                    )
                )
            ).label("f1_non_championship_rounds"),
        )
        .select_from(Event)
        .outerjoin(EventChampionship, EventChampionship.event_id == Event.id)
        .outerjoin(Championship, Championship.id == EventChampionship.championship_id)
        .where(Event.season_short_name == season.short_name)
    ).first()

    entrants_subquery = (
        select(
            EventEntry.team_id.label("team_id"),
            EventEntry.car_id.label("car_id"),
            EventEntry.car_number.label("car_number"),
        )
        .select_from(EventEntry)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season.short_name)
        .distinct()
        .subquery()
    )
    entrants_count = session.exec(select(func.count()).select_from(entrants_subquery)).first()

    entry_counts = session.exec(
        select(
            func.count(func.distinct(EventEntry.team_id)).label("different_teams"),
            func.count(func.distinct(EventEntry.driver_id)).label("different_drivers"),
            func.count(func.distinct(EventEntry.car_id)).label("different_cars"),
        )
        .select_from(EventEntry)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season.short_name)
    ).first()

    world_round_rows = session.exec(
        select(
            Event.id.label("event_id"),
            Event.round.label("event_round"),
            Event.event_date.label("event_date"),
            Circuit.lat.label("lat"),
            Circuit.lon.label("lon"),
        )
        .select_from(Event)
        .join(Circuit, Circuit.id == Event.circuit_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Event.season_short_name == season.short_name)
        .where(Championship.short_name == "f1_driver_world")
        .group_by(Event.id, Event.round, Event.event_date, Circuit.lat, Circuit.lon)
        .order_by(func.coalesce(Event.round, 9999), Event.event_date.asc(), Event.id.asc())
    ).all()

    km_travelled = 0.0
    previous_coords: tuple[float, float] | None = None
    for row in world_round_rows:
        if row.lat is None or row.lon is None:
            continue
        current_coords = (float(row.lat), float(row.lon))
        if previous_coords is not None:
            km_travelled += _haversine_km(
                previous_coords[0],
                previous_coords[1],
                current_coords[0],
                current_coords[1],
            )
        previous_coords = current_coords

    return SeasonStats(
        season_id=season_id,
        f1_world_rounds=int(round_counts.f1_world_rounds or 0),
        f1_non_championship_rounds=int(round_counts.f1_non_championship_rounds or 0),
        entrants=int(entrants_count or 0),
        different_teams=int(entry_counts.different_teams or 0),
        different_drivers=int(entry_counts.different_drivers or 0),
        different_cars=int(entry_counts.different_cars or 0),
        km_travelled=round(km_travelled, 2),
    )


@admin_router.patch("/{season_id}", response_model=SeasonRead)
@router.patch("/{season_id}", response_model=SeasonRead)
def update_season(
    season_id: int,
    season_in: SeasonUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SeasonRead:
    season = session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    update_data = model_dump(season_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(season, key, value)

    session.add(season)
    session.commit()
    session.refresh(season)
    return season


@admin_router.delete(
    "/{season_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{season_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_season(
    season_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    season = session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    session.delete(season)
    session.commit()
    return None
