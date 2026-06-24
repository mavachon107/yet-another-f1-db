from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.car import Car, CarResolved
from app.models.constructor import Constructor
from app.models.driver import Driver
from app.models.engine import Engine, EngineResolved
from app.models.entry import (
    EventEntry,
    EventEntryCreate,
    EventEntryRead,
    EventEntryResolved,
    EventEntryResolvedWithEvent,
    EventEntryUpdate,
)
from app.models.event import Event
from app.models.team import Team
from app.models.tire import Tire
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/event-entries", tags=["event-entries"])
public_router = APIRouter(prefix="/v1/event-entries", tags=["event-entries"])
admin_router = APIRouter(
    prefix="/api/admin/event-entries",
    tags=["event-entries"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)




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


@admin_router.post("", response_model=EventEntryRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=EventEntryRead, status_code=status.HTTP_201_CREATED)
def create_entry(
    entry_in: EventEntryCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> EventEntryRead:
    entry = EventEntry(**model_dump(entry_in))
    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@public_router.get("", response_model=list[EventEntryRead])
def list_entries_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[EventEntryRead]:
    return list_entries(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[EventEntryRead])
@router.get("", response_model=list[EventEntryRead])
def list_entries(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[EventEntryRead]:
    statement = (
        select(EventEntry)
        
        .offset(offset)
        .limit(limit)
    )
    entries = session.exec(statement).all()
    return entries


@public_router.get("/{entry_id}", response_model=EventEntryRead)
def get_entry_public(
    entry_id: int,
    session: Session = Depends(get_readonly_session),
) -> EventEntryRead:
    return get_entry(entry_id=entry_id, session=session)


@admin_router.get("/{entry_id}", response_model=EventEntryRead)
@router.get("/{entry_id}", response_model=EventEntryRead)
def get_entry(
    entry_id: int,
    session: Session = Depends(get_session),
) -> EventEntryRead:
    entry = session.get(EventEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


@public_router.get("/by-event/{event_id}", response_model=list[EventEntryResolved])
def list_entries_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[EventEntryResolved]:
    return list_entries_by_event(event_id=event_id, session=session)


@admin_router.get("/by-event/{event_id}", response_model=list[EventEntryResolved])
@router.get("/by-event/{event_id}", response_model=list[EventEntryResolved])
def list_entries_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> list[EventEntryResolved]:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    statement = (
        select(EventEntry)
        .where(EventEntry.event_id == event_id)
        .join(Team, isouter=True)
        .order_by(Team.team_name.asc(), Team.short_name.asc())
    )
    entries = session.exec(statement).all()

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

    return [
        EventEntryResolved(
            id=entry.id,
            car_number=entry.car_number,
            driver=driver_map.get(entry.driver_id),
            team=team_map.get(entry.team_id),
            car=car_map.get(entry.car_id),
            tire=tire_map.get(entry.tire_id),
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )
        for entry in entries
    ]


@public_router.get("/by-car/{car_id}", response_model=list[EventEntryResolvedWithEvent])
def list_entries_by_car_public(
    car_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[EventEntryResolvedWithEvent]:
    return list_entries_by_car(car_id=car_id, session=session)


@admin_router.get("/by-car/{car_id}", response_model=list[EventEntryResolvedWithEvent])
@router.get("/by-car/{car_id}", response_model=list[EventEntryResolvedWithEvent])
def list_entries_by_car(
    car_id: int,
    session: Session = Depends(get_session),
) -> list[EventEntryResolvedWithEvent]:
    car = session.get(Car, car_id)
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")

    statement = (
        select(EventEntry)
        .where(EventEntry.car_id == car_id)
        .join(Event, EventEntry.event_id == Event.id)
        .where(~Event.event_name.ilike("%Pre-Season Testing%"))
        .order_by(Event.event_date.asc(), Event.round.asc())
    )
    entries = session.exec(statement).all()

    driver_ids = {entry.driver_id for entry in entries if entry.driver_id}
    team_ids = {entry.team_id for entry in entries if entry.team_id}
    car_ids = {entry.car_id for entry in entries if entry.car_id}
    tire_ids = {entry.tire_id for entry in entries if entry.tire_id}
    event_ids = {entry.event_id for entry in entries if entry.event_id}

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
    events = (
        session.exec(select(Event).where(Event.id.in_(event_ids))).all()
        if event_ids
        else []
    )

    driver_map = {driver.id: driver for driver in drivers}
    team_map = {team.id: team for team in teams}
    car_map = _resolve_cars(cars, session)
    tire_map = {tire.id: tire for tire in tires}
    event_map = {event.id: event for event in events}

    return [
        EventEntryResolvedWithEvent(
            id=entry.id,
            car_number=entry.car_number,
            driver=driver_map.get(entry.driver_id),
            team=team_map.get(entry.team_id),
            car=car_map.get(entry.car_id),
            tire=tire_map.get(entry.tire_id),
            event=event_map.get(entry.event_id),
            created_at=entry.created_at,
            updated_at=entry.updated_at,
        )
        for entry in entries
    ]


@public_router.get("/count/by-event/{event_id}")
def count_entries_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> dict:
    return count_entries_by_event(event_id=event_id, session=session)


@admin_router.get("/count/by-event/{event_id}")
@router.get("/count/by-event/{event_id}")
def count_entries_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> dict:
    count = session.exec(
        select(func.count())
        .select_from(EventEntry)
        .where(EventEntry.event_id == event_id)
    ).first()
    return {"count": int(count or 0)}


@admin_router.post(
    "/by-event/{event_id}/copy-from-previous",
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.post("/by-event/{event_id}/copy-from-previous")
def copy_entries_from_previous_event(
    event_id: int,
    source_event_id: int | None = None,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> dict:
    current_event = session.get(Event, event_id)
    if not current_event:
        raise HTTPException(status_code=404, detail="Event not found")

    if source_event_id is not None:
        # Explicit source chosen by the user (e.g. when the immediately
        # preceding event was cancelled and has no entries to copy).
        if source_event_id == event_id:
            raise HTTPException(
                status_code=400,
                detail="Source event must be different from the current event.",
            )
        previous_event = session.get(Event, source_event_id)
        if not previous_event:
            raise HTTPException(status_code=404, detail="Source event not found")
    else:
        season_events = session.exec(
            select(Event).where(
                Event.season_short_name == current_event.season_short_name
            )
        ).all()
        if not season_events:
            raise HTTPException(
                status_code=404, detail="No events found for this season"
            )

        current_key = (
            current_event.event_date,
            current_event.round if current_event.round is not None else 9999,
            current_event.id,
        )
        previous_candidates = [
            event
            for event in season_events
            if (
                event.id != current_event.id
                and (
                    event.event_date,
                    event.round if event.round is not None else 9999,
                    event.id,
                )
                < current_key
            )
        ]
        if not previous_candidates:
            raise HTTPException(
                status_code=404,
                detail="No previous event found in the same season.",
            )

        previous_event = max(
            previous_candidates,
            key=lambda event: (
                event.event_date,
                event.round if event.round is not None else 9999,
                event.id,
            ),
        )
    previous_entries = session.exec(
        select(EventEntry).where(EventEntry.event_id == previous_event.id)
    ).all()
    if not previous_entries:
        return {
            "event_id": event_id,
            "previous_event_id": previous_event.id,
            "copied_count": 0,
            "skipped_count": 0,
            "copied_entry_ids": [],
            "skipped_driver_ids": [],
            "message": "Previous event has no entries to copy.",
        }

    current_entries = session.exec(
        select(EventEntry).where(EventEntry.event_id == event_id)
    ).all()
    current_driver_ids = {entry.driver_id for entry in current_entries if entry.driver_id}

    copied_entry_ids: list[int] = []
    skipped_driver_ids: list[int] = []
    for previous_entry in previous_entries:
        if previous_entry.driver_id in current_driver_ids:
            skipped_driver_ids.append(previous_entry.driver_id)
            continue
        copied = EventEntry(
            event_id=event_id,
            car_id=previous_entry.car_id,
            driver_id=previous_entry.driver_id,
            team_id=previous_entry.team_id,
            tire_id=previous_entry.tire_id,
            car_number=previous_entry.car_number,
        )
        session.add(copied)
        session.flush()
        copied_entry_ids.append(copied.id)
        current_driver_ids.add(previous_entry.driver_id)

    session.commit()

    return {
        "event_id": event_id,
        "previous_event_id": previous_event.id,
        "copied_count": len(copied_entry_ids),
        "skipped_count": len(skipped_driver_ids),
        "copied_entry_ids": copied_entry_ids,
        "skipped_driver_ids": skipped_driver_ids,
    }


@admin_router.patch("/{entry_id}", response_model=EventEntryRead)
@router.patch("/{entry_id}", response_model=EventEntryRead)
def update_entry(
    entry_id: int,
    entry_in: EventEntryUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> EventEntryRead:
    entry = session.get(EventEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    update_data = model_dump(entry_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(entry, key, value)

    session.add(entry)
    session.commit()
    session.refresh(entry)
    return entry


@admin_router.delete(
    "/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    entry = session.get(EventEntry, entry_id)
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    session.delete(entry)
    session.commit()
    return None
