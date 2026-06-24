from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import String, cast, func
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.car import Car
from app.models.constructor import Constructor
from app.models.driver import Driver
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.point_system_definition import PointSystemDefinition
from app.models.point_system_distance_rule import PointSystemDistanceRule
from app.models.driver_standing import (
    DriverStanding,
    DriverStandingCalculated,
    DriverStandingCreate,
    DriverStandingRead,
    DriverStandingResolved,
    DriverStandingUpdate,
)
from app.models.season_point_system import SeasonPointSystem
from app.models.season import Season
from app.models.session import Session
from app.models.session_result import SessionResult
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/standings", tags=["standings"])
public_router = APIRouter(prefix="/v1/standings", tags=["standings"])
admin_router = APIRouter(
    prefix="/api/admin/standings",
    tags=["standings"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)
STANDING_TYPE_DRIVER = "DRIVER"
STANDING_TYPE_CONSTRUCTOR = "CONSTRUCTOR"


def _parse_float(value: str | float | int | None) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_race_percentage_rule_ranges(
    rules: list[PointSystemDistanceRule],
) -> list[tuple[float, float, float]]:
    ranges = []
    for rule in rules:
        lower = _parse_float(rule.lower_pct)
        upper = _parse_float(rule.upper_pct)
        if lower is None or upper is None:
            continue
        point_percentage = _parse_float(rule.point_multiplier) or 1.0
        ranges.append((lower, upper, point_percentage))
    ranges.sort(key=lambda item: (item[0], item[1]))
    return ranges


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


def _extract_position_points(items: list[dict]) -> tuple[dict[int, float], float]:
    points: dict[int, float] = {}
    fastest_lap_points = 0.0
    for item in items:
        if not isinstance(item, dict):
            continue
        position_raw = item.get("position")
        if isinstance(position_raw, str) and position_raw.lower() in (
            "fastest_lap",
            "fastest-lap",
            "fl",
        ):
            try:
                fastest_lap_points = float(item.get("point"))
            except (TypeError, ValueError):
                fastest_lap_points = 0.0
            continue
        try:
            position = int(position_raw)
        except (TypeError, ValueError):
            continue
        point_value = item.get("point")
        try:
            points[position] = float(point_value)
        except (TypeError, ValueError):
            points[position] = 0.0
    return points, fastest_lap_points


def load_point_system_from_definition(
    definition: PointSystemDefinition,
    rules: list[PointSystemDistanceRule],
) -> tuple[
    dict[int, float], str, int | None, float, list[tuple[float, float, float]]
]:
    items = definition.position_points
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="Invalid point system definition.")
    points, fastest_lap_points = _extract_position_points(items)
    race_count = definition.race_count_mode or "all"
    race_count_limit = definition.race_count
    race_percentage_ranges = _parse_race_percentage_rule_ranges(rules)
    return (
        points,
        race_count.lower(),
        race_count_limit,
        fastest_lap_points,
        race_percentage_ranges,
    )


def _resolve_last_event_id(events: list[Event]) -> int | None:
    if not events:
        return None
    has_round = any(event.round is not None for event in events)
    if has_round:
        return max(
            events,
            key=lambda event: (
                event.round if event.round is not None else -1,
                event.event_date,
                event.id or -1,
            ),
        ).id
    return max(events, key=lambda event: (event.event_date, event.id or -1)).id


def _normalize_session_type(value: str | None) -> str:
    if not value:
        return ""
    return value.strip().lower()


def _compute_race_multiplier(
    event: Event | None,
    ranges: list[tuple[float, float, float]],
) -> float:
    if not event or not ranges:
        return 1.0
    distance = _parse_float(event.distance)
    scheduled_distance = _parse_float(event.scheduled_distance)
    if not distance or not scheduled_distance or scheduled_distance <= 0:
        return 1.0
    percentage = distance / scheduled_distance
    for lower, upper, point_percentage in ranges:
        if lower <= percentage < upper:
            return point_percentage
    return 1.0


