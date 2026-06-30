import os
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session, SQLModel, select

from app.core.auth import require_role
from app.core.slug import slugify_text, unique_slug
from app.database import get_readonly_session, get_session
from app.models.user import User, UserRole
from app.models.car import Car, CarCreate, CarResolved, CarUpdate
from app.models.constructor import Constructor
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.championship import Championship
from app.models.engine import Engine, EngineResolved
from app.models.season import Season
from app.models.session import Session as EventSession, SessionType
from app.models.session_result import SessionResult
from app.models.driver_standing import DriverStanding
from app.utils import model_dump
from sqlalchemy import and_, case, func

router = APIRouter(prefix="/cars", tags=["cars"])
public_router = APIRouter(prefix="/v1/cars", tags=["cars"])
admin_router = APIRouter(
    prefix="/api/admin/cars",
    tags=["cars"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)

F1_DRIVER_CHAMPIONSHIP = "f1_driver_world"
F1_CONSTRUCTOR_CHAMPIONSHIP = "f1_constructor_world"
STANDING_TYPE_DRIVER = "DRIVER"
STANDING_TYPE_CONSTRUCTOR = "CONSTRUCTOR"

CAR_IMAGE_BASE_URL = os.getenv("CAR_IMAGE_BASE_URL", "/static/uploads/cars")
CAR_IMAGE_DIR = Path(
    os.getenv(
        "CAR_IMAGE_DIR",
        Path(__file__).resolve().parents[1] / "static" / "uploads" / "cars",
    )
)
MAX_IMAGE_BYTES = int(os.getenv("CAR_IMAGE_MAX_BYTES", str(5 * 1024 * 1024)))
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}




