from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import Session, select
from sqlalchemy import and_, func

from app.core.auth import require_role
from app.core.slug import slugify_text, unique_slug
from app.database import get_readonly_session, get_session
from app.models.user import User, UserRole
from app.models.car import Car
from app.models.engine import Engine, EngineCreate, EngineResolved, EngineUpdate
from app.models.constructor import Constructor
from app.models.entry import EventEntry
from app.models.event import Event
from app.utils import model_dump

router = APIRouter(prefix="/engines", tags=["engines"])
public_router = APIRouter(prefix="/v1/engines", tags=["engines"])
admin_router = APIRouter(
    prefix="/api/admin/engines",
    tags=["engines"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)




def _resolve_engines(
    engines: list[Engine],
    session: Session,
) -> list[EngineResolved]:
    constructor_ids = {engine.constructor_id for engine in engines if engine.constructor_id}
    constructors = (
        session.exec(
            select(Constructor).where(Constructor.id.in_(constructor_ids))
        ).all()
        if constructor_ids
        else []
    )
    constructor_map = {constructor.id: constructor for constructor in constructors}
    return [
        EngineResolved(
            **model_dump(engine),
            constructor=constructor_map.get(engine.constructor_id),
        )
        for engine in engines
    ]


def _resolve_engine_read(engine: Engine, session: Session) -> EngineResolved:
    return _resolve_engines([engine], session)[0]


def _engine_slug_base(engine: Engine, session: Session) -> str:
    constructor = session.get(Constructor, engine.constructor_id) if engine.constructor_id else None
    designation = engine.model_number or engine.tagged_name or ""
    return slugify_text(constructor.name if constructor else "", designation)


def _resolve_engine(slug: str, session: Session) -> Engine:
    obj = session.exec(select(Engine).where(Engine.slug == slug)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Engine not found")
    return obj


@admin_router.post("", response_model=EngineResolved, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=EngineResolved, status_code=status.HTTP_201_CREATED)
def create_engine(
    engine_in: EngineCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> EngineResolved:
    engine = Engine(**model_dump(engine_in))
    engine.slug = unique_slug(session, Engine, _engine_slug_base(engine, session))
    session.add(engine)
    session.commit()
    session.refresh(engine)
    return _resolve_engine_read(engine, session)


@public_router.get("", response_model=list[EngineResolved])
def list_engines_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[EngineResolved]:
    return list_engines(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[EngineResolved])
@router.get("", response_model=list[EngineResolved])
def list_engines(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[EngineResolved]:
    statement = (
        select(Engine)
        .outerjoin(Constructor, Constructor.id == Engine.constructor_id)
        .order_by(
            Constructor.name.asc().nulls_last(),
            Engine.model_number.asc().nulls_last(),
            Engine.id.asc(),
        )
        .offset(offset)
        .limit(limit)
    )
    engines = session.exec(statement).all()
    return _resolve_engines(engines, session)


@public_router.get("/by-name", response_model=list[EngineResolved])
def list_engines_by_name_public(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[EngineResolved]:
    return list_engines_by_name(
        starts_with=starts_with,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("/by-name", response_model=list[EngineResolved])
@router.get("/by-name", response_model=list[EngineResolved])
def list_engines_by_name(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[EngineResolved]:
    prefix = starts_with.strip().lower()
    statement = (
        select(Engine)
        .where(Engine.model_number.ilike(f"{prefix}%"))
        .order_by(Engine.model_number.asc().nulls_last(), Engine.id.asc())
        .offset(offset)
        .limit(limit)
    )
    engines = session.exec(statement).all()
    return _resolve_engines(engines, session)


@public_router.get("/by-constructor", response_model=list[EngineResolved])
def list_engines_by_constructor_public(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[EngineResolved]:
    return list_engines_by_constructor(
        starts_with=starts_with,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("/by-constructor", response_model=list[EngineResolved])
@router.get("/by-constructor", response_model=list[EngineResolved])
def list_engines_by_constructor(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[EngineResolved]:
    prefix = starts_with.strip().lower()
    statement = (
        select(Engine)
        .outerjoin(Constructor, Constructor.id == Engine.constructor_id)
        .where(
            Constructor.name.ilike(f"{prefix}%")
            | Constructor.short_name.ilike(f"{prefix}%")
        )
        .order_by(
            Constructor.name.asc().nulls_last(),
            Engine.model_number.asc().nulls_last(),
            Engine.id.asc(),
        )
        .offset(offset)
        .limit(limit)
    )
    engines = session.exec(statement).all()
    return _resolve_engines(engines, session)


@public_router.get("/search", response_model=list[EngineResolved])
def search_engines_public(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[EngineResolved]:
    return search_engines(q=q, offset=offset, limit=limit, session=session)


@admin_router.get("/search", response_model=list[EngineResolved])
@router.get("/search", response_model=list[EngineResolved])
def search_engines(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[EngineResolved]:
    tokens = [t for t in q.strip().split() if t]
    if not tokens:
        return []
    conditions = []
    for token in tokens:
        term = f"%{token}%"
        conditions.append(
            Engine.model_number.ilike(term)
            | Engine.tagged_name.ilike(term)
            | Constructor.name.ilike(term)
        )
    statement = (
        select(Engine)
        .outerjoin(Constructor, Constructor.id == Engine.constructor_id)
        .where(and_(*conditions))
        .order_by(
            Constructor.name.asc().nulls_last(),
            Engine.model_number.asc().nulls_last(),
            Engine.id.asc(),
        )
        .offset(offset)
        .limit(limit)
    )
    engines = session.exec(statement).all()
    return _resolve_engines(engines, session)


@public_router.get("/stats")
def get_engine_stats_public(
    session: Session = Depends(get_readonly_session),
) -> dict:
    return get_engine_stats(session=session)


@admin_router.get("/stats")
@router.get("/stats")
def get_engine_stats(
    session: Session = Depends(get_session),
) -> dict:
    total = (
        session.exec(select(func.count()).select_from(Engine)).first()
        or 0
    )
    with_constructor = (
        session.exec(
            select(func.count()).select_from(Engine).where(Engine.constructor_id.is_not(None))
        ).first()
        or 0
    )
    layouts = session.exec(select(func.count(func.distinct(Engine.layout_id)))).first() or 0
    aspirations = session.exec(
        select(func.count(func.distinct(Engine.aspiration_type_id)))
    ).first() or 0
    top_constructor = session.exec(
        select(Constructor.name, func.count(Engine.id))
        .join(Engine, Engine.constructor_id == Constructor.id)
        .group_by(Constructor.name)
        .order_by(func.count(Engine.id).desc())
        .limit(1)
    ).first()

    return {
        "total": int(total or 0),
        "with_constructor": int(with_constructor or 0),
        "layout_count": int(layouts or 0),
        "aspiration_count": int(aspirations or 0),
        "top_constructor": top_constructor[0] if top_constructor else None,
        "top_constructor_count": int(top_constructor[1]) if top_constructor else None,
    }


def _list_engines_by_season(
    session: Session,
    season_short_name: str,
) -> list[EngineResolved]:
    statement = (
        select(Engine)
        .join(Car, Car.engine_id == Engine.id)
        .join(EventEntry, EventEntry.car_id == Car.id)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season_short_name)
        .distinct()
    )
    engines = session.exec(statement).all()
    return _resolve_engines(engines, session)


@public_router.get("/by-season", response_model=list[EngineResolved])
def list_engines_by_season_public(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_readonly_session),
) -> list[EngineResolved]:
    return _list_engines_by_season(session=session, season_short_name=season)


@admin_router.get("/by-season", response_model=list[EngineResolved])
@router.get("/by-season", response_model=list[EngineResolved])
def list_engines_by_season(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_session),
) -> list[EngineResolved]:
    return _list_engines_by_season(session=session, season_short_name=season)


@public_router.get("/{slug}", response_model=EngineResolved)
def get_engine_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> EngineResolved:
    return get_engine(slug=slug, session=session)


@admin_router.get("/{slug}", response_model=EngineResolved)
@router.get("/{slug}", response_model=EngineResolved)
def get_engine(
    slug: str,
    session: Session = Depends(get_session),
) -> EngineResolved:
    obj = _resolve_engine(slug, session)
    return _resolve_engine_read(obj, session)


@admin_router.patch("/{slug}", response_model=EngineResolved)
@router.patch("/{slug}", response_model=EngineResolved)
def update_engine(
    slug: str,
    engine_in: EngineUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> EngineResolved:
    obj = _resolve_engine(slug, session)

    update_data = model_dump(engine_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(obj, key, value)

    if any(key in update_data for key in ("constructor_id", "model_number", "tagged_name")):
        obj.slug = unique_slug(
            session, Engine, _engine_slug_base(obj, session), exclude_id=obj.id
        )

    session.add(obj)
    session.commit()
    session.refresh(obj)
    return _resolve_engine_read(obj, session)


@admin_router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_engine(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    obj = _resolve_engine(slug, session)
    session.delete(obj)
    session.commit()
    return None
