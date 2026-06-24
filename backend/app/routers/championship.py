from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select
from datetime import datetime

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.championship import (
    Championship,
    ChampionshipCreate,
    ChampionshipRead,
    ChampionshipUpdate,
)
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/championships", tags=["championships"])
public_router = APIRouter(prefix="/v1/championships", tags=["championships"])
admin_router = APIRouter(
    prefix="/api/admin/championships",
    tags=["championships"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)




@admin_router.post("", response_model=ChampionshipRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=ChampionshipRead, status_code=status.HTTP_201_CREATED)
def create_championship(
    championship_in: ChampionshipCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ChampionshipRead:
    championship = Championship(**model_dump(championship_in))
    session.add(championship)
    session.commit()
    session.refresh(championship)
    return championship


@public_router.get("", response_model=list[ChampionshipRead])
def list_championships_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[ChampionshipRead]:
    return list_championships(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[ChampionshipRead])
@router.get("", response_model=list[ChampionshipRead])
def list_championships(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[ChampionshipRead]:
    statement = (
        select(Championship)
        
        .offset(offset)
    )
    if limit is not None:
        statement = statement.limit(limit)
    championships = session.exec(statement).all()
    return championships


@public_router.get("/{championship_id}", response_model=ChampionshipRead)
def get_championship_public(
    championship_id: int,
    session: Session = Depends(get_readonly_session),
) -> ChampionshipRead:
    return get_championship(championship_id=championship_id, session=session)


@admin_router.get("/{championship_id}", response_model=ChampionshipRead)
@router.get("/{championship_id}", response_model=ChampionshipRead)
def get_championship(
    championship_id: int,
    session: Session = Depends(get_session),
) -> ChampionshipRead:
    championship = session.get(Championship, championship_id)
    if not championship:
        raise HTTPException(status_code=404, detail="Championship not found")
    return championship


@admin_router.patch("/{championship_id}", response_model=ChampionshipRead)
@router.patch("/{championship_id}", response_model=ChampionshipRead)
def update_championship(
    championship_id: int,
    championship_in: ChampionshipUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ChampionshipRead:
    championship = session.get(Championship, championship_id)
    if not championship:
        raise HTTPException(status_code=404, detail="Championship not found")

    update_data = model_dump(championship_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(championship, key, value)

    session.add(championship)
    session.commit()
    session.refresh(championship)
    return championship


@admin_router.delete(
    "/{championship_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{championship_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_championship(
    championship_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    championship = session.get(Championship, championship_id)
    if not championship:
        raise HTTPException(status_code=404, detail="Championship not found")

    session.delete(championship)
    session.commit()
    return None