def _parse_position_int(value: str | int | None) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    text = str(value).strip()
    if not text or not text.isdigit():
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _resolve_previous_event(current_event: Event, events: list[Event]) -> Event | None:
    candidates = []
    for event in events:
        if event.id is None or current_event.id is None or event.id == current_event.id:
            continue
        if (
            current_event.round is not None
            and event.round is not None
            and event.round < current_event.round
        ):
            candidates.append(event)
            continue
        if event.event_date and current_event.event_date and event.event_date < current_event.event_date:
            candidates.append(event)
            continue
    if not candidates:
        return None
    return max(
        candidates,
        key=lambda item: (
            item.round if item.round is not None else -1,
            item.event_date,
            item.id or -1,
        ),
    )




def _resolve_driver_standings(
    standings: list[DriverStanding],
    session: Session,
) -> list[DriverStandingResolved]:
    driver_ids = {standing.driver_id for standing in standings if standing.driver_id}
    constructor_ids = {
        standing.constructor_id for standing in standings if standing.constructor_id
    }
    drivers = (
        session.exec(select(Driver).where(Driver.id.in_(driver_ids))).all()
        if driver_ids
        else []
    )
    constructors = (
        session.exec(
            select(Constructor).where(Constructor.id.in_(constructor_ids))
        ).all()
        if constructor_ids
        else []
    )
    driver_map = {driver.id: driver for driver in drivers}
    constructor_map = {constructor.id: constructor for constructor in constructors}
    return [
        DriverStandingResolved(
            **model_dump(standing),
            driver=driver_map.get(standing.driver_id),
            constructor=constructor_map.get(standing.constructor_id),
        )
        for standing in standings
    ]


@admin_router.post("", response_model=DriverStandingRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=DriverStandingRead, status_code=status.HTTP_201_CREATED)
def create_driver_standing(
    payload: DriverStandingCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> DriverStandingRead:
    standing_type = (payload.standing_type or STANDING_TYPE_DRIVER).upper()
    if standing_type == "CONSTRUCTOR" and not payload.constructor_id:
        raise HTTPException(status_code=400, detail="constructor_id is required")
    if standing_type == STANDING_TYPE_DRIVER and not payload.driver_id:
        raise HTTPException(status_code=400, detail="driver_id is required")
    payload_data = model_dump(payload)
    if payload_data.get("position") is not None:
        payload_data["position"] = str(payload_data["position"])
    driver_standing = DriverStanding(
        **payload_data,
        standing_type=standing_type,
    )
    session.add(driver_standing)
    session.commit()
    session.refresh(driver_standing)
    return driver_standing


@public_router.get("", response_model=list[DriverStandingResolved])
def list_driver_standings_public(
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    offset: int = 0,
    limit: int = 25,
    session: Session = Depends(get_readonly_session),
) -> list[DriverStandingResolved]:
    return list_driver_standings(
        standing_type=standing_type,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("", response_model=list[DriverStandingResolved])
@router.get("", response_model=list[DriverStandingResolved])
def list_driver_standings(
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    offset: int = 0,
    limit: int = 25,
    session: Session = Depends(get_session),
) -> list[DriverStandingResolved]:
    standings = session.exec(
        select(DriverStanding)
        .where(
            DriverStanding.standing_type == standing_type.upper(),
        )
        .offset(offset)
        .limit(limit)
    ).all()
    return _resolve_driver_standings(standings, session)


@public_router.get("/{standing_id}", response_model=DriverStandingResolved)
def get_driver_standing_public(
    standing_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_readonly_session),
) -> DriverStandingResolved:
    return get_driver_standing(
        standing_id=standing_id,
        standing_type=standing_type,
        session=session,
    )


@admin_router.get("/{standing_id}", response_model=DriverStandingResolved)
@router.get("/{standing_id}", response_model=DriverStandingResolved)
def get_driver_standing(
    standing_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_session),
) -> DriverStandingResolved:
    standing = session.get(DriverStanding, standing_id)
    if not standing:
        raise HTTPException(status_code=404, detail="Driver standing not found")
    if standing.standing_type != standing_type.upper():
        raise HTTPException(status_code=404, detail="Driver standing not found")
    return _resolve_driver_standings([standing], session)[0]