def _resolve_cars(cars: list[Car], session: Session) -> list[CarResolved]:
    car_ids = [car.id for car in cars if car.id is not None]
    constructor_ids = {car.constructor_id for car in cars if car.constructor_id}
    engine_ids = {car.engine_id for car in cars if car.engine_id}
    engines = (
        session.exec(select(Engine).where(Engine.id.in_(engine_ids))).all()
        if engine_ids
        else []
    )
    engine_constructor_ids = {
        engine.constructor_id for engine in engines if engine.constructor_id
    }
    all_constructor_ids = constructor_ids | engine_constructor_ids
    constructors = (
        session.exec(
            select(Constructor).where(Constructor.id.in_(all_constructor_ids))
        ).all()
        if all_constructor_ids
        else []
    )
    constructor_map = {constructor.id: constructor for constructor in constructors}
    engine_map = {
        engine.id: EngineResolved(
            **model_dump(engine),
            constructor=constructor_map.get(engine.constructor_id),
        )
        for engine in engines
    }
    entry_counts = {}
    wins_counts = {}
    first_last_years = {}
    world_driver_counts = {}
    world_constructor_counts = {}
    if car_ids:
        entry_counts = dict(
            session.exec(
                select(EventEntry.car_id, func.count())
                .join(Event, Event.id == EventEntry.event_id)
                .where(
                    EventEntry.car_id.in_(car_ids),
                    ~Event.event_name.ilike("%Pre-Season Testing%"),
                    # Exclude substitute entries (shared car) from entry counts.
                    EventEntry.substitute_entry_id.is_(None),
                )
                .group_by(EventEntry.car_id)
            ).all()
        )
        year_expr = func.extract("year", Event.event_date)
        first_last_years = {
            row[0]: (row[1], row[2])
            for row in session.exec(
                select(
                    EventEntry.car_id,
                    func.min(year_expr),
                    func.max(year_expr),
                )
                .join(Event, Event.id == EventEntry.event_id)
                .where(EventEntry.car_id.in_(car_ids))
                .group_by(EventEntry.car_id)
            ).all()
        }
        wins_counts = dict(
            session.exec(
                select(
                    EventEntry.car_id,
                    func.coalesce(
                        func.sum(
                            case((SessionResult.position == "1", 1), else_=0)
                        ),
                        0,
                    ),
                )
                .join(SessionResult, SessionResult.entry_id == EventEntry.id)
                .join(EventSession, EventSession.id == SessionResult.session_id)
                .where(
                    EventEntry.car_id.in_(car_ids),
                    EventSession.type == SessionType.RACE,
                )
                .group_by(EventEntry.car_id)
            ).all()
        )
        driver_seasons = (
            select(
                EventEntry.car_id.label("car_id"),
                Season.id.label("season_id"),
                EventEntry.driver_id.label("driver_id"),
            )
            .join(Event, Event.id == EventEntry.event_id)
            .join(Season, Season.short_name == Event.season_short_name)
            .join(EventChampionship, EventChampionship.event_id == Event.id)
            .join(Championship, Championship.id == EventChampionship.championship_id)
            .where(
                EventEntry.car_id.in_(car_ids),
                Championship.short_name == F1_DRIVER_CHAMPIONSHIP,
                EventEntry.driver_id.is_not(None),
            )
            .distinct()
            .subquery()
        )
        world_driver_counts = dict(
            session.exec(
                select(
                    driver_seasons.c.car_id,
                    func.count(func.distinct(driver_seasons.c.season_id)),
                )
                .join(
                    DriverStanding,
                    and_(
                        DriverStanding.season_id == driver_seasons.c.season_id,
                        DriverStanding.driver_id == driver_seasons.c.driver_id,
                        DriverStanding.standing_type == STANDING_TYPE_DRIVER,
                        DriverStanding.position == "1",
                    ),
                )
                .group_by(driver_seasons.c.car_id)
            ).all()
        )
        constructor_seasons = (
            select(
                EventEntry.car_id.label("car_id"),
                Season.id.label("season_id"),
                Car.constructor_id.label("constructor_id"),
            )
            .join(Car, Car.id == EventEntry.car_id)
            .join(Event, Event.id == EventEntry.event_id)
            .join(Season, Season.short_name == Event.season_short_name)
            .join(EventChampionship, EventChampionship.event_id == Event.id)
            .join(Championship, Championship.id == EventChampionship.championship_id)
            .where(
                EventEntry.car_id.in_(car_ids),
                Championship.short_name == F1_CONSTRUCTOR_CHAMPIONSHIP,
                Car.constructor_id.is_not(None),
            )
            .distinct()
            .subquery()
        )
        world_constructor_counts = dict(
            session.exec(
                select(
                    constructor_seasons.c.car_id,
                    func.count(func.distinct(constructor_seasons.c.season_id)),
                )
                .join(
                    DriverStanding,
                    and_(
                        DriverStanding.season_id == constructor_seasons.c.season_id,
                        DriverStanding.constructor_id
                        == constructor_seasons.c.constructor_id,
                        DriverStanding.standing_type == STANDING_TYPE_CONSTRUCTOR,
                        DriverStanding.position == "1",
                    ),
                )
                .group_by(constructor_seasons.c.car_id)
            ).all()
        )
    return [
        CarResolved(
            **model_dump(car),
            constructor=constructor_map.get(car.constructor_id),
            engine=engine_map.get(car.engine_id),
            event_entry_count=int(entry_counts.get(car.id, 0)),
            first_run_year=(
                int(first_last_years.get(car.id, (None, None))[0])
                if first_last_years.get(car.id, (None, None))[0] is not None
                else None
            ),
            last_run_year=(
                int(first_last_years.get(car.id, (None, None))[1])
                if first_last_years.get(car.id, (None, None))[1] is not None
                else None
            ),
            wins_count=int(wins_counts.get(car.id, 0)),
            world_driver_entries=int(world_driver_counts.get(car.id, 0)),
            world_constructor_entries=int(world_constructor_counts.get(car.id, 0)),
        )
        for car in cars
    ]


def _resolve_car(car: Car, session: Session) -> CarResolved:
    return _resolve_cars([car], session)[0]


def _car_slug_base(car: Car, session: Session) -> str:
    constructor = (
        session.get(Constructor, car.constructor_id) if car.constructor_id else None
    )
    return slugify_text(
        constructor.name if constructor else "", car.chassis_name or ""
    )


