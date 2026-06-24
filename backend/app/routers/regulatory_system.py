from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.regulatory_system import (
    RegulatorySystem,
    RegulatorySystemCreate,
    RegulatorySystemRead,
    RegulatorySystemUpdate,
)
from app.models.user import UserRole
from app.utils import model_dump

public_router = APIRouter(prefix="/v1/regulatory-systems", tags=["regulatory-systems"])
admin_router = APIRouter(
    prefix="/api/admin/regulatory-systems",
    tags=["regulatory-systems"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


@public_router.get("", response_model=list[RegulatorySystemRead])
def list_regulatory_systems(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[RegulatorySystemRead]:
    statement = select(RegulatorySystem).offset(offset).limit(limit)
    return session.exec(statement).all()


@public_router.get("/{regulatory_system_id}", response_model=RegulatorySystemRead)
def get_regulatory_system(
    regulatory_system_id: int,
    session: Session = Depends(get_readonly_session),
) -> RegulatorySystemRead:
    regulatory_system = session.get(RegulatorySystem, regulatory_system_id)
    if not regulatory_system:
        raise HTTPException(status_code=404, detail="Regulatory system not found")
    return regulatory_system


@admin_router.post("", response_model=RegulatorySystemRead, status_code=status.HTTP_201_CREATED)
def create_regulatory_system(
    regulatory_system_in: RegulatorySystemCreate,
    session: Session = Depends(get_session),
) -> RegulatorySystemRead:
    regulatory_system = RegulatorySystem(**model_dump(regulatory_system_in))
    session.add(regulatory_system)
    session.commit()
    session.refresh(regulatory_system)
    return regulatory_system


@admin_router.patch("/{regulatory_system_id}", response_model=RegulatorySystemRead)
def update_regulatory_system(
    regulatory_system_id: int,
    regulatory_system_in: RegulatorySystemUpdate,
    session: Session = Depends(get_session),
) -> RegulatorySystemRead:
    regulatory_system = session.get(RegulatorySystem, regulatory_system_id)
    if not regulatory_system:
        raise HTTPException(status_code=404, detail="Regulatory system not found")

    update_data = model_dump(regulatory_system_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(regulatory_system, key, value)

    session.add(regulatory_system)
    session.commit()
    session.refresh(regulatory_system)
    return regulatory_system


@admin_router.delete("/{regulatory_system_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_regulatory_system(
    regulatory_system_id: int,
    session: Session = Depends(get_session),
) -> None:
    regulatory_system = session.get(RegulatorySystem, regulatory_system_id)
    if not regulatory_system:
        raise HTTPException(status_code=404, detail="Regulatory system not found")

    session.delete(regulatory_system)
    session.commit()
    return None
