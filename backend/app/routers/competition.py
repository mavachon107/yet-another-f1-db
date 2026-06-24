from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.competition import (
    Competition,
    CompetitionCreate,
    CompetitionRead,
    CompetitionUpdate,
)
from app.models.user import UserRole
from app.utils import model_dump

public_router = APIRouter(prefix="/v1/competitions", tags=["competitions"])
admin_router = APIRouter(
    prefix="/api/admin/competitions",
    tags=["competitions"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


@public_router.get("", response_model=list[CompetitionRead])
def list_competitions(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CompetitionRead]:
    statement = select(Competition).offset(offset).limit(limit)
    return session.exec(statement).all()


@public_router.get("/{competition_id}", response_model=CompetitionRead)
def get_competition(
    competition_id: int,
    session: Session = Depends(get_readonly_session),
) -> CompetitionRead:
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")
    return competition


@admin_router.post("", response_model=CompetitionRead, status_code=status.HTTP_201_CREATED)
def create_competition(
    competition_in: CompetitionCreate,
    session: Session = Depends(get_session),
) -> CompetitionRead:
    competition = Competition(**model_dump(competition_in))
    session.add(competition)
    session.commit()
    session.refresh(competition)
    return competition


@admin_router.patch("/{competition_id}", response_model=CompetitionRead)
def update_competition(
    competition_id: int,
    competition_in: CompetitionUpdate,
    session: Session = Depends(get_session),
) -> CompetitionRead:
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")

    update_data = model_dump(competition_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(competition, key, value)

    session.add(competition)
    session.commit()
    session.refresh(competition)
    return competition


@admin_router.delete("/{competition_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_competition(
    competition_id: int,
    session: Session = Depends(get_session),
) -> None:
    competition = session.get(Competition, competition_id)
    if not competition:
        raise HTTPException(status_code=404, detail="Competition not found")

    session.delete(competition)
    session.commit()
    return None
