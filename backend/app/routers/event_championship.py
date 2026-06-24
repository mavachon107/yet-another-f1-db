from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.event_championship import (
    EventChampionship,
    EventChampionshipCreate,
    EventChampionshipRead,
    EventChampionshipUpdate,
)
from app.models.user import UserRole
from app.utils import model_dump

public_router = APIRouter(prefix="/v1/event-championships", tags=["event-championships"])
admin_router = APIRouter(
    prefix="/api/admin/event-championships",
    tags=["event-championships"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


@public_router.get("", response_model=list[EventChampionshipRead])
def list_event_championships(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[EventChampionshipRead]:
    statement = select(EventChampionship).offset(offset).limit(limit)
    return session.exec(statement).all()


@public_router.get("/{event_championship_id}", response_model=EventChampionshipRead)
def get_event_championship(
    event_championship_id: int,
    session: Session = Depends(get_readonly_session),
) -> EventChampionshipRead:
    event_championship = session.get(EventChampionship, event_championship_id)
    if not event_championship:
        raise HTTPException(status_code=404, detail="Event championship not found")
    return event_championship


@admin_router.post("", response_model=EventChampionshipRead, status_code=status.HTTP_201_CREATED)
def create_event_championship(
    event_championship_in: EventChampionshipCreate,
    session: Session = Depends(get_session),
) -> EventChampionshipRead:
    event_championship = EventChampionship(**model_dump(event_championship_in))
    session.add(event_championship)
    session.commit()
    session.refresh(event_championship)
    return event_championship


@admin_router.patch("/{event_championship_id}", response_model=EventChampionshipRead)
def update_event_championship(
    event_championship_id: int,
    event_championship_in: EventChampionshipUpdate,
    session: Session = Depends(get_session),
) -> EventChampionshipRead:
    event_championship = session.get(EventChampionship, event_championship_id)
    if not event_championship:
        raise HTTPException(status_code=404, detail="Event championship not found")

    update_data = model_dump(event_championship_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(event_championship, key, value)

    session.add(event_championship)
    session.commit()
    session.refresh(event_championship)
    return event_championship


@admin_router.delete("/{event_championship_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event_championship(
    event_championship_id: int,
    session: Session = Depends(get_session),
) -> None:
    event_championship = session.get(EventChampionship, event_championship_id)
    if not event_championship:
        raise HTTPException(status_code=404, detail="Event championship not found")

    session.delete(event_championship)
    session.commit()
    return None