@admin_router.patch("/{standing_id}", response_model=DriverStandingRead)
@router.patch("/{standing_id}", response_model=DriverStandingRead)
def update_driver_standing(
    standing_id: int,
    payload: DriverStandingUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> DriverStandingRead:
    standing = session.get(DriverStanding, standing_id)
    if not standing:
        raise HTTPException(status_code=404, detail="Driver standing not found")
    if payload.standing_type:
        standing_type = payload.standing_type.upper()
        if standing_type == "CONSTRUCTOR" and not payload.constructor_id:
            raise HTTPException(status_code=400, detail="constructor_id is required")
        if standing_type == STANDING_TYPE_DRIVER and not payload.driver_id:
            raise HTTPException(status_code=400, detail="driver_id is required")
        payload.standing_type = standing_type
    update_data = model_dump(payload, exclude_unset=True)
    if "position" in update_data and update_data["position"] is not None:
        update_data["position"] = str(update_data["position"])
    for key, value in update_data.items():
        setattr(standing, key, value)
    session.add(standing)
    session.commit()
    session.refresh(standing)
    return standing


@admin_router.delete(
    "/{standing_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{standing_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_driver_standing(
    standing_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    standing = session.get(DriverStanding, standing_id)
    if not standing:
        raise HTTPException(status_code=404, detail="Driver standing not found")
    session.delete(standing)
    session.commit()


@public_router.get("/by-event/{event_id}", response_model=list[DriverStandingResolved])
def list_driver_standings_by_event_public(
    event_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_readonly_session),
) -> list[DriverStandingResolved]:
    return list_driver_standings_by_event(
        event_id=event_id,
        standing_type=standing_type,
        session=session,
    )


@admin_router.get("/by-event/{event_id}", response_model=list[DriverStandingResolved])
@router.get("/by-event/{event_id}", response_model=list[DriverStandingResolved])
def list_driver_standings_by_event(
    event_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_session),
) -> list[DriverStandingResolved]:
    standings = session.exec(
        select(DriverStanding)
        .where(
            DriverStanding.event_id == event_id,
        )
        .where(DriverStanding.standing_type == standing_type.upper())
    ).all()
    return _resolve_driver_standings(standings, session)


@public_router.get("/count/by-event/{event_id}")
def count_driver_standings_by_event_public(
    event_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_readonly_session),
) -> dict:
    return count_driver_standings_by_event(
        event_id=event_id,
        standing_type=standing_type,
        session=session,
    )


@admin_router.get("/count/by-event/{event_id}")
@router.get("/count/by-event/{event_id}")
def count_driver_standings_by_event(
    event_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_session),
) -> dict:
    count = session.exec(
        select(func.count())
        .select_from(DriverStanding)
        .where(
            DriverStanding.event_id == event_id,
        )
        .where(DriverStanding.standing_type == standing_type.upper())
    ).first()
    return {"count": int(count or 0)}


