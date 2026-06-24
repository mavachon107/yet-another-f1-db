from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlmodel import Session, SQLModel, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.car import Car, CarRead
from app.models.driver import Driver, DriverRead
from app.models.driver_of_the_day import (
    DriverOfTheDay,
    DriverOfTheDayCreate,
    DriverOfTheDayRead,
    DriverOfTheDayResolved,
    DriverOfTheDayUpdate,
)
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.team import Team, TeamRead
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/driver-of-the-day", tags=["driver-of-the-day"])
public_router = APIRouter(prefix="/v1/driver-of-the-day", tags=["driver-of-the-day"])
admin_router = APIRouter(
    prefix="/api/admin/driver-of-the-day",
    tags=["driver-of-the-day"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


class BulkDriverOfTheDayEntry(SQLModel):
    entry_id: int
    position: int
    percentage: float | None = None


class BulkDriverOfTheDayRequest(SQLModel):
    event_id: int
    entries: list[BulkDriverOfTheDayEntry]


def _resolve_dotd_entries(
    rows: list[DriverOfTheDay], session: Session
) -> list[DriverOfTheDayResolved]:
    entry_ids = {r.entry_id for r in rows if r.entry_id}
    if not entry_ids:
        return [
            DriverOfTheDayResolved(**model_dump(r))
            for r in rows
        ]
    entries = session.exec(
        select(EventEntry).where(EventEntry.id.in_(entry_ids))
    ).all()
    entry_map = {e.id: e for e in entries}

    driver_ids = {e.driver_id for e in entries if e.driver_id}
    team_ids = {e.team_id for e in entries if e.team_id}
    car_ids = {e.car_id for e in entries if e.car_id}

    drivers = (
        session.exec(select(Driver).where(Driver.id.in_(driver_ids))).all()
        if driver_ids else []
    )
    teams = (
        session.exec(select(Team).where(Team.id.in_(team_ids))).all()
        if team_ids else []
    )
    cars = (
        session.exec(select(Car).where(Car.id.in_(car_ids))).all()
        if car_ids else []
    )
    driver_map = {d.id: d for d in drivers}
    team_map = {t.id: t for t in teams}
    car_map = {c.id: c for c in cars}

    resolved = []
    for r in rows:
        entry = entry_map.get(r.entry_id)
        resolved.append(
            DriverOfTheDayResolved(
                id=r.id,
                event_id=r.event_id,
                entry_id=r.entry_id,
                position=r.position,
                percentage=r.percentage,
                driver=driver_map.get(entry.driver_id) if entry else None,
                team=team_map.get(entry.team_id) if entry else None,
                car=car_map.get(entry.car_id) if entry else None,
            )
        )
    return resolved


@public_router.get("/by-event/{event_id}", response_model=list[DriverOfTheDayResolved])
def list_dotd_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[DriverOfTheDayResolved]:
    return list_dotd_by_event(event_id=event_id, session=session)


@admin_router.get("/by-event/{event_id}", response_model=list[DriverOfTheDayResolved])
@router.get("/by-event/{event_id}", response_model=list[DriverOfTheDayResolved])
def list_dotd_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> list[DriverOfTheDayResolved]:
    rows = session.exec(
        select(DriverOfTheDay)
        .where(DriverOfTheDay.event_id == event_id)
        .order_by(DriverOfTheDay.position.asc())
    ).all()
    return _resolve_dotd_entries(rows, session)


@public_router.get("/count/by-event/{event_id}")
def count_dotd_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> dict:
    return count_dotd_by_event(event_id=event_id, session=session)


@admin_router.get("/count/by-event/{event_id}")
@router.get("/count/by-event/{event_id}")
def count_dotd_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> dict:
    count = session.exec(
        select(func.count())
        .select_from(DriverOfTheDay)
        .where(DriverOfTheDay.event_id == event_id)
    ).first()
    return {"count": int(count or 0)}


def _resolve_events_up_to(current: Event, all_events: list[Event]) -> set[int]:
    """Return event IDs in the same season up to and including `current`."""
    ids: set[int] = set()
    for e in all_events:
        if e.id is None:
            continue
        if e.id == current.id:
            ids.add(e.id)
            continue
        if current.round is not None and e.round is not None:
            if e.round <= current.round:
                ids.add(e.id)
        elif e.event_date and current.event_date and e.event_date <= current.event_date:
            ids.add(e.id)
    return ids


@public_router.get("/standings/by-event/{event_id}")
def dotd_standings_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[dict]:
    return dotd_standings_by_event(event_id=event_id, session=session)


@admin_router.get("/standings/by-event/{event_id}")
@router.get("/standings/by-event/{event_id}")
def dotd_standings_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> list[dict]:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    season_events = session.exec(
        select(Event).where(Event.season_short_name == event.season_short_name)
    ).all()
    eligible_event_ids = _resolve_events_up_to(event, season_events)
    if not eligible_event_ids:
        return []

    dotd_rows = session.exec(
        select(DriverOfTheDay)
        .where(DriverOfTheDay.event_id.in_(eligible_event_ids))
    ).all()
    if not dotd_rows:
        return []

    entry_ids = {r.entry_id for r in dotd_rows if r.entry_id}
    entries = (
        session.exec(select(EventEntry).where(EventEntry.id.in_(entry_ids))).all()
        if entry_ids
        else []
    )
    entry_map = {e.id: e for e in entries}

    wins_by_driver: dict[int, int] = {}
    percentage_sum_by_driver: dict[int, float] = {}
    for row in dotd_rows:
        entry = entry_map.get(row.entry_id)
        if not entry or not entry.driver_id:
            continue
        if row.position == 1:
            wins_by_driver[entry.driver_id] = (
                wins_by_driver.get(entry.driver_id, 0) + 1
            )
        if row.percentage is not None:
            percentage_sum_by_driver[entry.driver_id] = (
                percentage_sum_by_driver.get(entry.driver_id, 0.0) + row.percentage
            )

    driver_ids = list(
        set(wins_by_driver) | set(percentage_sum_by_driver)
    )
    if not driver_ids:
        return []
    drivers = session.exec(select(Driver).where(Driver.id.in_(driver_ids))).all()
    driver_map = {d.id: d for d in drivers}

    total_events = event.round if event.round is not None else len(eligible_event_ids)

    sorted_standings = sorted(
        driver_ids,
        key=lambda driver_id: (
            -wins_by_driver.get(driver_id, 0),
            -percentage_sum_by_driver.get(driver_id, 0.0),
            driver_id,
        ),
    )

    result = []
    for pos, driver_id in enumerate(sorted_standings, 1):
        driver = driver_map.get(driver_id)
        wins = wins_by_driver.get(driver_id, 0)
        average_percentage = (
            percentage_sum_by_driver.get(driver_id, 0.0) / total_events
            if total_events
            else None
        )
        result.append({
            "position": pos,
            "driver": driver,
            "wins": wins,
            "average_percentage": average_percentage,
        })
    return result


@admin_router.post("", response_model=DriverOfTheDayRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=DriverOfTheDayRead, status_code=status.HTTP_201_CREATED)
def create_dotd(
    payload: DriverOfTheDayCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> DriverOfTheDayRead:
    row = DriverOfTheDay(**model_dump(payload))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@admin_router.post("/bulk", response_model=list[DriverOfTheDayRead])
@router.post("/bulk", response_model=list[DriverOfTheDayRead])
def bulk_create_dotd(
    payload: BulkDriverOfTheDayRequest,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> list[DriverOfTheDayRead]:
    existing = session.exec(
        select(DriverOfTheDay).where(DriverOfTheDay.event_id == payload.event_id)
    ).all()
    for row in existing:
        session.delete(row)

    created = []
    for entry in payload.entries:
        row = DriverOfTheDay(
            event_id=payload.event_id,
            entry_id=entry.entry_id,
            position=entry.position,
            percentage=entry.percentage,
        )
        session.add(row)
        created.append(row)
    session.commit()
    for row in created:
        session.refresh(row)
    return created


@public_router.get("/{dotd_id}", response_model=DriverOfTheDayResolved)
def get_dotd_public(
    dotd_id: int,
    session: Session = Depends(get_readonly_session),
) -> DriverOfTheDayResolved:
    return get_dotd(dotd_id=dotd_id, session=session)


@admin_router.get("/{dotd_id}", response_model=DriverOfTheDayResolved)
@router.get("/{dotd_id}", response_model=DriverOfTheDayResolved)
def get_dotd(
    dotd_id: int,
    session: Session = Depends(get_session),
) -> DriverOfTheDayResolved:
    row = session.get(DriverOfTheDay, dotd_id)
    if not row:
        raise HTTPException(status_code=404, detail="Driver of the Day entry not found")
    return _resolve_dotd_entries([row], session)[0]


@admin_router.patch("/{dotd_id}", response_model=DriverOfTheDayRead)
@router.patch("/{dotd_id}", response_model=DriverOfTheDayRead)
def update_dotd(
    dotd_id: int,
    payload: DriverOfTheDayUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> DriverOfTheDayRead:
    row = session.get(DriverOfTheDay, dotd_id)
    if not row:
        raise HTTPException(status_code=404, detail="Driver of the Day entry not found")
    update_data = model_dump(payload, exclude_unset=True)
    for key, value in update_data.items():
        setattr(row, key, value)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@admin_router.delete(
    "/{dotd_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{dotd_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dotd(
    dotd_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    row = session.get(DriverOfTheDay, dotd_id)
    if not row:
        raise HTTPException(status_code=404, detail="Driver of the Day entry not found")
    session.delete(row)
    session.commit()
