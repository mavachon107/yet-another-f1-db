from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.constructor import Constructor
from app.models.constructor_lineage import (
    ConstructorLineage,
    ConstructorLineageCreate,
    ConstructorLineageRead,
    ConstructorLineageUpdate,
)
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/constructor-lineage-links", tags=["constructor-lineage-links"])
public_router = APIRouter(
    prefix="/v1/constructor-lineage-links", tags=["constructor-lineage-links"]
)
admin_router = APIRouter(
    prefix="/api/admin/constructor-lineage-links",
    tags=["constructor-lineage-links"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)




def _assert_constructor_exists(constructor_id: int, session: Session, field_name: str) -> None:
    constructor = session.get(Constructor, constructor_id)
    if not constructor:
        raise HTTPException(status_code=404, detail=f"{field_name} not found.")


def _validate_link(constructor_id: int, parent_constructor_id: int | None) -> None:
    if parent_constructor_id is not None and constructor_id == parent_constructor_id:
        raise HTTPException(
            status_code=400,
            detail="constructor_id cannot be the same as parent_constructor_id.",
        )


def _map_integrity_error(exc: IntegrityError) -> HTTPException:
    detail = str(getattr(exc, "orig", exc)).lower()
    if "uq_constructor_lineage_constructor" in detail or "unique" in detail:
        return HTTPException(
            status_code=409,
            detail="A lineage link already exists for this constructor.",
        )
    if "ck_constructor_lineage_not_self" in detail:
        return HTTPException(
            status_code=400,
            detail="constructor_id cannot be the same as parent_constructor_id.",
        )
    if "foreign key" in detail:
        return HTTPException(
            status_code=400,
            detail="One or more constructor references are invalid.",
        )
    return HTTPException(status_code=400, detail="Invalid constructor lineage payload.")


@public_router.get("", response_model=list[ConstructorLineageRead])
def list_constructor_lineage_links_public(
    constructor_id: int | None = Query(default=None, ge=1),
    session: Session = Depends(get_readonly_session),
) -> list[ConstructorLineageRead]:
    return list_constructor_lineage_links(
        constructor_id=constructor_id,
        session=session,
    )


@router.get("", response_model=list[ConstructorLineageRead])
@admin_router.get("", response_model=list[ConstructorLineageRead])
def list_constructor_lineage_links(
    constructor_id: int | None = Query(default=None, ge=1),
    session: Session = Depends(get_session),
) -> list[ConstructorLineageRead]:
    statement = select(ConstructorLineage)
    if constructor_id is not None:
        statement = statement.where(ConstructorLineage.constructor_id == constructor_id)
    statement = statement.order_by(ConstructorLineage.constructor_id.asc())
    return session.exec(statement).all()


@router.post("", response_model=ConstructorLineageRead, status_code=status.HTTP_201_CREATED)
@admin_router.post("", response_model=ConstructorLineageRead, status_code=status.HTTP_201_CREATED)
def create_constructor_lineage_link(
    link_in: ConstructorLineageCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ConstructorLineageRead:
    payload = model_dump(link_in)
    constructor_id = int(payload["constructor_id"])
    parent_constructor_id = payload.get("parent_constructor_id")

    _assert_constructor_exists(constructor_id, session, "constructor")
    if parent_constructor_id is not None:
        _assert_constructor_exists(parent_constructor_id, session, "parent constructor")
    _validate_link(constructor_id, parent_constructor_id)

    link = ConstructorLineage(**payload)
    session.add(link)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise _map_integrity_error(exc)
    session.refresh(link)
    return link


@router.patch("/{link_id}", response_model=ConstructorLineageRead)
@admin_router.patch("/{link_id}", response_model=ConstructorLineageRead)
def update_constructor_lineage_link(
    link_id: int,
    link_in: ConstructorLineageUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ConstructorLineageRead:
    link = session.get(ConstructorLineage, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Constructor lineage link not found.")

    update_data = model_dump(link_in, exclude_unset=True)
    next_parent_id = update_data.get("parent_constructor_id", link.parent_constructor_id)
    if next_parent_id is not None:
        _assert_constructor_exists(next_parent_id, session, "parent constructor")
    _validate_link(link.constructor_id, next_parent_id)

    for key, value in update_data.items():
        setattr(link, key, value)

    session.add(link)
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise _map_integrity_error(exc)
    session.refresh(link)
    return link


@router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
@admin_router.delete("/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_constructor_lineage_link(
    link_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> None:
    link = session.get(ConstructorLineage, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Constructor lineage link not found.")

    session.delete(link)
    session.commit()
    return None
