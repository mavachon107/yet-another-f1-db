from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.reference import (
    Reference,
    ReferenceCreate,
    ReferenceRead,
    ReferenceUpdate,
)
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/references", tags=["references"])
public_router = APIRouter(prefix="/v1/references", tags=["references"])
admin_router = APIRouter(
    prefix="/api/admin/references",
    tags=["references"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)

ALLOWED_ENTITY_TYPES = {"event", "circuit", "car", "driver", "constructor", "team"}
ALLOWED_REF_TYPES = {"website", "book", "article", "other"}




def _validate_reference_payload(entity_type: str | None, ref_type: str | None, url, citation):
    if entity_type is not None and entity_type not in ALLOWED_ENTITY_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported entity type.")
    if ref_type is not None and ref_type not in ALLOWED_REF_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported reference type.")
    if ref_type == "website" and not url:
        raise HTTPException(status_code=400, detail="Website references require a URL.")
    if ref_type in {"book", "article"} and not citation:
        raise HTTPException(
            status_code=400,
            detail="Book and article references require a citation.",
        )


@public_router.get("", response_model=list[ReferenceRead])
def list_references_public(
    entity_type: str = Query(...),
    entity_id: int = Query(..., ge=1),
    session: Session = Depends(get_readonly_session),
) -> list[ReferenceRead]:
    return list_references(
        entity_type=entity_type,
        entity_id=entity_id,
        session=session,
    )


@admin_router.get("", response_model=list[ReferenceRead])
@router.get("", response_model=list[ReferenceRead])
def list_references(
    entity_type: str = Query(...),
    entity_id: int = Query(..., ge=1),
    session: Session = Depends(get_session),
) -> list[ReferenceRead]:
    _validate_reference_payload(entity_type, None, None, None)
    statement = (
        select(Reference)
        .where(
            Reference.entity_type == entity_type,
            Reference.entity_id == entity_id,
        )
        .order_by(Reference.updated_at.desc(), Reference.id.desc())
    )
    references = session.exec(statement).all()
    return references


@admin_router.post("", response_model=ReferenceRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=ReferenceRead, status_code=status.HTTP_201_CREATED)
def create_reference(
    reference_in: ReferenceCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ReferenceRead:
    payload = model_dump(reference_in)
    _validate_reference_payload(
        payload.get("entity_type"),
        payload.get("ref_type"),
        payload.get("url"),
        payload.get("citation"),
    )
    reference = Reference(**payload)
    session.add(reference)
    session.commit()
    session.refresh(reference)
    return reference


@admin_router.patch("/{reference_id}", response_model=ReferenceRead)
@router.patch("/{reference_id}", response_model=ReferenceRead)
def update_reference(
    reference_id: int,
    reference_in: ReferenceUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> ReferenceRead:
    reference = session.get(Reference, reference_id)
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")

    update_data = model_dump(reference_in, exclude_unset=True)
    ref_type = update_data.get("ref_type", reference.ref_type)
    url = update_data.get("url", reference.url)
    citation = update_data.get("citation", reference.citation)
    _validate_reference_payload(None, ref_type, url, citation)

    for key, value in update_data.items():
        setattr(reference, key, value)

    session.add(reference)
    session.commit()
    session.refresh(reference)
    return reference


@admin_router.delete(
    "/{reference_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{reference_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reference(
    reference_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    reference = session.get(Reference, reference_id)
    if not reference:
        raise HTTPException(status_code=404, detail="Reference not found")

    session.delete(reference)
    session.commit()
    return None
