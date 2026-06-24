from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.penalty import (
    Penalty,
    PenaltyCreate,
    PenaltyRead,
    PenaltyUpdate,
)
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/penalties", tags=["penalties"])
public_router = APIRouter(prefix="/v1/penalties", tags=["penalties"])
admin_router = APIRouter(
    prefix="/api/admin/penalties",
    tags=["penalties"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)


@admin_router.post("", response_model=PenaltyRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=PenaltyRead, status_code=status.HTTP_201_CREATED)
def create_penalty(
    payload: PenaltyCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> PenaltyRead:
    row = Penalty(**model_dump(payload))
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@public_router.get(
    "/by-session-result/{session_result_id}", response_model=list[PenaltyRead]
)
def list_penalties_by_session_result_public(
    session_result_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[PenaltyRead]:
    return list_penalties_by_session_result(
        session_result_id=session_result_id, session=session
    )


@admin_router.get(
    "/by-session-result/{session_result_id}", response_model=list[PenaltyRead]
)
@router.get(
    "/by-session-result/{session_result_id}", response_model=list[PenaltyRead]
)
def list_penalties_by_session_result(
    session_result_id: int,
    session: Session = Depends(get_session),
) -> list[PenaltyRead]:
    return session.exec(
        select(Penalty)
        .where(Penalty.session_result_id == session_result_id)
        .order_by(Penalty.id.asc())
    ).all()


@public_router.get("/{penalty_id}", response_model=PenaltyRead)
def get_penalty_public(
    penalty_id: int,
    session: Session = Depends(get_readonly_session),
) -> PenaltyRead:
    return get_penalty(penalty_id=penalty_id, session=session)


@admin_router.get("/{penalty_id}", response_model=PenaltyRead)
@router.get("/{penalty_id}", response_model=PenaltyRead)
def get_penalty(
    penalty_id: int,
    session: Session = Depends(get_session),
) -> PenaltyRead:
    row = session.get(Penalty, penalty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Penalty not found")
    return row


@admin_router.patch("/{penalty_id}", response_model=PenaltyRead)
@router.patch("/{penalty_id}", response_model=PenaltyRead)
def update_penalty(
    penalty_id: int,
    payload: PenaltyUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> PenaltyRead:
    row = session.get(Penalty, penalty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Penalty not found")
    update_data = model_dump(payload, exclude_unset=True)
    for key, value in update_data.items():
        setattr(row, key, value)
    session.add(row)
    session.commit()
    session.refresh(row)
    return row


@admin_router.delete(
    "/{penalty_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{penalty_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_penalty(
    penalty_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    row = session.get(Penalty, penalty_id)
    if not row:
        raise HTTPException(status_code=404, detail="Penalty not found")
    session.delete(row)
    session.commit()
