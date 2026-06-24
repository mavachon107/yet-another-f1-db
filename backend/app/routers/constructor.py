from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, SQLModel, select

from app.core.auth import require_role
from app.core.slug import slugify_text, unique_slug
from app.database import get_readonly_session, get_session
from app.models.championship import Championship
from app.models.car import Car, CarRead, CarResolved
from app.models.constructor import (
    Constructor,
    ConstructorCreate,
    ConstructorRead,
    ConstructorUpdate,
)
from app.models.constructor_lineage import ConstructorLineage
from app.models.driver import Driver, DriverRead
from app.models.driver_standing import DriverStanding
from app.models.engine import Engine
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.session import Session as EventSession, SessionType
from app.models.session_result import SessionResult
from app.models.team import Team, TeamRead
from app.models.user import User, UserRole
from app.routers.car import _list_cars_by_constructor
from app.routers.team import _resolve_teams
from app.utils import model_dump

router = APIRouter(prefix="/constructors", tags=["constructors"])
public_router = APIRouter(prefix="/v1/constructors", tags=["constructors"])
admin_router = APIRouter(
    prefix="/api/admin/constructors",
    tags=["constructors"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)
F1_DRIVER_CHAMPIONSHIP = "f1_driver_world"
F1_CONSTRUCTOR_CHAMPIONSHIP = "f1_constructor_world"


class ConstructorStats(SQLModel):
    starts: int
    poles: int
    wins: int
    podiums: int
    first_event_name: str | None = None
    last_event_name: str | None = None


class ConstructorCount(SQLModel):
    constructor_id: int
    name: str | None = None
    short_name: str | None = None
    total: int


class ConstructorResultEntry(SQLModel):
    event_id: int
    event_slug: str | None = None
    event_name: str | None = None
    year: int
    driver: DriverRead | None = None
    team: TeamRead | None = None
    car: CarRead | None = None


class ConstructorLineageNode(SQLModel):
    constructor_id: int
    slug: str | None = None
    name: str | None = None
    short_name: str | None = None
    role: str
    predecessor_depth: int | None = None
    successor_depth: int | None = None
    first_run_year: int | None = None
    last_run_year: int | None = None


class ConstructorLineageEdge(SQLModel):
    link_id: int
    from_constructor_id: int
    to_constructor_id: int
    notes: str | None = None


class ConstructorLineageReadGraph(SQLModel):
    current_constructor_id: int
    nodes: list[ConstructorLineageNode] = []
    edges: list[ConstructorLineageEdge] = []


class ConstructorWinsByYear(SQLModel):
    year: int
    wins: int
    events: int


class ConstructorLineageTransition(SQLModel):
    parent_constructor_id: int
    parent_name: str | None = None
    parent_short_name: str | None = None
    child_constructor_id: int
    child_name: str | None = None
    child_short_name: str | None = None
    child_first_run_year: int | None = None
    child_last_run_year: int | None = None




def _resolve_constructor(slug: str, session: Session) -> Constructor:
    obj = session.exec(select(Constructor).where(Constructor.slug == slug)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Constructor not found")
    return obj


def _constructor_counts_by_session_type(
    session: Session,
    session_type: SessionType,
    position_column=SessionResult.position,
) -> list[ConstructorCount]:
    statement = (
        select(
            Constructor.id,
            Constructor.name,
            Constructor.short_name,
            func.count(SessionResult.id).label("total"),
        )
        .join(Car, Car.constructor_id == Constructor.id)
        .join(EventEntry, EventEntry.car_id == Car.id)
        .join(SessionResult, SessionResult.entry_id == EventEntry.id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventSession.type == session_type)
        .where(position_column == "1")
        .where(SessionResult.shared_drive_entry_id.is_(None))
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .group_by(Constructor.id)
        .order_by(func.count(SessionResult.id).desc(), Constructor.id.asc())
    )
    rows = session.exec(statement).all()
    return [
        ConstructorCount(
            constructor_id=row[0],
            name=row[1],
            short_name=row[2],
            total=int(row[3] or 0),
        )
        for row in rows
    ]


def _resolve_constructors(
    constructors: list[Constructor], session: Session
) -> list[ConstructorRead]:
    constructor_ids = [item.id for item in constructors if item.id is not None]
    entry_counts = {}
    wins_counts = {}
    first_last_years = {}
    if constructor_ids:
        entry_counts = dict(
            session.exec(
                select(Car.constructor_id, func.count(EventEntry.id))
                .join(EventEntry, EventEntry.car_id == Car.id)
                .where(Car.constructor_id.in_(constructor_ids))
                .group_by(Car.constructor_id)
            ).all()
        )
        year_expr = func.extract("year", Event.event_date)
        first_last_years = {
            row[0]: (row[1], row[2])
            for row in session.exec(
                select(
                    Car.constructor_id,
                    func.min(year_expr),
                    func.max(year_expr),
                )
                .join(EventEntry, EventEntry.car_id == Car.id)
                .join(Event, Event.id == EventEntry.event_id)
                .where(Car.constructor_id.in_(constructor_ids))
                .group_by(Car.constructor_id)
            ).all()
        }
        wins_counts = dict(
            session.exec(
                select(
                    Car.constructor_id,
                    func.coalesce(
                        func.sum(case((SessionResult.position == "1", 1), else_=0)),
                        0,
                    ),
                )
                .join(EventEntry, EventEntry.car_id == Car.id)
                .join(SessionResult, SessionResult.entry_id == EventEntry.id)
                .join(EventSession, EventSession.id == SessionResult.session_id)
                .where(
                    Car.constructor_id.in_(constructor_ids),
                    EventSession.type == SessionType.RACE,
                    SessionResult.shared_drive_entry_id.is_(None),
                )
                .group_by(Car.constructor_id)
            ).all()
        )
    return [
        ConstructorRead(
            **model_dump(constructor),
            event_entry_count=int(entry_counts.get(constructor.id, 0)),
            first_run_year=(
                int(first_last_years.get(constructor.id, (None, None))[0])
                if first_last_years.get(constructor.id, (None, None))[0] is not None
                else None
            ),
            last_run_year=(
                int(first_last_years.get(constructor.id, (None, None))[1])
                if first_last_years.get(constructor.id, (None, None))[1] is not None
                else None
            ),
            wins_count=int(wins_counts.get(constructor.id, 0)),
        )
        for constructor in constructors
    ]


def _get_constructor_stats_by_id(
    constructor_id: int,
    session: Session,
) -> ConstructorStats:
    constructor = session.get(Constructor, constructor_id)
    if not constructor:
        raise HTTPException(status_code=404, detail="Constructor not found")

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
        .join(Car, Car.id == EventEntry.car_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Car.constructor_id == constructor_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(SessionResult.shared_drive_entry_id.is_(None))
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

    # Poles are based on the qualifying grid (grid_position == 1), so grid
    # penalties are reflected rather than the qualifying classification.
    pole_stmt = (
        select(
            func.coalesce(
                func.sum(case((SessionResult.grid_position == "1", 1), else_=0)), 0
            ).label("poles")
        )
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(Car, Car.id == EventEntry.car_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Car.constructor_id == constructor_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.QUALI)
        .where(SessionResult.shared_drive_entry_id.is_(None))
    )
    pole_row = session.exec(pole_stmt).first()
    poles = int(pole_row or 0) if pole_row is not None else 0

    first_event_stmt = (
        select(Event.event_name)
        .select_from(SessionResult)
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(Car, Car.id == EventEntry.car_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Car.constructor_id == constructor_id)
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
        .join(Car, Car.id == EventEntry.car_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Car.constructor_id == constructor_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .where(starts_condition)
        .order_by(Event.event_date.desc(), Event.id.desc())
        .limit(1)
    )
    last_event_name = session.exec(last_event_stmt).first()

    return ConstructorStats(
        starts=starts,
        poles=poles,
        wins=wins,
        podiums=podiums,
        first_event_name=first_event_name,
        last_event_name=last_event_name,
    )


def _get_constructor_dependency_counts(
    constructor_id: int,
    session: Session,
) -> dict[str, int]:
    car_constructor_count = int(
        session.exec(
            select(func.count()).select_from(Car).where(Car.constructor_id == constructor_id)
        ).first()
        or 0
    )
    team_count = int(
        session.exec(
            select(func.count()).select_from(Team).where(Team.constructor_id == constructor_id)
        ).first()
        or 0
    )
    engine_count = int(
        session.exec(
            select(func.count())
            .select_from(Engine)
            .where(Engine.constructor_id == constructor_id)
        ).first()
        or 0
    )
    standing_count = int(
        session.exec(
            select(func.count())
            .select_from(DriverStanding)
            .where(DriverStanding.constructor_id == constructor_id)
        ).first()
        or 0
    )

    counts = {
        "cars": car_constructor_count,
        "teams": team_count,
        "engines": engine_count,
        "standings": standing_count,
    }
    return {label: count for label, count in counts.items() if count > 0}


def _get_constructor_session_results(
    constructor_id: int,
    session: Session,
    session_type: SessionType,
    position_column=SessionResult.position,
) -> list[ConstructorResultEntry]:
    constructor = session.get(Constructor, constructor_id)
    if not constructor:
        raise HTTPException(status_code=404, detail="Constructor not found")

    rows = session.exec(
        select(
            Event.id,
            Event.slug,
            Event.event_name,
            Event.event_date,
            Driver,
            Team,
            Car,
        )
        .join(EventEntry, EventEntry.event_id == Event.id)
        .join(SessionResult, SessionResult.entry_id == EventEntry.id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Car, Car.id == EventEntry.car_id)
        .outerjoin(Driver, Driver.id == EventEntry.driver_id)
        .outerjoin(Team, Team.id == EventEntry.team_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Car.constructor_id == constructor_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == session_type)
        .where(position_column == "1")
        .where(SessionResult.shared_drive_entry_id.is_(None))
        .order_by(Event.event_date.desc(), Event.id.desc())
    ).all()

    results: list[ConstructorResultEntry] = []
    for event_id, event_slug, event_name, event_date, driver, team, car in rows:
        if not event_date:
            continue
        results.append(
            ConstructorResultEntry(
                event_id=event_id,
                event_slug=event_slug,
                event_name=event_name,
                year=event_date.year,
                driver=driver,
                team=team,
                car=car,
            )
        )
    return results


def _constructor_run_years_map(
    constructor_ids: set[int],
    session: Session,
) -> dict[int, tuple[int | None, int | None]]:
    if not constructor_ids:
        return {}
    year_expr = func.extract("year", Event.event_date)
    rows = session.exec(
        select(
            Car.constructor_id,
            func.min(year_expr).label("first_year"),
            func.max(year_expr).label("last_year"),
        )
        .join(EventEntry, EventEntry.car_id == Car.id)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Car.constructor_id.in_(constructor_ids))
        .group_by(Car.constructor_id)
    ).all()
    return {
        int(row[0]): (
            int(row[1]) if row[1] is not None else None,
            int(row[2]) if row[2] is not None else None,
        )
        for row in rows
        if row[0] is not None
    }


def _resolve_constructor_lineage(
    constructor_id: int,
    session: Session,
) -> ConstructorLineageReadGraph:
    constructor = session.get(Constructor, constructor_id)
    if not constructor:
        raise HTTPException(status_code=404, detail="Constructor not found")

    links = session.exec(select(ConstructorLineage)).all()
    links_by_child: dict[int, list[ConstructorLineage]] = {}
    links_by_parent: dict[int, list[ConstructorLineage]] = {}
    for link in links:
        links_by_child.setdefault(link.constructor_id, []).append(link)
        if link.parent_constructor_id is not None:
            links_by_parent.setdefault(link.parent_constructor_id, []).append(link)

    predecessor_depth: dict[int, int] = {}
    queue: list[tuple[int, int]] = [(constructor_id, 0)]
    while queue:
        current_id, depth = queue.pop(0)
        for link in links_by_child.get(current_id, []):
            parent_id = link.parent_constructor_id
            if parent_id is None:
                continue
            next_depth = depth + 1
            existing = predecessor_depth.get(parent_id)
            if existing is None or next_depth < existing:
                predecessor_depth[parent_id] = next_depth
                queue.append((parent_id, next_depth))

    successor_depth: dict[int, int] = {}
    queue = [(constructor_id, 0)]
    while queue:
        current_id, depth = queue.pop(0)
        for link in links_by_parent.get(current_id, []):
            child_id = link.constructor_id
            next_depth = depth + 1
            existing = successor_depth.get(child_id)
            if existing is None or next_depth < existing:
                successor_depth[child_id] = next_depth
                queue.append((child_id, next_depth))

    related_constructor_ids = {constructor_id}
    related_constructor_ids.update(predecessor_depth.keys())
    related_constructor_ids.update(successor_depth.keys())
    constructor_rows = (
        session.exec(select(Constructor).where(Constructor.id.in_(related_constructor_ids))).all()
        if related_constructor_ids
        else []
    )
    constructor_by_id = {item.id: item for item in constructor_rows if item.id is not None}
    run_years = _constructor_run_years_map(related_constructor_ids, session)

    nodes: list[ConstructorLineageNode] = []
    for related_id in related_constructor_ids:
        related = constructor_by_id.get(related_id)
        if related_id == constructor_id:
            role = "current"
        elif related_id in predecessor_depth and related_id in successor_depth:
            role = "both"
        elif related_id in predecessor_depth:
            role = "predecessor"
        elif related_id in successor_depth:
            role = "successor"
        else:
            role = "related"
        first_run_year, last_run_year = run_years.get(related_id, (None, None))
        nodes.append(
            ConstructorLineageNode(
                constructor_id=related_id,
                slug=related.slug if related else None,
                name=related.name if related else None,
                short_name=related.short_name if related else None,
                role=role,
                predecessor_depth=predecessor_depth.get(related_id),
                successor_depth=successor_depth.get(related_id),
                first_run_year=first_run_year,
                last_run_year=last_run_year,
            )
        )

    nodes.sort(
        key=lambda item: (
            0 if item.role == "current" else 1 if item.role == "predecessor" else 2,
            item.predecessor_depth if item.predecessor_depth is not None else 9999,
            item.successor_depth if item.successor_depth is not None else 9999,
            item.name or item.short_name or "",
        )
    )

    edges = [
        ConstructorLineageEdge(
            link_id=link.id,
            from_constructor_id=link.parent_constructor_id,
            to_constructor_id=link.constructor_id,
            notes=link.notes,
        )
        for link in links
        if link.parent_constructor_id is not None
        and link.constructor_id in related_constructor_ids
        and link.parent_constructor_id in related_constructor_ids
    ]
    edges.sort(
        key=lambda item: (
            run_years.get(item.to_constructor_id, (None, None))[0]
            if run_years.get(item.to_constructor_id, (None, None))[0] is not None
            else 9999,
            item.link_id,
        )
    )

    return ConstructorLineageReadGraph(
        current_constructor_id=constructor_id,
        nodes=nodes,
        edges=edges,
    )


def _get_constructor_lineage_transitions(
    session: Session,
) -> list[ConstructorLineageTransition]:
    rows = session.exec(
        select(
            ConstructorLineage.parent_constructor_id,
            ConstructorLineage.constructor_id,
            Constructor.name,
            Constructor.short_name,
            # parent aliases
            select(Constructor.name)
            .where(Constructor.id == ConstructorLineage.parent_constructor_id)
            .scalar_subquery(),
            select(Constructor.short_name)
            .where(Constructor.id == ConstructorLineage.parent_constructor_id)
            .scalar_subquery(),
        )
        .join(Constructor, Constructor.id == ConstructorLineage.constructor_id)
        .where(ConstructorLineage.parent_constructor_id.is_not(None))
    ).all()

    child_ids = {int(row[1]) for row in rows if row[1] is not None}
    years_map = _constructor_run_years_map(child_ids, session)
    items = [
        ConstructorLineageTransition(
            parent_constructor_id=int(row[0]),
            parent_name=row[4],
            parent_short_name=row[5],
            child_constructor_id=int(row[1]),
            child_name=row[2],
            child_short_name=row[3],
            child_first_run_year=years_map.get(int(row[1]), (None, None))[0],
            child_last_run_year=years_map.get(int(row[1]), (None, None))[1],
        )
        for row in rows
        if row[0] is not None and row[1] is not None
    ]
    items.sort(
        key=lambda item: (
            item.child_first_run_year if item.child_first_run_year is not None else 9999,
            item.child_name or item.child_short_name or "",
        )
    )
    return items


def _get_constructor_wins_by_year(
    constructor_id: int, session: Session
) -> list[ConstructorWinsByYear]:
    constructor = session.get(Constructor, constructor_id)
    if not constructor:
        raise HTTPException(status_code=404, detail="Constructor not found")

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
        .join(Car, Car.id == EventEntry.car_id)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(Event, Event.id == EventSession.event_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Car.constructor_id == constructor_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .where(SessionResult.shared_drive_entry_id.is_(None))
        .group_by(year_col)
        .order_by(year_col.asc())
    )
    rows = session.exec(stmt).all()
    return [
        ConstructorWinsByYear(year=int(row[0]), wins=int(row[1]), events=int(row[2]))
        for row in rows
        if int(row[2]) > 0
    ]


@admin_router.post("", response_model=ConstructorRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=ConstructorRead, status_code=status.HTTP_201_CREATED)
def create_constructor(
    constructor_in: ConstructorCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ConstructorRead:
    constructor = Constructor(**model_dump(constructor_in))
    constructor.slug = unique_slug(session, Constructor, slugify_text(constructor.name))
    session.add(constructor)
    session.commit()
    session.refresh(constructor)
    return constructor


@public_router.get("", response_model=list[ConstructorRead])
def list_constructors_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorRead]:
    return list_constructors(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[ConstructorRead])
@router.get("", response_model=list[ConstructorRead])
def list_constructors(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[ConstructorRead]:
    statement = (
        select(Constructor)
        
        .offset(offset)
        .limit(limit)
    )
    constructors = session.exec(statement).all()
    return _resolve_constructors(constructors, session)


@public_router.get("/by-name", response_model=list[ConstructorRead])
def list_constructors_by_name_public(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorRead]:
    return list_constructors_by_name(
        starts_with=starts_with,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("/by-name", response_model=list[ConstructorRead])
@router.get("/by-name", response_model=list[ConstructorRead])
def list_constructors_by_name(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[ConstructorRead]:
    prefix = starts_with.strip().lower()
    statement = (
        select(Constructor)
        .where(
            Constructor.name.ilike(f"{prefix}%"),
        )
        .order_by(Constructor.name.asc(), Constructor.short_name.asc())
        .offset(offset)
        .limit(limit)
    )
    constructors = session.exec(statement).all()
    return _resolve_constructors(constructors, session)


@public_router.get("/search", response_model=list[ConstructorRead])
def search_constructors_public(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorRead]:
    return search_constructors(q=q, offset=offset, limit=limit, session=session)


@admin_router.get("/search", response_model=list[ConstructorRead])
@router.get("/search", response_model=list[ConstructorRead])
def search_constructors(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[ConstructorRead]:
    term = f"%{q.strip()}%"
    statement = (
        select(Constructor)
        .where(
            Constructor.name.ilike(term) | Constructor.short_name.ilike(term),
        )
        .order_by(Constructor.name.asc(), Constructor.short_name.asc())
        .offset(offset)
        .limit(limit)
    )
    constructors = session.exec(statement).all()
    return _resolve_constructors(constructors, session)


@public_router.get("/stats/number_wins", response_model=list[ConstructorCount])
def number_constructor_wins_public(
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorCount]:
    return number_constructor_wins(session=session)


@admin_router.get("/stats/number_wins", response_model=list[ConstructorCount])
@router.get("/stats/number_wins", response_model=list[ConstructorCount])
def number_constructor_wins(
    session: Session = Depends(get_session),
) -> list[ConstructorCount]:
    return _constructor_counts_by_session_type(session, SessionType.RACE)


@public_router.get("/stats/number_pole_positions", response_model=list[ConstructorCount])
def number_constructor_pole_positions_public(
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorCount]:
    return number_constructor_pole_positions(session=session)


@admin_router.get("/stats/number_pole_positions", response_model=list[ConstructorCount])
@router.get("/stats/number_pole_positions", response_model=list[ConstructorCount])
def number_constructor_pole_positions(
    session: Session = Depends(get_session),
) -> list[ConstructorCount]:
    # Poles come from the qualifying grid (grid_position == 1), reflecting grid
    # penalties rather than the qualifying classification.
    return _constructor_counts_by_session_type(
        session, SessionType.QUALI, SessionResult.grid_position
    )


@public_router.get(
    "/stats/lineage-transitions", response_model=list[ConstructorLineageTransition]
)
def constructor_lineage_transitions_public(
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorLineageTransition]:
    return _get_constructor_lineage_transitions(session)


@admin_router.get(
    "/stats/lineage-transitions", response_model=list[ConstructorLineageTransition]
)
@router.get("/stats/lineage-transitions", response_model=list[ConstructorLineageTransition])
def constructor_lineage_transitions(
    session: Session = Depends(get_session),
) -> list[ConstructorLineageTransition]:
    return _get_constructor_lineage_transitions(session)


def _list_constructors_by_season(
    session: Session,
    season_short_name: str,
) -> list[ConstructorRead]:
    statement = (
        select(Constructor)
        .join(Car, Car.constructor_id == Constructor.id)
        .join(EventEntry, EventEntry.car_id == Car.id)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season_short_name)
        .distinct()
        .order_by(Constructor.name.asc())
    )
    constructors = session.exec(statement).all()
    return _resolve_constructors(constructors, session)


@public_router.get("/by-season", response_model=list[ConstructorRead])
def list_constructors_by_season_public(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorRead]:
    return _list_constructors_by_season(session=session, season_short_name=season)


@admin_router.get("/by-season", response_model=list[ConstructorRead])
@router.get("/by-season", response_model=list[ConstructorRead])
def list_constructors_by_season(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_session),
) -> list[ConstructorRead]:
    return _list_constructors_by_season(session=session, season_short_name=season)


@public_router.get(
    "/{slug}/wins-by-year", response_model=list[ConstructorWinsByYear]
)
def get_constructor_wins_by_year_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorWinsByYear]:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_wins_by_year(constructor_id=obj.id, session=session)


@admin_router.get(
    "/{slug}/wins-by-year", response_model=list[ConstructorWinsByYear]
)
@router.get("/{slug}/wins-by-year", response_model=list[ConstructorWinsByYear])
def get_constructor_wins_by_year(
    slug: str,
    session: Session = Depends(get_session),
) -> list[ConstructorWinsByYear]:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_wins_by_year(constructor_id=obj.id, session=session)


@public_router.get("/{slug}/cars", response_model=list[CarResolved])
def list_constructor_cars_public(
    slug: str,
    offset: int = Query(0, ge=0),
    limit: int | None = Query(default=None, ge=1),
    session: Session = Depends(get_readonly_session),
) -> list[CarResolved]:
    obj = _resolve_constructor(slug, session)
    return _list_cars_by_constructor(
        constructor_id=obj.id,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("/{slug}/cars", response_model=list[CarResolved])
@router.get("/{slug}/cars", response_model=list[CarResolved])
def list_constructor_cars(
    slug: str,
    offset: int = Query(0, ge=0),
    limit: int | None = Query(default=None, ge=1),
    session: Session = Depends(get_session),
) -> list[CarResolved]:
    obj = _resolve_constructor(slug, session)
    return _list_cars_by_constructor(
        constructor_id=obj.id,
        offset=offset,
        limit=limit,
        session=session,
    )


@public_router.get("/{slug}/teams")
def list_constructor_teams_public(
    slug: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
):
    obj = _resolve_constructor(slug, session)
    statement = (
        select(Team)
        .outerjoin(EventEntry, EventEntry.team_id == Team.id)
        .outerjoin(Event, Event.id == EventEntry.event_id)
        .where(Team.constructor_id == obj.id)
        .group_by(Team.id)
        .order_by(
            func.max(func.extract("year", Event.event_date)).desc().nulls_last(),
            Team.team_name.asc(),
            Team.short_name.asc(),
        )
        .offset(offset)
        .limit(limit)
    )
    teams = session.exec(statement).all()
    resolved = _resolve_teams(teams, session)
    resolved.sort(key=lambda t: (t.last_run_year or 0), reverse=True)
    return resolved


@admin_router.get("/{slug}/teams")
@router.get("/{slug}/teams")
def list_constructor_teams(
    slug: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
):
    obj = _resolve_constructor(slug, session)
    statement = (
        select(Team)
        .outerjoin(EventEntry, EventEntry.team_id == Team.id)
        .outerjoin(Event, Event.id == EventEntry.event_id)
        .where(Team.constructor_id == obj.id)
        .group_by(Team.id)
        .order_by(
            func.max(func.extract("year", Event.event_date)).desc().nulls_last(),
            Team.team_name.asc(),
            Team.short_name.asc(),
        )
        .offset(offset)
        .limit(limit)
    )
    teams = session.exec(statement).all()
    resolved = _resolve_teams(teams, session)
    resolved.sort(key=lambda t: (t.last_run_year or 0), reverse=True)
    return resolved


@public_router.get("/{slug}", response_model=ConstructorRead)
def get_constructor_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> ConstructorRead:
    return get_constructor(slug=slug, session=session)


@admin_router.get("/{slug}", response_model=ConstructorRead)
@router.get("/{slug}", response_model=ConstructorRead)
def get_constructor(
    slug: str,
    session: Session = Depends(get_session),
) -> ConstructorRead:
    return _resolve_constructor(slug, session)


@public_router.get("/{slug}/stats", response_model=ConstructorStats)
def get_constructor_stats_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> ConstructorStats:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_stats_by_id(constructor_id=obj.id, session=session)


@admin_router.get("/{slug}/stats", response_model=ConstructorStats)
@router.get("/{slug}/stats", response_model=ConstructorStats)
def get_constructor_stats(
    slug: str,
    session: Session = Depends(get_session),
) -> ConstructorStats:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_stats_by_id(constructor_id=obj.id, session=session)


@public_router.get("/{slug}/lineage", response_model=ConstructorLineageReadGraph)
def get_constructor_lineage_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> ConstructorLineageReadGraph:
    obj = _resolve_constructor(slug, session)
    return _resolve_constructor_lineage(constructor_id=obj.id, session=session)


@admin_router.get("/{slug}/lineage", response_model=ConstructorLineageReadGraph)
@router.get("/{slug}/lineage", response_model=ConstructorLineageReadGraph)
def get_constructor_lineage(
    slug: str,
    session: Session = Depends(get_session),
) -> ConstructorLineageReadGraph:
    obj = _resolve_constructor(slug, session)
    return _resolve_constructor_lineage(constructor_id=obj.id, session=session)


@public_router.get("/{slug}/wins", response_model=list[ConstructorResultEntry])
def get_constructor_wins_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorResultEntry]:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_session_results(
        constructor_id=obj.id,
        session=session,
        session_type=SessionType.RACE,
    )


@admin_router.get("/{slug}/wins", response_model=list[ConstructorResultEntry])
@router.get("/{slug}/wins", response_model=list[ConstructorResultEntry])
def get_constructor_wins(
    slug: str,
    session: Session = Depends(get_session),
) -> list[ConstructorResultEntry]:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_session_results(
        constructor_id=obj.id,
        session=session,
        session_type=SessionType.RACE,
    )


@public_router.get(
    "/{slug}/pole-positions", response_model=list[ConstructorResultEntry]
)
def get_constructor_pole_positions_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorResultEntry]:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_session_results(
        constructor_id=obj.id,
        session=session,
        session_type=SessionType.QUALI,
        position_column=SessionResult.grid_position,
    )


@admin_router.get(
    "/{slug}/pole-positions", response_model=list[ConstructorResultEntry]
)
@router.get("/{slug}/pole-positions", response_model=list[ConstructorResultEntry])
def get_constructor_pole_positions(
    slug: str,
    session: Session = Depends(get_session),
) -> list[ConstructorResultEntry]:
    obj = _resolve_constructor(slug, session)
    return _get_constructor_session_results(
        constructor_id=obj.id,
        session=session,
        session_type=SessionType.QUALI,
        position_column=SessionResult.grid_position,
    )


@admin_router.patch("/{slug}", response_model=ConstructorRead)
@router.patch("/{slug}", response_model=ConstructorRead)
def update_constructor(
    slug: str,
    constructor_in: ConstructorUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ConstructorRead:
    constructor = _resolve_constructor(slug, session)

    update_data = model_dump(constructor_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(constructor, key, value)

    if "name" in update_data:
        constructor.slug = unique_slug(
            session, Constructor, slugify_text(constructor.name), exclude_id=constructor.id
        )

    session.add(constructor)
    session.commit()
    session.refresh(constructor)
    return constructor


@admin_router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_constructor(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    constructor = _resolve_constructor(slug, session)

    dependency_counts = _get_constructor_dependency_counts(constructor.id, session)
    if dependency_counts:
        blockers = ", ".join(
            f"{label}: {count}" for label, count in dependency_counts.items()
        )
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot delete constructor because related records still reference it "
                f"({blockers}). Reassign or remove those records first."
            ),
        )

    try:
        session.delete(constructor)
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                "Cannot delete constructor because related records still reference it."
            ),
        )
    return None
