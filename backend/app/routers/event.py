from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import SQLModel, Session, select

from app.core.auth import require_role
from app.core.slug import slugify_text
from app.database import get_readonly_session, get_session
from app.models.championship import Championship
from app.models.circuit import Circuit
from app.models.event import Event, EventCreate, EventRead, EventUpdate
from app.models.event_championship import EventChampionship
from app.models.entry import EventEntry
from app.models.regulatory_system import RegulatorySystem
from app.models.season import Season
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/events", tags=["events"])
public_router = APIRouter(prefix="/v1/events", tags=["events"])
admin_router = APIRouter(
    prefix="/api/admin/events",
    tags=["events"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)




class ChampionshipInfo(SQLModel):
    id: int
    short_name: str
    championship_name: str


class CircuitInfo(SQLModel):
    id: int
    slug: str
    short_name: str
    name: str
    city: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None


class RegulatorySystemInfo(SQLModel):
    id: int
    abbreviation: str
    name: str


class EventReadWithChampionships(SQLModel):
    id: int
    slug: Optional[str] = None
    season_id: Optional[int] = None
    season_year: Optional[int] = None
    season_short_name: str
    event_name: Optional[str] = None
    event_official_name: Optional[str] = None
    round: Optional[int] = None
    event_date: date
    laps: Optional[int] = None
    scheduled_laps: Optional[int] = None
    distance: Optional[str] = None
    scheduled_distance: Optional[str] = None
    championships: list[ChampionshipInfo] = []
    circuit: Optional[CircuitInfo] = None
    regulatory_system: Optional[RegulatorySystemInfo] = None


class EventChampionshipUpdatePayload(SQLModel):
    championship_ids: list[int]


def _enrich_events(
    events: list[Event],
    session: Session,
) -> list[EventReadWithChampionships]:
    if not events:
        return []

    event_ids = [event.id for event in events]
    circuit_ids = {event.circuit_id for event in events}
    regulatory_system_ids = {
        event.regulatory_system_id
        for event in events
        if event.regulatory_system_id is not None
    }

    championship_stmt = (
        select(EventChampionship.event_id, Championship)
        .join(Championship, Championship.id == EventChampionship.championship_id)
        .where(EventChampionship.event_id.in_(event_ids))
    )
    championship_rows = session.exec(championship_stmt).all()
    championship_map: dict[int, list[ChampionshipInfo]] = {}
    for event_id, champ in championship_rows:
        championship_map.setdefault(event_id, []).append(
            ChampionshipInfo(
                id=champ.id,
                short_name=champ.short_name,
                championship_name=champ.championship_name,
            )
        )

    circuit_stmt = select(Circuit).where(Circuit.id.in_(circuit_ids))
    circuit_rows = session.exec(circuit_stmt).all()
    circuit_map = {
        circuit.id: CircuitInfo(
            id=circuit.id,
            slug=circuit.slug,
            short_name=circuit.short_name,
            name=circuit.name,
            city=circuit.city,
            country=circuit.country,
            timezone=circuit.timezone,
        )
        for circuit in circuit_rows
    }

    reg_system_map: dict[int, RegulatorySystemInfo] = {}
    if regulatory_system_ids:
        reg_stmt = select(RegulatorySystem).where(
            RegulatorySystem.id.in_(regulatory_system_ids)
        )
        reg_rows = session.exec(reg_stmt).all()
        reg_system_map = {
            reg.id: RegulatorySystemInfo(
                id=reg.id,
                abbreviation=reg.abbreviation,
                name=reg.name,
            )
            for reg in reg_rows
        }

    response = []
    season_short_names = {event.season_short_name for event in events}
    seasons = (
        session.exec(
            select(Season).where(Season.short_name.in_(season_short_names))
        ).all()
        if season_short_names
        else []
    )
    season_map = {season.short_name: season for season in seasons}
    for event in events:
        payload = model_dump(event)
        payload.pop("circuit_id", None)
        payload.pop("regulatory_system_id", None)
        season = season_map.get(event.season_short_name)
        payload["season_id"] = season.id if season else None
        payload["season_year"] = season.year if season else None
        response.append(
            EventReadWithChampionships(
                **payload,
                circuit=circuit_map.get(event.circuit_id),
                championships=championship_map.get(event.id, []),
                regulatory_system=reg_system_map.get(event.regulatory_system_id),
            )
        )
    return response


def _event_slug_base(event: Event) -> str:
    """Base slug for an event from its name, falling back to round."""
    return (
        slugify_text(event.event_name)
        or slugify_text(event.event_official_name)
        or (f"round_{event.round}" if event.round else "")
        or "event"
    )


def _unique_event_slug(
    session: Session,
    season_short_name: str,
    base: str,
    exclude_id: int | None = None,
) -> str:
    """Return a slug unique within the given season."""
    candidate = base
    suffix = 2
    while True:
        stmt = select(Event.id).where(
            Event.season_short_name == season_short_name,
            Event.slug == candidate,
        )
        if exclude_id is not None:
            stmt = stmt.where(Event.id != exclude_id)
        if session.exec(stmt).first() is None:
            return candidate
        candidate = f"{base}_{suffix}"
        suffix += 1


def _resolve_event_by_slug(session: Session, season_year: int, slug: str) -> Event:
    """Resolve an event from a season year + event slug (the public URL key)."""
    season = session.exec(select(Season).where(Season.year == season_year)).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    event = session.exec(
        select(Event).where(
            Event.season_short_name == season.short_name,
            Event.slug == slug,
        )
    ).first()
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return event


@public_router.get("/by-slug", response_model=EventReadWithChampionships)
def get_event_by_slug_public(
    season_year: int = Query(...),
    slug: str = Query(...),
    session: Session = Depends(get_readonly_session),
) -> EventReadWithChampionships:
    event = _resolve_event_by_slug(session, season_year, slug)
    return _enrich_events([event], session)[0]


@admin_router.get("/by-slug", response_model=EventReadWithChampionships)
@router.get("/by-slug", response_model=EventReadWithChampionships)
def get_event_by_slug(
    season_year: int = Query(...),
    slug: str = Query(...),
    session: Session = Depends(get_session),
) -> EventReadWithChampionships:
    event = _resolve_event_by_slug(session, season_year, slug)
    return _enrich_events([event], session)[0]


@admin_router.post("", response_model=EventReadWithChampionships, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=EventReadWithChampionships, status_code=status.HTTP_201_CREATED)
def create_event(
    event_in: EventCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> EventRead:
    event = Event(**model_dump(event_in))
    event.slug = _unique_event_slug(
        session, event.season_short_name, _event_slug_base(event)
    )
    session.add(event)
    session.commit()
    session.refresh(event)
    season = session.exec(
        select(Season).where(Season.short_name == event.season_short_name)
    ).first()
    circuit_payload = None
    if event.circuit_id:
        circuit = session.get(Circuit, event.circuit_id)
        if circuit:
            circuit_payload = CircuitInfo(
                id=circuit.id,
                slug=circuit.slug,
                short_name=circuit.short_name,
                name=circuit.name,
                city=circuit.city,
                country=circuit.country,
                timezone=circuit.timezone,
            )
    reg_payload = None
    if event.regulatory_system_id is not None:
        reg_system = session.get(RegulatorySystem, event.regulatory_system_id)
        if reg_system:
            reg_payload = RegulatorySystemInfo(
                id=reg_system.id,
                abbreviation=reg_system.abbreviation,
                name=reg_system.name,
            )
    payload = model_dump(event)
    payload.pop("circuit_id", None)
    payload.pop("regulatory_system_id", None)
    payload["season_id"] = season.id if season else None
    payload["season_year"] = season.year if season else None
    return EventReadWithChampionships(
        **payload,
        championships=[],
        circuit=circuit_payload,
        regulatory_system=reg_payload,
    )


@public_router.get("", response_model=list[EventReadWithChampionships])
def list_events_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[EventReadWithChampionships]:
    return list_events(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[EventReadWithChampionships])
@router.get("", response_model=list[EventReadWithChampionships])
def list_events(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[EventReadWithChampionships]:
    statement = (
        select(Event)
        
        .offset(offset)
        .limit(limit)
    )
    events = session.exec(statement).all()
    return _enrich_events(events, session)


@public_router.get("/by-season/{season_id}", response_model=list[EventReadWithChampionships])
def list_events_by_season_public(
    season_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[EventReadWithChampionships]:
    return list_events_by_season(season_id=season_id, session=session)


@admin_router.get("/by-season/{season_id}", response_model=list[EventReadWithChampionships])
@router.get("/by-season/{season_id}", response_model=list[EventReadWithChampionships])
def list_events_by_season(
    season_id: int,
    session: Session = Depends(get_session),
) -> list[EventReadWithChampionships]:
    season = session.get(Season, season_id)
    if not season:
        return []
    events = session.exec(
        select(Event)
        .where(Event.season_short_name == season.short_name)
        .order_by(Event.event_date.asc())
    ).all()
    return _enrich_events(events, session)


@public_router.get("/by-car/{car_id}", response_model=list[EventReadWithChampionships])
def list_events_by_car_public(
    car_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[EventReadWithChampionships]:
    return list_events_by_car(car_id=car_id, session=session)


@admin_router.get("/by-car/{car_id}", response_model=list[EventReadWithChampionships])
@router.get("/by-car/{car_id}", response_model=list[EventReadWithChampionships])
def list_events_by_car(
    car_id: int,
    session: Session = Depends(get_session),
) -> list[EventReadWithChampionships]:
    events = session.exec(
        select(Event)
        .join(EventEntry, EventEntry.event_id == Event.id)
        .where(
            EventEntry.car_id == car_id,
        )
        .distinct()
        .order_by(Event.event_date.desc(), Event.event_name.asc())
    ).all()
    return _enrich_events(events, session)


@public_router.get("/{event_id}/previous", response_model=EventReadWithChampionships | None)
def get_previous_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> EventReadWithChampionships | None:
    return get_previous_event(event_id=event_id, session=session)


@admin_router.get("/{event_id}/previous", response_model=EventReadWithChampionships | None)
@router.get("/{event_id}/previous", response_model=EventReadWithChampionships | None)
def get_previous_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> EventReadWithChampionships | None:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    prev = session.exec(
        select(Event)
        .where(Event.season_short_name == event.season_short_name)
        .where(Event.event_date < event.event_date)
        .order_by(Event.event_date.desc())
        .limit(1)
    ).first()
    if not prev:
        return None
    return _enrich_events([prev], session)[0]

@public_router.get("/{event_id}", response_model=EventReadWithChampionships)
def get_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> EventReadWithChampionships:
    return get_event(event_id=event_id, session=session)


@admin_router.get("/{event_id}", response_model=EventReadWithChampionships)
@router.get("/{event_id}", response_model=EventReadWithChampionships)
def get_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> EventReadWithChampionships:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    statement = (
        select(Championship)
        .join(EventChampionship, Championship.id == EventChampionship.championship_id)
        .where(EventChampionship.event_id == event_id)
    )
    championships = session.exec(statement).all()
    championship_payload = [
        ChampionshipInfo(
            id=item.id,
            short_name=item.short_name,
            championship_name=item.championship_name,
        )
        for item in championships
    ]
    circuit = session.get(Circuit, event.circuit_id)
    circuit_payload = None
    if circuit:
        circuit_payload = CircuitInfo(
            id=circuit.id,
            slug=circuit.slug,
            short_name=circuit.short_name,
            name=circuit.name,
            city=circuit.city,
            country=circuit.country,
            timezone=circuit.timezone,
        )
    reg_payload = None
    if event.regulatory_system_id is not None:
        reg_system = session.get(RegulatorySystem, event.regulatory_system_id)
        if reg_system:
            reg_payload = RegulatorySystemInfo(
                id=reg_system.id,
                abbreviation=reg_system.abbreviation,
                name=reg_system.name,
            )
    payload = model_dump(event)
    payload.pop("circuit_id", None)
    payload.pop("regulatory_system_id", None)
    season = session.exec(
        select(Season).where(Season.short_name == event.season_short_name)
    ).first()
    payload["season_id"] = season.id if season else None
    payload["season_year"] = season.year if season else None
    return EventReadWithChampionships(
        **payload,
        championships=championship_payload,
        circuit=circuit_payload,
        regulatory_system=reg_payload,
    )


@admin_router.patch("/{event_id}", response_model=EventReadWithChampionships)
@router.patch("/{event_id}", response_model=EventReadWithChampionships)
def update_event(
    event_id: int,
    event_in: EventUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> EventReadWithChampionships:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    update_data = model_dump(event_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)

    # Regenerate the URL slug when the name (or season) changes.
    if {"event_name", "event_official_name", "round", "season_short_name"} & update_data.keys():
        event.slug = _unique_event_slug(
            session, event.season_short_name, _event_slug_base(event), exclude_id=event.id
        )

    session.add(event)
    session.commit()
    session.refresh(event)
    enriched = _enrich_events([event], session)
    return enriched[0] if enriched else event


@admin_router.put("/{event_id}/championships", status_code=status.HTTP_204_NO_CONTENT)
@router.put("/{event_id}/championships", status_code=status.HTTP_204_NO_CONTENT)
def replace_event_championships(
    event_id: int,
    payload: EventChampionshipUpdatePayload,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> None:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    delete_stmt = EventChampionship.__table__.delete().where(
        EventChampionship.event_id == event_id
    )
    session.exec(delete_stmt)

    for championship_id in payload.championship_ids:
        session.add(
            EventChampionship(
                event_id=event_id,
                championship_id=championship_id,
            )
        )

    session.commit()
    return None


@admin_router.delete(
    "/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    session.delete(event)
    session.commit()
    return None
