import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session, get_session
from app.models.circuit import (
    CircuitVersion,
    CircuitVersionCreate,
    CircuitVersionRead,
    CircuitVersionUpdate,
)
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/circuit-versions", tags=["circuit-versions"])
public_router = APIRouter(prefix="/v1/circuit-versions", tags=["circuit-versions"])
admin_router = APIRouter(
    prefix="/api/admin/circuit-versions",
    tags=["circuit-versions"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)
LAYOUT_IMAGE_BASE_URL = os.getenv(
    "CIRCUIT_LAYOUT_IMAGE_BASE_URL", "/static/uploads/circuit_layouts"
)
LAYOUT_IMAGE_DIR = Path(
    os.getenv(
        "CIRCUIT_LAYOUT_IMAGE_DIR",
        Path(__file__).resolve().parents[1]
        / "static"
        / "uploads"
        / "circuit_layouts",
    )
)
MAX_IMAGE_BYTES = int(os.getenv("CIRCUIT_LAYOUT_MAX_BYTES", str(5 * 1024 * 1024)))
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}




def _local_image_path(image_url: str | None) -> Path | None:
    if not image_url:
        return None
    base = LAYOUT_IMAGE_BASE_URL.rstrip("/")
    if not image_url.startswith(base):
        return None
    relative = image_url[len(base) :].lstrip("/")
    if not relative:
        return None
    resolved = (LAYOUT_IMAGE_DIR / relative).resolve()
    if not resolved.is_relative_to(LAYOUT_IMAGE_DIR.resolve()):
        return None
    return resolved

@admin_router.post("", response_model=CircuitVersionRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=CircuitVersionRead, status_code=status.HTTP_201_CREATED)
def create_circuit_version(
    circuit_version_in: CircuitVersionCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> CircuitVersionRead:
    circuit_version = CircuitVersion(**model_dump(circuit_version_in))
    session.add(circuit_version)
    session.commit()
    session.refresh(circuit_version)
    return circuit_version


@public_router.get("", response_model=list[CircuitVersionRead])
def list_circuit_versions_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CircuitVersionRead]:
    return list_circuit_versions(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[CircuitVersionRead])
@router.get("", response_model=list[CircuitVersionRead])
def list_circuit_versions(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CircuitVersionRead]:
    statement = (
        select(CircuitVersion)
        
        .offset(offset)
        .limit(limit)
    )
    circuit_versions = session.exec(statement).all()
    return circuit_versions


@public_router.get("/by-circuit/{circuit_id}", response_model=list[CircuitVersionRead])
def list_circuit_versions_by_circuit_public(
    circuit_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[CircuitVersionRead]:
    return list_circuit_versions_by_circuit(circuit_id=circuit_id, session=session)


@admin_router.get("/by-circuit/{circuit_id}", response_model=list[CircuitVersionRead])
@router.get("/by-circuit/{circuit_id}", response_model=list[CircuitVersionRead])
def list_circuit_versions_by_circuit(
    circuit_id: int,
    session: Session = Depends(get_session),
) -> list[CircuitVersionRead]:
    statement = (
        select(CircuitVersion)
        .where(
            CircuitVersion.circuit_id == circuit_id,
        )
        .order_by(
            CircuitVersion.valid_from.desc().nullslast(),
            CircuitVersion.id.desc(),
        )
    )
    return session.exec(statement).all()


@public_router.get("/{circuit_version_id}", response_model=CircuitVersionRead)
def get_circuit_version_public(
    circuit_version_id: int,
    session: Session = Depends(get_readonly_session),
) -> CircuitVersionRead:
    return get_circuit_version(circuit_version_id=circuit_version_id, session=session)


@admin_router.get("/{circuit_version_id}", response_model=CircuitVersionRead)
@router.get("/{circuit_version_id}", response_model=CircuitVersionRead)
def get_circuit_version(
    circuit_version_id: int,
    session: Session = Depends(get_session),
) -> CircuitVersionRead:
    circuit_version = session.get(CircuitVersion, circuit_version_id)
    if not circuit_version:
        raise HTTPException(status_code=404, detail="Circuit version not found")
    return circuit_version


@admin_router.patch("/{circuit_version_id}", response_model=CircuitVersionRead)
@router.patch("/{circuit_version_id}", response_model=CircuitVersionRead)
def update_circuit_version(
    circuit_version_id: int,
    circuit_version_in: CircuitVersionUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> CircuitVersionRead:
    circuit_version = session.get(CircuitVersion, circuit_version_id)
    if not circuit_version:
        raise HTTPException(status_code=404, detail="Circuit version not found")

    update_data = model_dump(circuit_version_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(circuit_version, key, value)

    session.add(circuit_version)
    session.commit()
    session.refresh(circuit_version)
    return circuit_version


@admin_router.delete(
    "/{circuit_version_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{circuit_version_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_circuit_version(
    circuit_version_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    circuit_version = session.get(CircuitVersion, circuit_version_id)
    if not circuit_version:
        raise HTTPException(status_code=404, detail="Circuit version not found")

    session.delete(circuit_version)
    session.commit()
    return None


@admin_router.post("/{circuit_version_id}/image", status_code=status.HTTP_201_CREATED)
@router.post("/{circuit_version_id}/image", status_code=status.HTTP_201_CREATED)
async def upload_circuit_layout(
    circuit_version_id: int,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    circuit_version = session.get(CircuitVersion, circuit_version_id)
    if not circuit_version:
        raise HTTPException(status_code=404, detail="Circuit version not found")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported image type. Use JPG, PNG, or WEBP.",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file upload.")
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image too large. Max size is {MAX_IMAGE_BYTES} bytes.",
        )

    ext = ALLOWED_IMAGE_TYPES[content_type]
    target_dir = LAYOUT_IMAGE_DIR / str(circuit_version_id)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.{ext}"
    target_path = target_dir / filename
    target_path.write_bytes(data)

    old_path = _local_image_path(circuit_version.layout_image_url)
    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass

    image_url = f"{LAYOUT_IMAGE_BASE_URL.rstrip('/')}/{circuit_version_id}/{filename}"
    circuit_version.layout_image_url = image_url
    circuit_version.layout_image_updated_at = datetime.utcnow()
    session.add(circuit_version)
    session.commit()
    session.refresh(circuit_version)

    return {"layout_image_url": image_url}


@admin_router.delete(
    "/{circuit_version_id}/image",
    status_code=status.HTTP_204_NO_CONTENT,
)
@router.delete("/{circuit_version_id}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_circuit_layout(
    circuit_version_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> None:
    circuit_version = session.get(CircuitVersion, circuit_version_id)
    if not circuit_version:
        raise HTTPException(status_code=404, detail="Circuit version not found")

    old_path = _local_image_path(circuit_version.layout_image_url)
    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass

    circuit_version.layout_image_url = None
    circuit_version.layout_image_updated_at = None
    session.add(circuit_version)
    session.commit()
    return None
