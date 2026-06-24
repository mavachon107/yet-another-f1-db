from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, SQLModel, select

from app.core.auth import require_role
from app.core.slug import slugify_text, unique_slug
from app.database import get_readonly_session, get_session
from app.models.championship import Championship
from app.models.car import Car, CarResolved
from app.models.circuit import Circuit, CircuitCreate, CircuitRead, CircuitUpdate
from app.models.driver import Driver, DriverRead
from app.models.team import TeamRead
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.session import Session as EventSession
from app.models.session import SessionType
from app.models.session_result import SessionResult
from app.models.team import Team
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/circuits", tags=["circuits"])
public_router = APIRouter(prefix="/v1/circuits", tags=["circuits"])
admin_router = APIRouter(
    prefix="/api/admin/circuits",
    tags=["circuits"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)
F1_DRIVER_CHAMPIONSHIP = "f1_driver_world"




class CircuitStats(SQLModel):
    event_count: int
    first_event_name: str | None = None
    first_event_date: str | None = None
    last_event_name: str | None = None
    last_event_date: str | None = None


class CircuitPerformancePoint(SQLModel):
    year: int
    pole_time_s: float | None = None
    fastest_lap_time_s: float | None = None


class CircuitWinnerEntry(SQLModel):
    year: int
    event_id: int
    event_slug: str | None = None
    event_name: str | None = None
    driver: DriverRead | None = None
    team: TeamRead | None = None
    car: CarResolved | None = None


def _parse_time_to_seconds(value: str | None) -> float | None:
    if not value:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    upper = raw.upper()
    if any(token in upper for token in ("DNS", "DNF", "DNQ", "DSQ", "RET", "WD")):
        return None
    parts = raw.split(":")
    try:
        if len(parts) == 3:
            hours = float(parts[0])
            minutes = float(parts[1])
            seconds = float(parts[2])
            return hours * 3600 + minutes * 60 + seconds
        if len(parts) == 2:
            minutes = float(parts[0])
            seconds = float(parts[1])
            return minutes * 60 + seconds
        if len(parts) == 1:
            return float(parts[0])
    except ValueError:
        return None
    return None

def _resolve_circuits(
    circuits: list[Circuit], session: Session
) -> list[CircuitRead]:
    circuit_ids = [c.id for c in circuits if c.id is not None]
    event_counts: dict = {}
    first_last_years: dict = {}
    if circuit_ids:
        event_counts = dict(
            session.exec(
                select(Event.circuit_id, func.count(Event.id))
                .where(Event.circuit_id.in_(circuit_ids))
                .group_by(Event.circuit_id)
            ).all()
        )
        year_expr = func.extract("year", Event.event_date)
        first_last_years = {
            row[0]: (row[1], row[2])
            for row in session.exec(
                select(
                    Event.circuit_id,
                    func.min(year_expr),
                    func.max(year_expr),
                )
                .where(Event.circuit_id.in_(circuit_ids))
                .group_by(Event.circuit_id)
            ).all()
        }
    return [
        CircuitRead(
            **model_dump(circuit),
            event_count=int(event_counts.get(circuit.id, 0)),
            first_run_year=(
                int(first_last_years.get(circuit.id, (None, None))[0])
                if first_last_years.get(circuit.id, (None, None))[0] is not None
                else None
            ),
            last_run_year=(
                int(first_last_years.get(circuit.id, (None, None))[1])
                if first_last_years.get(circuit.id, (None, None))[1] is not None
                else None
            ),
        )
        for circuit in circuits
    ]


def _resolve_circuit(slug: str, session: Session) -> Circuit:
    obj = session.exec(select(Circuit).where(Circuit.slug == slug)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Circuit not found")
    return obj


@admin_router.post("", response_model=CircuitRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=CircuitRead, status_code=status.HTTP_201_CREATED)
def create_circuit(
    circuit_in: CircuitCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> CircuitRead:
    circuit = Circuit(**model_dump(circuit_in))
    circuit.slug = unique_slug(session, Circuit, slugify_text(circuit.name))
    session.add(circuit)
    session.commit()
    session.refresh(circuit)
    return circuit


@public_router.get("", response_model=list[CircuitRead])
def list_circuits_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CircuitRead]:
    return list_circuits(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[CircuitRead])
@router.get("", response_model=list[CircuitRead])
def list_circuits(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CircuitRead]:
    statement = (
        select(Circuit)
        
        .order_by(Circuit.short_name.asc())
        .offset(offset)
    )
    if limit is not None:
        statement = statement.limit(limit)
    circuits = session.exec(statement).all()
    return _resolve_circuits(circuits, session)


@public_router.get("/stats")
def get_circuit_stats_summary_public(
    session: Session = Depends(get_readonly_session),
) -> dict:
    return get_circuit_stats_summary(session=session)


@admin_router.get("/stats")
@router.get("/stats")
def get_circuit_stats_summary(
    session: Session = Depends(get_session),
) -> dict:
    total = (
        session.exec(
            select(func.count()).select_from(Circuit)
        ).first()
        or 0
    )
    earliest = session.exec(
        select(func.min(Circuit.opened_year))
    ).first()
    latest = session.exec(
        select(func.max(Circuit.opened_year))
    ).first()
    with_location = session.exec(
        select(func.count()).where(
            Circuit.lat.is_not(None),
            Circuit.lon.is_not(None),
        )
    ).first() or 0
    return {
        "total": int(total or 0),
        "earliest_opened_year": int(earliest) if earliest is not None else None,
        "latest_opened_year": int(latest) if latest is not None else None,
        "with_location": int(with_location or 0),
    }


@public_router.get("/by-name", response_model=list[CircuitRead])
def list_circuits_by_name_public(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CircuitRead]:
    return list_circuits_by_name(
        starts_with=starts_with,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("/by-name", response_model=list[CircuitRead])
@router.get("/by-name", response_model=list[CircuitRead])
def list_circuits_by_name(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CircuitRead]:
    prefix = starts_with.strip().lower()
    statement = (
        select(Circuit)
        .where(
            Circuit.name.ilike(f"{prefix}%"),
        )
        .order_by(Circuit.name.asc())
        .offset(offset)
        .limit(limit)
    )
    circuits = session.exec(statement).all()
    return _resolve_circuits(circuits, session)


@public_router.get("/search", response_model=list[CircuitRead])
def search_circuits_public(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CircuitRead]:
    return search_circuits(q=q, offset=offset, limit=limit, session=session)


@admin_router.get("/search", response_model=list[CircuitRead])
@router.get("/search", response_model=list[CircuitRead])
def search_circuits(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CircuitRead]:
    term = f"%{q.strip()}%"
    statement = (
        select(Circuit)
        .where(
            Circuit.name.ilike(term) | Circuit.short_name.ilike(term),
        )
        .order_by(Circuit.name.asc(), Circuit.short_name.asc())
        .offset(offset)
        .limit(limit)
    )
    circuits = session.exec(statement).all()
    return _resolve_circuits(circuits, session)


def _list_circuits_by_season(
    session: Session,
    season_short_name: str,
) -> list[CircuitRead]:
    statement = (
        select(Circuit)
        .join(Event, Event.circuit_id == Circuit.id)
        .where(Event.season_short_name == season_short_name)
        .distinct()
        .order_by(Circuit.name.asc())
    )
    circuits = session.exec(statement).all()
    return _resolve_circuits(circuits, session)


@public_router.get("/by-season", response_model=list[CircuitRead])
def list_circuits_by_season_public(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_readonly_session),
) -> list[CircuitRead]:
    return _list_circuits_by_season(session=session, season_short_name=season)


@admin_router.get("/by-season", response_model=list[CircuitRead])
@router.get("/by-season", response_model=list[CircuitRead])
def list_circuits_by_season(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_session),
) -> list[CircuitRead]:
    return _list_circuits_by_season(session=session, season_short_name=season)


@public_router.get("/{slug}", response_model=CircuitRead)
def get_circuit_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> CircuitRead:
    return get_circuit(slug=slug, session=session)


@admin_router.get("/{slug}", response_model=CircuitRead)
@router.get("/{slug}", response_model=CircuitRead)
def get_circuit(
    slug: str,
    session: Session = Depends(get_session),
) -> CircuitRead:
    obj = _resolve_circuit(slug, session)
    return obj


@public_router.get("/{slug}/stats", response_model=CircuitStats)
def get_circuit_stats_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> CircuitStats:
    return get_circuit_stats(slug=slug, session=session)


@admin_router.get("/{slug}/stats", response_model=CircuitStats)
@router.get("/{slug}/stats", response_model=CircuitStats)
def get_circuit_stats(
    slug: str,
    session: Session = Depends(get_session),
) -> CircuitStats:
    obj = _resolve_circuit(slug, session)
    circuit_id = obj.id

    base_stmt = (
        select(Event)
        .join(EventSession, EventSession.event_id == Event.id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Event.circuit_id == circuit_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
    )

    base_subq = (
        base_stmt.with_only_columns(Event.id).distinct().subquery()
    )
    count_stmt = select(func.count()).select_from(base_subq)
    event_count = int(session.exec(count_stmt).first() or 0)

    first_event = session.exec(
        base_stmt.order_by(Event.event_date.asc(), Event.id.asc()).limit(1)
    ).first()
    last_event = session.exec(
        base_stmt.order_by(Event.event_date.desc(), Event.id.desc()).limit(1)
    ).first()

    return CircuitStats(
        event_count=event_count,
        first_event_name=getattr(first_event, "event_name", None),
        first_event_date=str(first_event.event_date) if first_event else None,
        last_event_name=getattr(last_event, "event_name", None),
        last_event_date=str(last_event.event_date) if last_event else None,
    )


@public_router.get("/{slug}/performance", response_model=list[CircuitPerformancePoint])
def get_circuit_performance_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[CircuitPerformancePoint]:
    return get_circuit_performance(slug=slug, session=session)


@admin_router.get("/{slug}/performance", response_model=list[CircuitPerformancePoint])
@router.get("/{slug}/performance", response_model=list[CircuitPerformancePoint])
def get_circuit_performance(
    slug: str,
    session: Session = Depends(get_session),
) -> list[CircuitPerformancePoint]:
    obj = _resolve_circuit(slug, session)
    circuit_id = obj.id

    rows = session.exec(
        select(
            Event.event_date,
            EventSession.type,
            SessionResult.position,
            SessionResult.time,
        )
        .join(EventSession, EventSession.event_id == Event.id)
        .join(SessionResult, SessionResult.session_id == EventSession.id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Event.circuit_id == circuit_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(
            (EventSession.type == SessionType.RACE)
            | (EventSession.type == SessionType.QUALI)
        )
    ).all()

    per_year: dict[int, CircuitPerformancePoint] = {}
    for event_date, session_type, position, time_value in rows:
        if not event_date:
            continue
        year = event_date.year
        entry = per_year.setdefault(year, CircuitPerformancePoint(year=year))
        time_s = _parse_time_to_seconds(time_value)
        if time_s is None:
            continue
        if session_type == SessionType.QUALI and position == "1":
            if entry.pole_time_s is None or time_s < entry.pole_time_s:
                entry.pole_time_s = time_s
        if session_type == SessionType.RACE and position == "FL":
            if entry.fastest_lap_time_s is None or time_s < entry.fastest_lap_time_s:
                entry.fastest_lap_time_s = time_s

    return sorted(per_year.values(), key=lambda item: item.year)


@public_router.get("/{slug}/winners", response_model=list[CircuitWinnerEntry])
def get_circuit_winners_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[CircuitWinnerEntry]:
    return get_circuit_winners(slug=slug, session=session)


@admin_router.get("/{slug}/winners", response_model=list[CircuitWinnerEntry])
@router.get("/{slug}/winners", response_model=list[CircuitWinnerEntry])
def get_circuit_winners(
    slug: str,
    session: Session = Depends(get_session),
) -> list[CircuitWinnerEntry]:
    obj = _resolve_circuit(slug, session)
    circuit_id = obj.id

    rows = session.exec(
        select(
            Event.event_date,
            Event.id,
            Event.slug,
            Event.event_name,
            Driver,
            Team,
            Car,
        )
        .join(EventSession, EventSession.event_id == Event.id)
        .join(SessionResult, SessionResult.session_id == EventSession.id)
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(Driver, Driver.id == EventEntry.driver_id)
        .outerjoin(Team, Team.id == EventEntry.team_id)
        .outerjoin(Car, Car.id == EventEntry.car_id)
        .join(EventChampionship, EventChampionship.event_id == Event.id)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(Event.circuit_id == circuit_id)
        .where(Championship.short_name == F1_DRIVER_CHAMPIONSHIP)
        .where(EventSession.type == SessionType.RACE)
        .where(SessionResult.position == "1")
        .order_by(Event.event_date.asc(), Event.id.asc())
    ).all()

    results = []
    for event_date, event_id, event_slug, event_name, driver, team, car in rows:
        if not event_date:
            continue
        results.append(
            CircuitWinnerEntry(
                year=event_date.year,
                event_id=event_id,
                event_slug=event_slug,
                event_name=event_name,
                driver=driver,
                team=team,
                car=car,
            )
        )
    return results


@admin_router.patch("/{slug}", response_model=CircuitRead)
@router.patch("/{slug}", response_model=CircuitRead)
def update_circuit(
    slug: str,
    circuit_in: CircuitUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> CircuitRead:
    circuit = _resolve_circuit(slug, session)

    update_data = model_dump(circuit_in, exclude_unset=True)
    if "timezone" not in update_data or not update_data.get("timezone"):
        lat = update_data.get("lat", circuit.lat)
        lon = update_data.get("lon", circuit.lon)
        update_data["timezone"] = _resolve_timezone(lat, lon)
    for key, value in update_data.items():
        setattr(circuit, key, value)

    if "name" in update_data:
        circuit.slug = unique_slug(
            session, Circuit, slugify_text(circuit.name), exclude_id=circuit.id
        )

    session.add(circuit)
    session.commit()
    session.refresh(circuit)
    return circuit


@admin_router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_circuit(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    circuit = _resolve_circuit(slug, session)

    session.delete(circuit)
    session.commit()
    return None
