from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.tire import Tire, TireCreate, TireRead, TireUpdate
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/tires", tags=["tires"])
public_router = APIRouter(prefix="/v1/tires", tags=["tires"])
admin_router = APIRouter(
    prefix="/api/admin/tires",
    tags=["tires"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)




@admin_router.post("", response_model=TireRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=TireRead, status_code=status.HTTP_201_CREATED)
def create_tire(
    tire_in: TireCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> TireRead:
    tire = Tire(**model_dump(tire_in))
    session.add(tire)
    session.commit()
    session.refresh(tire)
    return tire


@public_router.get("", response_model=list[TireRead])
def list_tires_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[TireRead]:
    return list_tires(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[TireRead])
@router.get("", response_model=list[TireRead])
def list_tires(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[TireRead]:
    statement = (
        select(Tire)
        
        .offset(offset)
        .limit(limit)
    )
    tires = session.exec(statement).all()
    return tires


@public_router.get("/{tire_id}", response_model=TireRead)
def get_tire_public(
    tire_id: int,
    session: Session = Depends(get_readonly_session),
) -> TireRead:
    return get_tire(tire_id=tire_id, session=session)


@admin_router.get("/{tire_id}", response_model=TireRead)
@router.get("/{tire_id}", response_model=TireRead)
def get_tire(
    tire_id: int,
    session: Session = Depends(get_session),
) -> TireRead:
    tire = session.get(Tire, tire_id)
    if not tire:
        raise HTTPException(status_code=404, detail="Tire not found")
    return tire


@admin_router.patch("/{tire_id}", response_model=TireRead)
@router.patch("/{tire_id}", response_model=TireRead)
def update_tire(
    tire_id: int,
    tire_in: TireUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> TireRead:
    tire = session.get(Tire, tire_id)
    if not tire:
        raise HTTPException(status_code=404, detail="Tire not found")

    update_data = model_dump(tire_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(tire, key, value)

    session.add(tire)
    session.commit()
    session.refresh(tire)
    return tire


@admin_router.delete(
    "/{tire_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{tire_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tire(
    tire_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    tire = session.get(Tire, tire_id)
    if not tire:
        raise HTTPException(status_code=404, detail="Tire not found")

    session.delete(tire)
    session.commit()
    return None