def _resolve_car_by_slug(slug: str, session: Session) -> Car:
    obj = session.exec(select(Car).where(Car.slug == slug)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Car not found")
    return obj


def _local_image_path(image_url: str | None) -> Path | None:
    if not image_url:
        return None
    base = CAR_IMAGE_BASE_URL.rstrip("/")
    if not image_url.startswith(base):
        return None
    relative = image_url[len(base) :].lstrip("/")
    if not relative:
        return None
    resolved = (CAR_IMAGE_DIR / relative).resolve()
    if not resolved.is_relative_to(CAR_IMAGE_DIR.resolve()):
        return None
    return resolved


@admin_router.post("", response_model=CarResolved, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=CarResolved, status_code=status.HTTP_201_CREATED)
def create_car(
    car_in: CarCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> CarResolved:
    car = Car(**model_dump(car_in))
    car.slug = unique_slug(session, Car, _car_slug_base(car, session))
    session.add(car)
    session.commit()
    session.refresh(car)
    return _resolve_car(car, session)


def _list_cars(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CarResolved]:
    statement = (
        select(Car)
        
        .offset(offset)
        .limit(limit)
    )
    cars = session.exec(statement).all()
    return _resolve_cars(cars, session)

@public_router.get("", response_model=list[CarResolved])
def list_cars_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CarResolved]:
    return _list_cars(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[CarResolved])
@router.get("", response_model=list[CarResolved])
def list_cars(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CarResolved]:
    return _list_cars(offset=offset, limit=limit, session=session)

def _get_car_stats(session: Session) -> dict:
    total = (
        session.exec(
            select(func.count()).select_from(Car)
        ).first()
        or 0
    )
    top_constructor = session.exec(
        select(Constructor.name, func.count(Car.id))
        .join(Car, Car.constructor_id == Constructor.id)
        
        .group_by(Constructor.name)
        .order_by(func.count(Car.id).desc())
        .limit(1)
    ).first()

    return {
        "total": int(total or 0),
        "top_constructor": top_constructor[0] if top_constructor else None,
        "top_constructor_count": int(top_constructor[1]) if top_constructor else None,
    }


@public_router.get("/stats")
def get_car_stats_public(
    session: Session = Depends(get_readonly_session),
) -> dict:
    return _get_car_stats(session)


@admin_router.get("/stats")
@router.get("/stats")
def get_car_stats(
    session: Session = Depends(get_session),
) -> dict:
    return _get_car_stats(session)


def _list_cars_by_name(
    session: Session,
    starts_with: str,
    offset: int,
    limit: int,
) -> list[CarResolved]:
    prefix = starts_with.strip().lower()
    statement = (
        select(Car)
        .where(
            Car.chassis_name.ilike(f"{prefix}%"),
        )
        .order_by(Car.chassis_name.asc())
        .offset(offset)
        .limit(limit)
    )
    cars = session.exec(statement).all()
    return _resolve_cars(cars, session)

@public_router.get("/by-name", response_model=list[CarResolved])
def list_cars_by_name_public(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CarResolved]:
    return _list_cars_by_name(
        starts_with=starts_with,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("/by-name", response_model=list[CarResolved])
@router.get("/by-name", response_model=list[CarResolved])
def list_cars_by_name(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CarResolved]:
    return _list_cars_by_name(
        starts_with=starts_with,
        offset=offset,
        limit=limit,
        session=session,
    )

def _search_cars(
    session: Session,
    q: str,
    offset: int,
    limit: int,
) -> list[CarResolved]:
    term = f"%{q.strip()}%"
    statement = (
        select(Car)
        .where(
            Car.chassis_name.ilike(term),
        )
        .order_by(Car.chassis_name.asc())
        .offset(offset)
        .limit(limit)
    )
    cars = session.exec(statement).all()
    return _resolve_cars(cars, session)

@public_router.get("/search", response_model=list[CarResolved])
def search_cars_public(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[CarResolved]:
    return _search_cars(q=q, offset=offset, limit=limit, session=session)


@admin_router.get("/search", response_model=list[CarResolved])
@router.get("/search", response_model=list[CarResolved])
def search_cars(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[CarResolved]:
    return _search_cars(q=q, offset=offset, limit=limit, session=session)

def _list_cars_by_season(
    session: Session,
    season_short_name: str,
) -> list[CarResolved]:
    statement = (
        select(Car)
        .join(EventEntry, EventEntry.car_id == Car.id)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season_short_name)
        .distinct()
        .order_by(Car.chassis_name.asc())
    )
    cars = session.exec(statement).all()
    return _resolve_cars(cars, session)


@public_router.get("/by-season", response_model=list[CarResolved])
def list_cars_by_season_public(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_readonly_session),
) -> list[CarResolved]:
    return _list_cars_by_season(session=session, season_short_name=season)


@admin_router.get("/by-season", response_model=list[CarResolved])
@router.get("/by-season", response_model=list[CarResolved])
def list_cars_by_season(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_session),
) -> list[CarResolved]:
    return _list_cars_by_season(session=session, season_short_name=season)


def _get_car(slug: str, session: Session) -> CarResolved:
    obj = _resolve_car_by_slug(slug, session)
    return _resolve_car(obj, session)


@public_router.get("/{slug}", response_model=CarResolved)
def get_car_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> CarResolved:
    return _get_car(slug, session)


@admin_router.get("/{slug}", response_model=CarResolved)
@router.get("/{slug}", response_model=CarResolved)
def get_car(
    slug: str,
    session: Session = Depends(get_session),
) -> CarResolved:
    return _get_car(slug, session)


from app.models.driver import Driver, DriverRead
from app.models.team import Team, TeamRead


class CarWinEntry(SQLModel):
    event_id: int
    event_slug: str | None = None
    event_name: str | None = None
    year: int
    driver: DriverRead | None = None
    team: TeamRead | None = None


def _get_car_wins(car_id: int, session: Session) -> list[CarWinEntry]:
    statement = (
        select(
            Event.id,
            Event.slug,
            Event.event_name,
            Event.event_date,
            Driver.id,
            Driver.slug,
            Driver.first_name,
            Driver.last_name,
            Driver.short_name,
            Driver.nationality,
            Team.id,
            Team.slug,
            Team.team_name,
            Team.short_name,
        )
        .select_from(SessionResult)
        .join(EventSession, EventSession.id == SessionResult.session_id)
        .join(EventEntry, EventEntry.id == SessionResult.entry_id)
        .join(Event, Event.id == EventEntry.event_id)
        .outerjoin(Driver, Driver.id == EventEntry.driver_id)
        .outerjoin(Team, Team.id == EventEntry.team_id)
        .where(
            EventEntry.car_id == car_id,
            EventSession.type == SessionType.RACE,
            SessionResult.position == "1",
        )
        .order_by(Event.event_date.desc())
    )
    rows = session.exec(statement).all()
    results = []
    for row in rows:
        (
            event_id, event_slug, event_name, event_date,
            driver_id, driver_slug, first_name, last_name, driver_short, driver_nat,
            team_id, team_slug, team_name, team_short,
        ) = row
        driver = None
        if driver_id:
            driver = DriverRead(
                id=driver_id,
                slug=driver_slug,
                first_name=first_name,
                last_name=last_name,
                short_name=driver_short,
                nationality=driver_nat,
            )
        team = None
        if team_id:
            team = TeamRead(
                id=team_id, slug=team_slug, team_name=team_name, short_name=team_short
            )
        results.append(CarWinEntry(
            event_id=event_id,
            event_slug=event_slug,
            event_name=event_name,
            year=event_date.year,
            driver=driver,
            team=team,
        ))
    return results


@public_router.get("/{slug}/wins", response_model=list[CarWinEntry])
def get_car_wins_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> list[CarWinEntry]:
    obj = _resolve_car_by_slug(slug, session)
    return _get_car_wins(obj.id, session)


def _list_cars_by_constructor(
    session: Session,
    constructor_id: int,
    offset: int,
    limit: int | None,
) -> list[CarResolved]:
    statement = (
        select(Car)
        .outerjoin(EventEntry, EventEntry.car_id == Car.id)
        .outerjoin(Event, Event.id == EventEntry.event_id)
        .where(Car.constructor_id == constructor_id)
        .group_by(Car.id)
        .order_by(
            func.max(func.extract("year", Event.event_date)).desc().nulls_last(),
            Car.chassis_name.asc(),
            Car.id.asc(),
        )
    )
    if offset:
        statement = statement.offset(offset)
    if limit is not None:
        statement = statement.limit(limit)
    cars = session.exec(statement).all()
    return _resolve_cars(cars, session)

@admin_router.patch("/{slug}", response_model=CarResolved)
@router.patch("/{slug}", response_model=CarResolved)
def update_car(
    slug: str,
    car_in: CarUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> CarResolved:
    obj = _resolve_car_by_slug(slug, session)

    update_data = model_dump(car_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(obj, key, value)

    if "constructor_id" in update_data or "chassis_name" in update_data:
        obj.slug = unique_slug(
            session, Car, _car_slug_base(obj, session), exclude_id=obj.id
        )

    session.add(obj)
    session.commit()
    session.refresh(obj)
    return _resolve_car(obj, session)


@admin_router.post("/{slug}/image", status_code=status.HTTP_201_CREATED)
@router.post("/{slug}/image", status_code=status.HTTP_201_CREATED)
async def upload_car_image(
    slug: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    car = _resolve_car_by_slug(slug, session)

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
    target_dir = CAR_IMAGE_DIR / str(car.id)
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid4().hex}.{ext}"
    target_path = target_dir / filename
    target_path.write_bytes(data)

    old_path = _local_image_path(car.image_url)
    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass

    image_url = f"{CAR_IMAGE_BASE_URL.rstrip('/')}/{car.id}/{filename}"
    car.image_url = image_url
    car.image_updated_at = datetime.utcnow()
    session.add(car)
    session.commit()
    session.refresh(car)

    return {"image_url": image_url}


@admin_router.delete("/{slug}/image", status_code=status.HTTP_204_NO_CONTENT)
@router.delete("/{slug}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_car_image(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> None:
    car = _resolve_car_by_slug(slug, session)

    old_path = _local_image_path(car.image_url)
    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass

    car.image_url = None
    car.image_updated_at = None
    session.add(car)
    session.commit()
    return None


@admin_router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_car(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    car = _resolve_car_by_slug(slug, session)

    session.delete(car)
    session.commit()
    return None