@admin_router.post("/by-event/{event_id}/recalculate-from-race")
@router.post("/by-event/{event_id}/recalculate-from-race")
@admin_router.post("/by-event/{event_id}/recalculate-driver-from-race")
@router.post("/by-event/{event_id}/recalculate-driver-from-race")
def recalculate_driver_standings_from_previous_and_race(
    event_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    season = session.exec(
        select(Season).where(Season.short_name == event.season_short_name)
    ).first()
    season_id = season.id if season else None

    season_events = session.exec(
        select(Event).where(Event.season_short_name == event.season_short_name)
    ).all()
    previous_event = _resolve_previous_event(event, season_events)
    previous_event_id = previous_event.id if previous_event else None

    previous_standings = (
        session.exec(
            select(DriverStanding).where(
                DriverStanding.event_id == previous_event_id,
                DriverStanding.standing_type == STANDING_TYPE_DRIVER,
            )
        ).all()
        if previous_event_id is not None
        else []
    )
    previous_by_driver: dict[int, DriverStanding] = {}
    for standing in previous_standings:
        if standing.driver_id is None:
            continue
        existing = previous_by_driver.get(standing.driver_id)
        if not existing or (standing.id or -1) > (existing.id or -1):
            previous_by_driver[standing.driver_id] = standing

    scoring_types = ("race", "sr")
    race_rows = session.exec(
        select(SessionResult, EventEntry, Car)
        .join(EventEntry, SessionResult.entry_id == EventEntry.id)
        .join(Car, Car.id == EventEntry.car_id)
        .join(Session, Session.id == SessionResult.session_id)
        .where(Session.event_id == event_id)
        .where(func.lower(cast(Session.type, String)).in_(scoring_types))
    ).all()
    race_points_by_driver: dict[int, float] = {}
    race_constructor_by_driver: dict[int, int | None] = {}
    for result, entry, car in race_rows:
        if not entry.driver_id:
            continue
        if str(result.position or "").strip().upper() == "FL":
            continue
        race_points_by_driver[entry.driver_id] = (
            race_points_by_driver.get(entry.driver_id, 0.0) + float(result.points or 0.0)
        )
        if car and car.constructor_id is not None:
            race_constructor_by_driver[entry.driver_id] = car.constructor_id

    target_driver_ids = set(previous_by_driver.keys()) | set(race_points_by_driver.keys())
    if not target_driver_ids:
        raise HTTPException(
            status_code=422,
            detail="No previous standings or race result points found for this event.",
        )

    computed_rows = []
    for driver_id in target_driver_ids:
        previous = previous_by_driver.get(driver_id)
        previous_points = float(previous.points) if previous else 0.0
        race_points = race_points_by_driver.get(driver_id, 0.0)
        total_points = previous_points + race_points
        previous_position = _parse_position_int(previous.position if previous else None) or 999
        constructor_id = race_constructor_by_driver.get(
            driver_id,
            previous.constructor_id if previous else None,
        )
        computed_rows.append(
            {
                "driver_id": driver_id,
                "constructor_id": constructor_id,
                "points": total_points,
                "previous_position": previous_position,
            }
        )

    computed_rows.sort(
        key=lambda item: (
            -item["points"],
            item["previous_position"],
            item["driver_id"],
        )
    )

    current_rows = session.exec(
        select(DriverStanding).where(
            DriverStanding.event_id == event_id,
            DriverStanding.standing_type == STANDING_TYPE_DRIVER,
        )
    ).all()
    current_by_driver = {
        row.driver_id: row for row in current_rows if row.driver_id is not None
    }

    created = 0
    updated = 0
    for index, row in enumerate(computed_rows, start=1):
        existing = current_by_driver.get(row["driver_id"])
        payload = {
            "season_id": season_id,
            "standing_type": STANDING_TYPE_DRIVER,
            "driver_id": row["driver_id"],
            "constructor_id": row["constructor_id"],
            "position": str(index),
            "points": row["points"],
        }
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            session.add(existing)
            updated += 1
        else:
            session.add(DriverStanding(event_id=event_id, **payload))
            created += 1

    session.commit()

    return {
        "event_id": event_id,
        "previous_event_id": previous_event_id,
        "updated_count": updated,
        "created_count": created,
        "total_count": len(computed_rows),
    }


@admin_router.post("/by-event/{event_id}/recalculate-constructor-from-race")
@router.post("/by-event/{event_id}/recalculate-constructor-from-race")
def recalculate_constructor_standings_from_previous_and_race(
    event_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    season = session.exec(
        select(Season).where(Season.short_name == event.season_short_name)
    ).first()
    season_id = season.id if season else None

    season_events = session.exec(
        select(Event).where(Event.season_short_name == event.season_short_name)
    ).all()
    previous_event = _resolve_previous_event(event, season_events)
    previous_event_id = previous_event.id if previous_event else None

    previous_standings = (
        session.exec(
            select(DriverStanding).where(
                DriverStanding.event_id == previous_event_id,
                DriverStanding.standing_type == STANDING_TYPE_CONSTRUCTOR,
            )
        ).all()
        if previous_event_id is not None
        else []
    )
    previous_by_constructor: dict[int, DriverStanding] = {}
    for standing in previous_standings:
        if standing.constructor_id is None:
            continue
        existing = previous_by_constructor.get(standing.constructor_id)
        if not existing or (standing.id or -1) > (existing.id or -1):
            previous_by_constructor[standing.constructor_id] = standing

    scoring_types = ("race", "sr")
    race_rows = session.exec(
        select(SessionResult, EventEntry, Car)
        .join(EventEntry, SessionResult.entry_id == EventEntry.id)
        .join(Car, Car.id == EventEntry.car_id)
        .join(Session, Session.id == SessionResult.session_id)
        .where(Session.event_id == event_id)
        .where(func.lower(cast(Session.type, String)).in_(scoring_types))
    ).all()
    race_points_by_constructor: dict[int, float] = {}
    for result, _entry, car in race_rows:
        if car.constructor_id is None:
            continue
        if str(result.position or "").strip().upper() == "FL":
            continue
        race_points_by_constructor[car.constructor_id] = (
            race_points_by_constructor.get(car.constructor_id, 0.0)
            + float(result.points or 0.0)
        )

    target_constructor_ids = set(previous_by_constructor.keys()) | set(
        race_points_by_constructor.keys()
    )
    if not target_constructor_ids:
        raise HTTPException(
            status_code=422,
            detail="No previous standings or race result points found for this event.",
        )

    computed_rows = []
    for constructor_id in target_constructor_ids:
        previous = previous_by_constructor.get(constructor_id)
        previous_points = float(previous.points) if previous else 0.0
        race_points = race_points_by_constructor.get(constructor_id, 0.0)
        total_points = previous_points + race_points
        previous_position = _parse_position_int(previous.position if previous else None) or 999
        computed_rows.append(
            {
                "constructor_id": constructor_id,
                "points": total_points,
                "previous_position": previous_position,
            }
        )

    computed_rows.sort(
        key=lambda item: (
            -item["points"],
            item["previous_position"],
            item["constructor_id"],
        )
    )

    current_rows = session.exec(
        select(DriverStanding).where(
            DriverStanding.event_id == event_id,
            DriverStanding.standing_type == STANDING_TYPE_CONSTRUCTOR,
        )
    ).all()
    current_by_constructor = {
        row.constructor_id: row for row in current_rows if row.constructor_id is not None
    }

    created = 0
    updated = 0
    for index, row in enumerate(computed_rows, start=1):
        existing = current_by_constructor.get(row["constructor_id"])
        payload = {
            "season_id": season_id,
            "standing_type": STANDING_TYPE_CONSTRUCTOR,
            "driver_id": None,
            "constructor_id": row["constructor_id"],
            "position": str(index),
            "points": row["points"],
        }
        if existing:
            for key, value in payload.items():
                setattr(existing, key, value)
            session.add(existing)
            updated += 1
        else:
            session.add(DriverStanding(event_id=event_id, **payload))
            created += 1

    session.commit()

    return {
        "event_id": event_id,
        "previous_event_id": previous_event_id,
        "updated_count": updated,
        "created_count": created,
        "total_count": len(computed_rows),
    }


@public_router.get("/by-season/{season_id}", response_model=list[DriverStandingResolved])
def list_driver_standings_by_season_public(
    season_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_readonly_session),
) -> list[DriverStandingResolved]:
    return list_driver_standings_by_season(
        season_id=season_id,
        standing_type=standing_type,
        session=session,
    )


@admin_router.get("/by-season/{season_id}", response_model=list[DriverStandingResolved])
@router.get("/by-season/{season_id}", response_model=list[DriverStandingResolved])
def list_driver_standings_by_season(
    season_id: int,
    standing_type: str = Query(default=STANDING_TYPE_DRIVER),
    session: Session = Depends(get_session),
) -> list[DriverStandingResolved]:
    st = standing_type.upper()
    # Prefer season-level standings (event_id IS NULL); if none exist,
    # fall back to the latest event's standings to avoid duplicates.
    season_level = session.exec(
        select(DriverStanding)
        .where(DriverStanding.season_id == season_id)
        .where(DriverStanding.standing_type == st)
        .where(DriverStanding.event_id.is_(None))
    ).all()
    if season_level:
        return _resolve_driver_standings(season_level, session)

    # No season-level rows: find the latest event_id and return only those
    latest_event_id = session.exec(
        select(DriverStanding.event_id)
        .where(DriverStanding.season_id == season_id)
        .where(DriverStanding.standing_type == st)
        .where(DriverStanding.event_id.isnot(None))
        .join(Event, Event.id == DriverStanding.event_id)
        .order_by(Event.event_date.desc(), Event.id.desc())
        .limit(1)
    ).first()
    if latest_event_id is None:
        return []
    standings = session.exec(
        select(DriverStanding)
        .where(DriverStanding.season_id == season_id)
        .where(DriverStanding.standing_type == st)
        .where(DriverStanding.event_id == latest_event_id)
    ).all()
    return _resolve_driver_standings(standings, session)


@public_router.get(
    "/calculated/by-season/{season_id}",
    response_model=list[DriverStandingCalculated],
)
def list_calculated_driver_standings_by_season_public(
    season_id: int,
    point_scoring_system: str = Query(default="standard"),
    session: Session = Depends(get_readonly_session),
) -> list[DriverStandingCalculated]:
    return list_calculated_driver_standings_by_season(
        season_id=season_id,
        point_scoring_system=point_scoring_system,
        session=session,
    )


@admin_router.get(
    "/calculated/by-season/{season_id}",
    response_model=list[DriverStandingCalculated],
)
@router.get(
    "/calculated/by-season/{season_id}",
    response_model=list[DriverStandingCalculated],
)
def list_calculated_driver_standings_by_season(
    season_id: int,
    point_scoring_system: str = Query(default="standard"),
    session: Session = Depends(get_session),
) -> list[DriverStandingCalculated]:
    system_key = point_scoring_system.lower()

    season = session.get(Season, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    point_stmt = (
        select(SeasonPointSystem, PointSystemDefinition)
        .join(
            PointSystemDefinition,
            PointSystemDefinition.id == SeasonPointSystem.point_system_definition_id,
        )
        .where(SeasonPointSystem.season_id == season_id)
        .where(PointSystemDefinition.start_year <= season.year)
        .where(PointSystemDefinition.end_year >= season.year)
    )
    if system_key != "standard":
        point_stmt = point_stmt.where(
            PointSystemDefinition.source_file_name == point_scoring_system
        )
    point_system_rows = session.exec(point_stmt).all()
    if not point_system_rows:
        raise HTTPException(status_code=404, detail="Point system not configured.")
    unique_point_system_rows: dict[
        tuple[int, str, int | None], tuple[SeasonPointSystem, PointSystemDefinition]
    ] = {}
    for point_system, definition in point_system_rows:
        row_key = (
            point_system.championship_id,
            _normalize_session_type(point_system.session_type),
            definition.id,
        )
        existing = unique_point_system_rows.get(row_key)
        if not existing:
            unique_point_system_rows[row_key] = (point_system, definition)
            continue
        existing_point_system, _ = existing
        current_id = point_system.id or -1
        existing_id = existing_point_system.id or -1
        if current_id > existing_id:
            unique_point_system_rows[row_key] = (point_system, definition)
    point_system_rows = list(unique_point_system_rows.values())

    definition_ids = {
        definition.id
        for _, definition in point_system_rows
        if definition.id is not None
    }
    distance_rule_rows = (
        session.exec(
            select(PointSystemDistanceRule).where(
                PointSystemDistanceRule.point_system_definition_id.in_(definition_ids)
            )
        ).all()
        if definition_ids
        else []
    )
    distance_rules_by_definition: dict[int, list[PointSystemDistanceRule]] = {}
    for row in distance_rule_rows:
        distance_rules_by_definition.setdefault(row.point_system_definition_id, []).append(
            row
        )

    events = session.exec(
        select(Event).where(Event.season_short_name == season.short_name)
    ).all()
    if not events:
        return []

    event_ids = [event.id for event in events if event.id is not None]
    if not event_ids:
        return []
    event_map = {event.id: event for event in events if event.id is not None}
    event_championship_rows = session.exec(
        select(EventChampionship.event_id, EventChampionship.championship_id).where(
            EventChampionship.event_id.in_(event_ids)
        )
    ).all()
    championship_event_ids: dict[int, set[int]] = {}
    for event_id, championship_id in event_championship_rows:
        championship_event_ids.setdefault(championship_id, set()).add(event_id)

    session_rows = session.exec(
        select(Session.id, Session.event_id, cast(Session.type, String)).where(
            Session.event_id.in_(event_ids)
        )
    ).all()
    if not session_rows:
        return []

    session_event_map = {}
    sessions_by_type: dict[str, list[int]] = {}
    for session_id, event_id, session_type in session_rows:
        session_event_map[session_id] = event_id
        normalized_type = _normalize_session_type(session_type)
        sessions_by_type.setdefault(normalized_type, []).append(session_id)

    totals: dict[int, float] = {}

    for point_system, definition in point_system_rows:
        session_type = _normalize_session_type(point_system.session_type)
        if not session_type:
            continue
        eligible_event_ids = championship_event_ids.get(point_system.championship_id, set())
        if not eligible_event_ids:
            continue
        session_ids = [
            session_id
            for session_id in sessions_by_type.get(session_type, [])
            if session_event_map.get(session_id) in eligible_event_ids
        ]
        if not session_ids:
            continue
        scoped_events = [
            event_map[event_id] for event_id in eligible_event_ids if event_id in event_map
        ]
        (
            system,
            race_count,
            race_count_limit,
            fastest_lap_points,
            race_percentage_ranges,
        ) = load_point_system_from_definition(
            definition,
            distance_rules_by_definition.get(definition.id, []),
        )
        last_event_id = (
            _resolve_last_event_id(scoped_events)
            if race_count == "all_plus_last_race_double"
            else None
        )
        result_rows = session.exec(
            select(SessionResult, EventEntry)
            .join(EventEntry, SessionResult.entry_id == EventEntry.id)
            .where(SessionResult.session_id.in_(session_ids))
            .order_by(SessionResult.id)
        ).all()

        finish_positions: dict[int, dict[int, int]] = {}
        finishers_by_session: dict[int, list[tuple[int, int, int]]] = {}
        fastest_laps_by_session: dict[int, list[tuple[int, int, float | None]]] = {}
        driver_session_points: dict[int, dict[int, float]] = {}
        for result, entry in result_rows:
            if not entry.driver_id:
                continue
            if result.position == "FL":
                fastest_laps_by_session.setdefault(result.session_id, []).append(
                    (
                        entry.id,
                        entry.driver_id,
                        _parse_time_to_seconds(result.time),
                    )
                )
                continue
            try:
                position = (
                    int(result.position) if result.position is not None else None
                )
            except (TypeError, ValueError):
                position = None
            if not position:
                continue
            finish_positions.setdefault(result.session_id, {})[entry.id] = position
            finishers_by_session.setdefault(result.session_id, []).append(
                (entry.id, entry.driver_id, position)
            )
        for session_id, finishers in finishers_by_session.items():
            event_id = session_event_map.get(session_id)
            event = event_map.get(event_id) if event_id else None
            race_multiplier = (
                _compute_race_multiplier(event, race_percentage_ranges)
                if session_type == "race"
                else 1.0
            )
            double_multiplier = (
                2.0 if event_id == last_event_id else 1.0
            )
            position_counts: dict[int, int] = {}
            for _, _, position in finishers:
                position_counts[position] = position_counts.get(position, 0) + 1
            for _, driver_id, position in finishers:
                base_points = system.get(position, 0)
                if not base_points:
                    continue
                tie_count = position_counts.get(position, 1)
                points = (
                    (base_points / tie_count)
                    * double_multiplier
                    * race_multiplier
                )
                session_points = driver_session_points.setdefault(driver_id, {})
                session_points[session_id] = (
                    session_points.get(session_id, 0.0) + points
                )

        if fastest_lap_points:
            fastest_lap_requires_top10 = race_count != "best_of"
            for session_id, fastest_laps in fastest_laps_by_session.items():
                if not fastest_laps:
                    continue
                parsed_fastest_laps = [
                    row for row in fastest_laps if row[2] is not None
                ]
                winners: list[tuple[int, int]] = []
                if parsed_fastest_laps:
                    min_fastest_time = min(row[2] for row in parsed_fastest_laps)
                    winners = [
                        (entry_id, driver_id)
                        for entry_id, driver_id, lap_time in parsed_fastest_laps
                        if lap_time is not None and abs(lap_time - min_fastest_time) < 1e-9
                    ]
                else:
                    entry_id, driver_id, _ = fastest_laps[0]
                    winners = [(entry_id, driver_id)]
                if not winners:
                    continue
                event_id = session_event_map.get(session_id)
                event = event_map.get(event_id) if event_id else None
                race_multiplier = (
                    _compute_race_multiplier(event, race_percentage_ranges)
                    if session_type == "race"
                    else 1.0
                )
                multiplier = (
                    2.0
                    if event_id == last_event_id
                    else 1.0
                )
                eligible_winners: list[tuple[int, int]] = []
                for entry_id, driver_id in winners:
                    finish_position = finish_positions.get(session_id, {}).get(entry_id)
                    if fastest_lap_requires_top10 and (
                        not finish_position or finish_position > 10
                    ):
                        continue
                    eligible_winners.append((entry_id, driver_id))
                if not eligible_winners:
                    continue
                winner_points = fastest_lap_points / len(eligible_winners)
                if not winner_points:
                    continue
                for _, driver_id in eligible_winners:
                    session_points = driver_session_points.setdefault(driver_id, {})
                    session_points[session_id] = session_points.get(session_id, 0.0) + (
                        winner_points * multiplier * race_multiplier
                    )

        if race_count == "best_of" and race_count_limit and race_count_limit > 0:
            for driver_id, session_points in driver_session_points.items():
                top_scores = sorted(session_points.values(), reverse=True)
                selected_total = sum(top_scores[:race_count_limit])
                if selected_total:
                    totals[driver_id] = totals.get(driver_id, 0) + selected_total
        else:
            for driver_id, session_points in driver_session_points.items():
                subtotal = sum(session_points.values())
                if subtotal:
                    totals[driver_id] = totals.get(driver_id, 0) + subtotal

    if not totals:
        return []

    driver_ids = list(totals.keys())
    drivers = session.exec(select(Driver).where(Driver.id.in_(driver_ids))).all()
    driver_map = {driver.id: driver for driver in drivers}

    standings = sorted(
        totals.items(), key=lambda item: (-item[1], item[0])
    )
    calculated = []
    for index, (driver_id, points) in enumerate(standings, start=1):
        calculated.append(
            DriverStandingCalculated(
                season_id=season_id,
                standing_type=STANDING_TYPE_DRIVER,
                position=str(index),
                points=points,
                driver=driver_map.get(driver_id),
            )
        )
    return calculated
