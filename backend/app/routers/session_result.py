from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Integer, String, case, cast, func
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.car import Car, CarResolved
from app.models.constructor import Constructor
from app.models.driver import Driver
from app.models.entry import EventEntry, EventEntryResolved
from app.models.penalty import Penalty, PenaltyRead
from app.models.session import Session
from app.models.session import SessionType
from app.models.session_result import (
    SessionResult,
    SessionResultCreate,
    SessionResultRead,
    SessionResultResolved,
    SessionResultResolvedNoSession,
    SessionResultUpdate,
)
from app.models.team import Team
from app.models.tire import Tire
from app.models.circuit import Circuit
from app.models.event import Event
from app.models.session import Session as SessionModel
from app.models.user import User, UserRole
from app.utils import model_dump
from sqlmodel import SQLModel

router = APIRouter(prefix="/session-results", tags=["session-results"])
public_router = APIRouter(prefix="/v1/session-results", tags=["session-results"])
admin_router = APIRouter(
    prefix="/api/admin/session-results",
    tags=["session-results"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


def _position_order():
    is_numeric = SessionResult.position.op("~")("^[0-9]+$")
    return case(
        (is_numeric, cast(SessionResult.position, Integer)),
        else_=None,
    )


def _session_type_key(value) -> str:
    raw = value.value if hasattr(value, "value") else str(value or "")
    raw_str = str(raw).strip()
    if "." in raw_str:
        raw_str = raw_str.rsplit(".", 1)[-1]
    return raw_str.upper()




def _resolve_cars(cars: list[Car], session: Session) -> dict[int, CarResolved]:
    constructor_ids = {car.constructor_id for car in cars if car.constructor_id}
    constructors = (
        session.exec(select(Constructor).where(Constructor.id.in_(constructor_ids))).all()
        if constructor_ids
        else []
    )
    constructor_map = {constructor.id: constructor for constructor in constructors}
    return {
        car.id: CarResolved(
            **model_dump(car),
            constructor=constructor_map.get(car.constructor_id),
        )
        for car in cars
    }


def _penalties_by_result(
    session_results: list[SessionResult],
    session: Session,
) -> dict[int, list[PenaltyRead]]:
    result_ids = {result.id for result in session_results if result.id}
    if not result_ids:
        return {}
    rows = session.exec(
        select(Penalty)
        .where(Penalty.session_result_id.in_(result_ids))
        .order_by(Penalty.id.asc())
    ).all()
    penalties: dict[int, list[PenaltyRead]] = {}
    for row in rows:
        penalties.setdefault(row.session_result_id, []).append(
            PenaltyRead(**model_dump(row))
        )
    return penalties


def _resolve_session_results(
    session_results: list[SessionResult],
    session: Session,
) -> list[SessionResultResolved]:
    entry_ids = {result.entry_id for result in session_results if result.entry_id}
    entry_ids |= {
        result.shared_drive_entry_id
        for result in session_results
        if result.shared_drive_entry_id
    }
    session_ids = {result.session_id for result in session_results if result.session_id}

    entries = (
        session.exec(
            select(EventEntry).where(
                EventEntry.id.in_(entry_ids),
            )
        ).all()
        if entry_ids
        else []
    )
    sessions = (
        session.exec(
            select(Session).where(
                Session.id.in_(session_ids),
            )
        ).all()
        if session_ids
        else []
    )

    driver_ids = {entry.driver_id for entry in entries if entry.driver_id}
    team_ids = {entry.team_id for entry in entries if entry.team_id}
    car_ids = {entry.car_id for entry in entries if entry.car_id}
    tire_ids = {entry.tire_id for entry in entries if entry.tire_id}

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
    tires = (
        session.exec(select(Tire).where(Tire.id.in_(tire_ids))).all()
        if tire_ids
        else []
    )

    driver_map = {driver.id: driver for driver in drivers}
    team_map = {team.id: team for team in teams}
    car_map = _resolve_cars(cars, session)
    tire_map = {tire.id: tire for tire in tires}
    entry_map = {
        entry.id: EventEntryResolved(
            id=entry.id,
            car_number=entry.car_number,
            driver=driver_map.get(entry.driver_id),
            team=team_map.get(entry.team_id),
            car=car_map.get(entry.car_id),
            tire=tire_map.get(entry.tire_id),
        )
        for entry in entries
    }
    session_map = {session_item.id: session_item for session_item in sessions}
    penalty_map = _penalties_by_result(session_results, session)

    return [
        SessionResultResolved(
            id=result.id,
            position=result.position,
            points=result.points,
            time=result.time,
            gap=result.gap,
            interval=result.interval,
            laps=result.laps,
            time_penalty=result.time_penalty,
            grid_position=result.grid_position,
            retired_reason=result.retired_reason,
            speed_trap=result.speed_trap,
            shared_drive_entry_id=result.shared_drive_entry_id,
            entry=entry_map.get(result.entry_id),
            shared_drive_entry=entry_map.get(result.shared_drive_entry_id),
            penalties=penalty_map.get(result.id, []),
            session=session_map.get(result.session_id),
        )
        for result in session_results
    ]


def _resolve_session_results_no_session(
    session_results: list[SessionResult],
    session: Session,
) -> list[SessionResultResolvedNoSession]:
    entry_ids = {result.entry_id for result in session_results if result.entry_id}
    entry_ids |= {
        result.shared_drive_entry_id
        for result in session_results
        if result.shared_drive_entry_id
    }

    entries = (
        session.exec(
            select(EventEntry).where(
                EventEntry.id.in_(entry_ids),
            )
        ).all()
        if entry_ids
        else []
    )

    driver_ids = {entry.driver_id for entry in entries if entry.driver_id}
    team_ids = {entry.team_id for entry in entries if entry.team_id}
    car_ids = {entry.car_id for entry in entries if entry.car_id}
    tire_ids = {entry.tire_id for entry in entries if entry.tire_id}

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
    tires = (
        session.exec(select(Tire).where(Tire.id.in_(tire_ids))).all()
        if tire_ids
        else []
    )

    driver_map = {driver.id: driver for driver in drivers}
    team_map = {team.id: team for team in teams}
    car_map = _resolve_cars(cars, session)
    tire_map = {tire.id: tire for tire in tires}
    entry_map = {
        entry.id: EventEntryResolved(
            id=entry.id,
            car_number=entry.car_number,
            driver=driver_map.get(entry.driver_id),
            team=team_map.get(entry.team_id),
            car=car_map.get(entry.car_id),
            tire=tire_map.get(entry.tire_id),
        )
        for entry in entries
    }

    penalty_map = _penalties_by_result(session_results, session)

    return [
        SessionResultResolvedNoSession(
            id=result.id,
            position=result.position,
            points=result.points,
            time=result.time,
            gap=result.gap,
            interval=result.interval,
            laps=result.laps,
            time_penalty=result.time_penalty,
            grid_position=result.grid_position,
            retired_reason=result.retired_reason,
            speed_trap=result.speed_trap,
            shared_drive_entry_id=result.shared_drive_entry_id,
            entry=entry_map.get(result.entry_id),
            shared_drive_entry=entry_map.get(result.shared_drive_entry_id),
            penalties=penalty_map.get(result.id, []),
        )
        for result in session_results
    ]


class FastestLapCreate(SQLModel):
    event_id: int
    entry_id: int
    laps: Optional[int] = None
    time: Optional[str] = None
    speed_trap: Optional[float] = None


class FastestLapUpdate(SQLModel):
    entry_id: Optional[int] = None
    laps: Optional[int] = None
    time: Optional[str] = None
    speed_trap: Optional[float] = None


def _lookup_race_session_id(session: Session, event_id: int) -> int:
    race_session = session.exec(
        select(Session)
        .where(Session.event_id == event_id)
        .where(Session.type == SessionType.RACE)
        
    ).first()
    if not race_session:
        raise HTTPException(status_code=404, detail="Race session not found")
    return race_session.id


@admin_router.post("", response_model=SessionResultRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=SessionResultRead, status_code=status.HTTP_201_CREATED)
def create_session_result(
    session_result_in: SessionResultCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SessionResultRead:
    session_result = SessionResult(**model_dump(session_result_in))
    session.add(session_result)
    session.commit()
    session.refresh(session_result)
    return session_result


@public_router.get("", response_model=list[SessionResultResolved])
def list_session_results_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[SessionResultResolved]:
    return list_session_results(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[SessionResultResolved])
@router.get("", response_model=list[SessionResultResolved])
def list_session_results(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[SessionResultResolved]:
    position_order = _position_order()
    statement = (
        select(SessionResult)
        
        .order_by(position_order.nulls_last(), SessionResult.position.asc())
        .offset(offset)
        .limit(limit)
    )
    session_results = session.exec(statement).all()
    return _resolve_session_results(session_results, session)


@public_router.get("/by-event/{event_id}", response_model=list[SessionResultResolvedNoSession])
def list_session_results_by_event_public(
    event_id: int,
    session_type: str = Query(...),
    session: Session = Depends(get_readonly_session),
) -> list[SessionResultResolvedNoSession]:
    return list_session_results_by_event(
        event_id=event_id,
        session_type=session_type,
        session=session,
    )


@admin_router.get("/by-event/{event_id}", response_model=list[SessionResultResolvedNoSession])
@router.get("/by-event/{event_id}", response_model=list[SessionResultResolvedNoSession])
def list_session_results_by_event(
    event_id: int,
    session_type: str = Query(...),
    session: Session = Depends(get_session),
) -> list[SessionResultResolvedNoSession]:
    normalized_type = session_type.strip().lower()
    session_stmt = (
        select(Session)
        .where(Session.event_id == event_id)
        .where(func.lower(cast(Session.type, String)) == normalized_type)
    )
    session_items = session.exec(session_stmt).all()
    if not session_items:
        return []

    session_ids = [item.id for item in session_items]
    position_order = _position_order()
    results_stmt = (
        select(SessionResult)
        .where(
            SessionResult.session_id.in_(session_ids),
        )
        .order_by(position_order.nulls_last(), SessionResult.position.asc())
    )
    if normalized_type == "race":
        results_stmt = results_stmt.where(SessionResult.position != "FL")
    session_results = session.exec(results_stmt).all()
    return _resolve_session_results_no_session(session_results, session)


@public_router.get("/fastest-laps/by-event/{event_id}", response_model=list[SessionResultResolvedNoSession])
def list_fastest_laps_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[SessionResultResolvedNoSession]:
    return list_fastest_laps_by_event(event_id=event_id, session=session)


@admin_router.get("/fastest-laps/by-event/{event_id}", response_model=list[SessionResultResolvedNoSession])
@router.get("/fastest-laps/by-event/{event_id}", response_model=list[SessionResultResolvedNoSession])
def list_fastest_laps_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> list[SessionResultResolvedNoSession]:
    race_session_id = _lookup_race_session_id(session, event_id)
    results = session.exec(
        select(SessionResult)
        .where(
            SessionResult.session_id == race_session_id,
            SessionResult.position == "FL",
        )
    ).all()
    return _resolve_session_results_no_session(results, session)


@public_router.get("/counts/by-event/{event_id}")
def count_session_results_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> dict:
    return count_session_results_by_event(event_id=event_id, session=session)


@admin_router.get("/counts/by-event/{event_id}")
@router.get("/counts/by-event/{event_id}")
def count_session_results_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> dict:
    stmt = (
        select(Session.type, func.count(SessionResult.id))
        .join(SessionResult, SessionResult.session_id == Session.id, isouter=True)
        .where(Session.event_id == event_id)
        .where(
            ~(
                (Session.type == SessionType.RACE)
                & (SessionResult.position == "FL")
            )
            | (SessionResult.id.is_(None))
        )
        .group_by(Session.type)
    )
    rows = session.exec(stmt).all()
    counts = {_session_type_key(row[0]): int(row[1] or 0) for row in rows}
    fastest_lap_count = session.exec(
        select(func.count(SessionResult.id))
        .join(Session, SessionResult.session_id == Session.id)
        .where(
            Session.event_id == event_id,
            SessionResult.position == "FL",
        )
    ).first()
    return {
        "by_session_type": counts,
        "fastest_lap": int(fastest_lap_count or 0),
    }


@admin_router.post("/fastest-laps", response_model=SessionResultRead, status_code=status.HTTP_201_CREATED)
@router.post("/fastest-laps", response_model=SessionResultRead, status_code=status.HTTP_201_CREATED)
def create_fastest_lap(
    payload: FastestLapCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SessionResultRead:
    race_session_id = _lookup_race_session_id(session, payload.event_id)
    existing = session.exec(
        select(SessionResult)
        .where(SessionResult.session_id == race_session_id)
        .where(SessionResult.entry_id == payload.entry_id)
        .where(SessionResult.position == "FL")
        
    ).first()
    if existing:
        return existing
    fastest_lap = SessionResult(
        session_id=race_session_id,
        entry_id=payload.entry_id,
        position="FL",
        laps=payload.laps,
        time=payload.time,
        speed_trap=payload.speed_trap,
    )
    session.add(fastest_lap)
    session.commit()
    session.refresh(fastest_lap)
    return fastest_lap


@admin_router.patch("/fastest-laps/{session_result_id}", response_model=SessionResultRead)
@router.patch("/fastest-laps/{session_result_id}", response_model=SessionResultRead)
def update_fastest_lap(
    session_result_id: int,
    payload: FastestLapUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SessionResultRead:
    fastest_lap = session.get(SessionResult, session_result_id)
    if (
        not fastest_lap
        or fastest_lap.position != "FL"
    ):
        raise HTTPException(status_code=404, detail="Fastest lap not found")
    update_data = model_dump(payload, exclude_unset=True)
    for key, value in update_data.items():
        setattr(fastest_lap, key, value)
    session.add(fastest_lap)
    session.commit()
    session.refresh(fastest_lap)
    return fastest_lap


@admin_router.delete(
    "/fastest-laps/{session_result_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/fastest-laps/{session_result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_fastest_lap(
    session_result_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    fastest_lap = session.get(SessionResult, session_result_id)
    if (
        not fastest_lap
        or fastest_lap.position != "FL"
    ):
        raise HTTPException(status_code=404, detail="Fastest lap not found")
    session.delete(fastest_lap)
    session.commit()
    return None


def _format_lap_duration(seconds: float) -> str:
    """Convert seconds (e.g. 87.123) to a mm:ss.SSS string."""
    if seconds is None:
        return ""
    minutes = int(seconds // 60)
    remainder = seconds - minutes * 60
    return f"{minutes}:{remainder:06.3f}"


@admin_router.post("/fastest-laps/by-event/{event_id}/openf1/fetch")
@router.post("/fastest-laps/by-event/{event_id}/openf1/fetch")
def fetch_fastest_laps_from_openf1(
    event_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    return _impl_fetch_fastest_laps(session, event_id)


def _impl_fetch_fastest_laps(session: Session, event_id: int) -> dict:
    """Fetch race fastest laps from OpenF1. Reusable by routes and the scheduler.

    Raises ``HTTPException``; translated to domain exceptions in
    ``app.services.openf1_fetch`` for the scheduler.
    """
    from app.routers.session import (
        _openf1_get,
        _resolve_openf1_meeting_for_event,
        _resolve_openf1_session_for_local_session,
    )

    race_session_id = _lookup_race_session_id(session, event_id)
    race_session = session.get(SessionModel, race_session_id)
    if not race_session:
        raise HTTPException(status_code=404, detail="Race session not found")

    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    circuit = session.get(Circuit, event.circuit_id) if event.circuit_id else None
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")

    try:
        openf1_meeting, _ = _resolve_openf1_meeting_for_event(event, circuit)
        meeting_key = openf1_meeting.get("meeting_key")
        if meeting_key is None:
            raise HTTPException(
                status_code=422, detail="OpenF1 meeting key not found."
            )

        openf1_sessions = _openf1_get("sessions", {"meeting_key": meeting_key})
        openf1_session, _ = _resolve_openf1_session_for_local_session(
            race_session, openf1_sessions
        )
        session_key = openf1_session.get("session_key")
        if session_key is None:
            raise HTTPException(
                status_code=422, detail="OpenF1 session key not found."
            )

        openf1_laps = _openf1_get("laps", {"session_key": session_key})
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502, detail=f"OpenF1 request failed: {exc}"
        ) from exc

    if not openf1_laps:
        raise HTTPException(
            status_code=422, detail="No lap data returned from OpenF1."
        )

    # Aggregate per driver: fastest lap + max speed trap
    driver_data: dict[str, dict] = {}
    for lap in openf1_laps:
        driver_num = str(lap.get("driver_number", "")).strip()
        if not driver_num:
            continue
        duration = lap.get("lap_duration")
        st_speed = lap.get("st_speed")
        lap_number = lap.get("lap_number")

        if driver_num not in driver_data:
            driver_data[driver_num] = {
                "fastest_duration": None,
                "fastest_lap_number": None,
                "max_speed_trap": None,
            }
        entry = driver_data[driver_num]

        if duration is not None:
            try:
                dur = float(duration)
                if entry["fastest_duration"] is None or dur < entry["fastest_duration"]:
                    entry["fastest_duration"] = dur
                    entry["fastest_lap_number"] = lap_number
            except (TypeError, ValueError):
                pass

        if st_speed is not None:
            try:
                speed = float(st_speed)
                if entry["max_speed_trap"] is None or speed > entry["max_speed_trap"]:
                    entry["max_speed_trap"] = speed
            except (TypeError, ValueError):
                pass

    # Map driver numbers to local event entries
    event_entries = session.exec(
        select(EventEntry).where(EventEntry.event_id == event_id)
    ).all()
    entry_by_car_number: dict[str, EventEntry] = {}
    for event_entry in event_entries:
        if event_entry.car_number is not None:
            key = str(event_entry.car_number).strip()
            if key:
                entry_by_car_number[key] = event_entry

    # Load existing FL records
    existing_fl = session.exec(
        select(SessionResult).where(
            SessionResult.session_id == race_session_id,
            SessionResult.position == "FL",
        )
    ).all()
    fl_by_entry_id: dict[int, SessionResult] = {
        r.entry_id: r for r in existing_fl
    }

    created = 0
    updated = 0
    for driver_num, data in driver_data.items():
        local_entry = entry_by_car_number.get(driver_num)
        if not local_entry or local_entry.id is None:
            continue

        time_str = (
            _format_lap_duration(data["fastest_duration"])
            if data["fastest_duration"] is not None
            else None
        )
        lap_num = data["fastest_lap_number"]
        speed = data["max_speed_trap"]

        existing = fl_by_entry_id.get(local_entry.id)
        if existing:
            existing.laps = lap_num
            existing.time = time_str
            existing.speed_trap = speed
            session.add(existing)
            updated += 1
        else:
            new_fl = SessionResult(
                session_id=race_session_id,
                entry_id=local_entry.id,
                position="FL",
                laps=lap_num,
                time=time_str,
                speed_trap=speed,
            )
            session.add(new_fl)
            created += 1

    session.commit()

    return {
        "event_id": event_id,
        "created": created,
        "updated": updated,
        "total": created + updated,
        "drivers_in_openf1": len(driver_data),
        "matched_entries": created + updated,
    }


@public_router.get("/{session_result_id}", response_model=SessionResultRead)
def get_session_result_public(
    session_result_id: int,
    session: Session = Depends(get_readonly_session),
) -> SessionResultRead:
    return get_session_result(session_result_id=session_result_id, session=session)


@admin_router.get("/{session_result_id}", response_model=SessionResultRead)
@router.get("/{session_result_id}", response_model=SessionResultRead)
def get_session_result(
    session_result_id: int,
    session: Session = Depends(get_session),
) -> SessionResultRead:
    session_result = session.get(SessionResult, session_result_id)
    if not session_result:
        raise HTTPException(status_code=404, detail="Session result not found")
    return session_result


@admin_router.patch("/{session_result_id}", response_model=SessionResultRead)
@router.patch("/{session_result_id}", response_model=SessionResultRead)
def update_session_result(
    session_result_id: int,
    session_result_in: SessionResultUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SessionResultRead:
    session_result = session.get(SessionResult, session_result_id)
    if not session_result:
        raise HTTPException(status_code=404, detail="Session result not found")

    update_data = model_dump(session_result_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(session_result, key, value)

    session.add(session_result)
    session.commit()
    session.refresh(session_result)
    return session_result


@admin_router.delete(
    "/{session_result_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{session_result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session_result(
    session_result_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    session_result = session.get(SessionResult, session_result_id)
    if not session_result:
        raise HTTPException(status_code=404, detail="Session result not found")

    session.delete(session_result)
    session.commit()
    return None
