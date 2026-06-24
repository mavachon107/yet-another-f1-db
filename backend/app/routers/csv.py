import csv
from datetime import date, datetime
from io import StringIO, TextIOWrapper
from typing import Any, Optional, Type, get_args, get_origin

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlmodel import Session, SQLModel, select

from app.core.auth import require_role
from app.database import get_session
from app.models.user import UserRole
from app.models.car import Car
from app.models.circuit import Circuit, CircuitVersion
from app.models.competition import Competition
from app.models.constructor import Constructor
from app.models.driver import Driver
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.regulatory_system import RegulatorySystem
from app.models.season import Season
from app.models.session import Session as SessionModel
from app.models.session_result import SessionResult
from app.models.team import Team
from app.models.tire import Tire

router = APIRouter(
    prefix="/admin/csv",
    tags=["csv"],
    dependencies=[Depends(require_role({UserRole.admin}))],
)

MODEL_MAP: dict[str, Type[SQLModel]] = {
    "car": Car,
    "circuit": Circuit,
    "circuit_version": CircuitVersion,
    "competition": Competition,
    "constructor": Constructor,
    "driver": Driver,
    "event": Event,
    "event_entry": EventEntry,
    "regulatory_system": RegulatorySystem,
    "season": Season,
    "session": SessionModel,
    "session_result": SessionResult,
    "team": Team,
    "tire": Tire,
}


def _model_fields(model: Type[SQLModel]) -> list[str]:
    if hasattr(model, "model_fields"):
        return list(model.model_fields.keys())
    if hasattr(model, "__fields__"):
        return list(model.__fields__.keys())
    raise RuntimeError(f"Unable to read fields for model {model}")


def _unwrap_optional(field_type: Any) -> Any:
    origin = get_origin(field_type)
    if origin is Optional:
        args = [arg for arg in get_args(field_type) if arg is not type(None)]
        return args[0] if args else field_type
    if origin is list:
        return field_type
    return field_type


def _coerce_value(field_type: Any, value: str) -> Any:
    value = value.strip()
    if value == "":
        return None

    base_type = _unwrap_optional(field_type)
    if base_type in (int,):
        return int(value)
    if base_type in (float,):
        return float(value)
    if base_type in (date,):
        return date.fromisoformat(value)
    if base_type in (datetime,):
        return datetime.fromisoformat(value)
    if base_type in (bool,):
        return value.lower() in {"1", "true", "t", "yes", "y"}
    return value


def _model_field_types(model: Type[SQLModel]) -> dict[str, Any]:
    if hasattr(model, "model_fields"):
        return {name: field.annotation for name, field in model.model_fields.items()}
    if hasattr(model, "__fields__"):
        return {name: field.type_ for name, field in model.__fields__.items()}
    return {}


def _get_model(table: str) -> Type[SQLModel]:
    model = MODEL_MAP.get(table)
    if not model:
        raise HTTPException(status_code=404, detail=f"Unknown table: {table}")
    return model


@router.get("/{table}")
def export_table(table: str, session: Session = Depends(get_session)) -> StreamingResponse:
    model = _get_model(table)
    fields = _model_fields(model)

    def _row_stream():
        buffer = StringIO()
        writer = csv.DictWriter(buffer, fieldnames=fields)
        writer.writeheader()
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)

        rows = session.exec(select(model)).all()
        for row in rows:
            writer.writerow({field: getattr(row, field, None) for field in fields})
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    filename = f"{table}.csv"
    return StreamingResponse(
        _row_stream(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{table}", status_code=status.HTTP_201_CREATED)
def import_table(
    table: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> dict[str, int]:
    model = _get_model(table)
    fields = _model_fields(model)
    field_types = _model_field_types(model)

    created = 0
    updated = 0

    with TextIOWrapper(file.file, encoding="utf-8") as text_file:
        sample = text_file.read(4096)
        text_file.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t;")
        except csv.Error:
            dialect = csv.get_dialect("excel")
        reader = csv.DictReader(text_file, dialect=dialect)
        for row in reader:
            data = {}
            for key, raw_value in row.items():
                if key not in fields:
                    continue
                field_type = field_types.get(key)
                if field_type is None:
                    data[key] = raw_value
                else:
                    data[key] = _coerce_value(field_type, raw_value or "")

            raw_id = data.get("id")
            instance = None
            if raw_id is not None:
                try:
                    instance = session.get(model, int(raw_id))
                except (ValueError, TypeError):
                    instance = None

            if instance:
                for key, value in data.items():
                    if key == "id":
                        continue
                    setattr(instance, key, value)
                session.add(instance)
                updated += 1
            else:
                instance = model(**data)
                session.add(instance)
                created += 1

        session.commit()

    return {"created": created, "updated": updated}
