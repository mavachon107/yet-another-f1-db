from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
import sqlalchemy as sa
from sqlalchemy import case, func
from sqlmodel import Session, select

from app.core.auth import require_role
from app.core.slug import slugify_text, unique_slug
from app.database import get_readonly_session, get_session
from app.models.constructor import Constructor
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.session import Session as EventSession, SessionType
from app.models.session_result import SessionResult
from app.models.team import (
    Team,
    TeamCreate,
    TeamRead,
    TeamUpdate,
)
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/teams", tags=["teams"])
public_router = APIRouter(prefix="/v1/teams", tags=["teams"])
admin_router = APIRouter(
    prefix="/api/admin/teams",
    tags=["teams"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)




def _compute_year_periods(years: list[int]) -> list[list[int]]:
    """Turn a sorted list of years into contiguous [start, end] ranges."""
    if not years:
        return []
    periods = []
    start = years[0]
    prev = years[0]
    for y in years[1:]:
        if y == prev + 1:
            prev = y
        else:
            periods.append([start, prev])
            start = y
            prev = y
    periods.append([start, prev])
    return periods


def _resolve_teams(teams: list[Team], session: Session) -> list[TeamRead]:
    team_ids = [team.id for team in teams if team.id is not None]
    entry_counts = {}
    wins_counts = {}
    first_last_years = {}
    team_years: dict[int, list[int]] = {}
    constructor_info: dict[int, tuple[str, str]] = {}
    if team_ids:
        entry_counts = dict(
            session.exec(
                select(EventEntry.team_id, func.count())
                .where(EventEntry.team_id.in_(team_ids))
                .group_by(EventEntry.team_id)
            ).all()
        )
        year_expr = func.extract("year", Event.event_date)
        first_last_years = {
            row[0]: (row[1], row[2])
            for row in session.exec(
                select(
                    EventEntry.team_id,
                    func.min(year_expr),
                    func.max(year_expr),
                )
                .join(Event, Event.id == EventEntry.event_id)
                .where(EventEntry.team_id.in_(team_ids))
                .group_by(EventEntry.team_id)
            ).all()
        }
        wins_counts = dict(
            session.exec(
                select(
                    EventEntry.team_id,
                    func.coalesce(
                        func.sum(case((SessionResult.position == "1", 1), else_=0)),
                        0,
                    ),
                )
                .join(SessionResult, SessionResult.entry_id == EventEntry.id)
                .join(EventSession, EventSession.id == SessionResult.session_id)
                .where(
                    EventEntry.team_id.in_(team_ids),
                    EventSession.type == SessionType.RACE,
                )
                .group_by(EventEntry.team_id)
            ).all()
        )
        # Distinct years per team for period detection
        year_expr = func.extract("year", Event.event_date).cast(sa.Integer)
        rows = session.exec(
            select(EventEntry.team_id, year_expr)
            .join(Event, Event.id == EventEntry.event_id)
            .where(EventEntry.team_id.in_(team_ids))
            .group_by(EventEntry.team_id, year_expr)
            .order_by(EventEntry.team_id, year_expr)
        ).all()
        for tid, year in rows:
            team_years.setdefault(tid, []).append(int(year))
        # Resolve constructor name + slug for teams that have a constructor
        constructor_ids = {
            team.constructor_id for team in teams if team.constructor_id
        }
        if constructor_ids:
            for cid, cname, cslug in session.exec(
                select(Constructor.id, Constructor.name, Constructor.slug)
                .where(Constructor.id.in_(constructor_ids))
            ).all():
                constructor_info[cid] = (cname, cslug)
    result = []
    for team in teams:
        periods = _compute_year_periods(team_years.get(team.id, []))
        base = model_dump(team)
        entry_count = int(entry_counts.get(team.id, 0))
        wins = int(wins_counts.get(team.id, 0))
        cinfo = (
            constructor_info.get(team.constructor_id)
            if team.constructor_id
            else None
        )
        cname = cinfo[0] if cinfo else None
        cslug = cinfo[1] if cinfo else None
        if len(periods) <= 1:
            fl = first_last_years.get(team.id, (None, None))
            result.append(TeamRead(
                **base,
                event_entry_count=entry_count,
                first_run_year=int(fl[0]) if fl[0] is not None else None,
                last_run_year=int(fl[1]) if fl[1] is not None else None,
                wins_count=wins,
                constructor_name=cname,
                constructor_slug=cslug,
            ))
        else:
            for start, end in periods:
                result.append(TeamRead(
                    **base,
                    event_entry_count=entry_count,
                    first_run_year=start,
                    last_run_year=end,
                    wins_count=wins,
                    constructor_name=cname,
                    constructor_slug=cslug,
                ))
    return result


def _resolve_team(slug: str, session: Session) -> Team:
    obj = session.exec(select(Team).where(Team.slug == slug)).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Team not found")
    return obj


@admin_router.post("", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=TeamRead, status_code=status.HTTP_201_CREATED)
def create_team(
    team_in: TeamCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> TeamRead:
    team = Team(**model_dump(team_in))
    team.slug = unique_slug(session, Team, slugify_text(team.team_name))
    session.add(team)
    session.commit()
    session.refresh(team)
    return team


@public_router.get("", response_model=list[TeamRead])
def list_teams_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[TeamRead]:
    return list_teams(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[TeamRead])
@router.get("", response_model=list[TeamRead])
def list_teams(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[TeamRead]:
    statement = (
        select(Team)
        
        .offset(offset)
        .limit(limit)
    )
    teams = session.exec(statement).all()
    return _resolve_teams(teams, session)


@public_router.get("/stats")
def get_team_stats_public(
    session: Session = Depends(get_readonly_session),
) -> dict:
    return get_team_stats(session=session)


@admin_router.get("/stats")
@router.get("/stats")
def get_team_stats(
    session: Session = Depends(get_session),
) -> dict:
    total = (
        session.exec(
            select(func.count()).select_from(Team)
        ).first()
        or 0
    )
    return {
        "total": int(total or 0),
    }


@public_router.get("/by-name", response_model=list[TeamRead])
def list_teams_by_name_public(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[TeamRead]:
    return list_teams_by_name(
        starts_with=starts_with,
        offset=offset,
        limit=limit,
        session=session,
    )


@admin_router.get("/by-name", response_model=list[TeamRead])
@router.get("/by-name", response_model=list[TeamRead])
def list_teams_by_name(
    starts_with: str = Query(..., min_length=1, max_length=1),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[TeamRead]:
    prefix = starts_with.strip().lower()
    statement = (
        select(Team)
        .where(Team.team_name.ilike(f"{prefix}%"))
        .order_by(Team.team_name.asc(), Team.short_name.asc())
        .offset(offset)
        .limit(limit)
    )
    teams = session.exec(statement).all()
    return _resolve_teams(teams, session)


@public_router.get("/search", response_model=list[TeamRead])
def search_teams_public(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[TeamRead]:
    return search_teams(q=q, offset=offset, limit=limit, session=session)


@admin_router.get("/search", response_model=list[TeamRead])
@router.get("/search", response_model=list[TeamRead])
def search_teams(
    q: str = Query(..., min_length=1, max_length=200),
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[TeamRead]:
    term = f"%{q.strip()}%"
    statement = (
        select(Team)
        .where(
            Team.team_name.ilike(term) | Team.short_name.ilike(term),
        )
        .order_by(Team.team_name.asc(), Team.short_name.asc())
        .offset(offset)
        .limit(limit)
    )
    teams = session.exec(statement).all()
    return _resolve_teams(teams, session)


def _list_teams_by_season(
    session: Session,
    season_short_name: str,
) -> list[TeamRead]:
    statement = (
        select(Team)
        .join(EventEntry, EventEntry.team_id == Team.id)
        .join(Event, Event.id == EventEntry.event_id)
        .where(Event.season_short_name == season_short_name)
        .distinct()
        .order_by(Team.team_name.asc())
    )
    teams = session.exec(statement).all()
    return _resolve_teams(teams, session)


@public_router.get("/by-season", response_model=list[TeamRead])
def list_teams_by_season_public(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_readonly_session),
) -> list[TeamRead]:
    return _list_teams_by_season(session=session, season_short_name=season)


@admin_router.get("/by-season", response_model=list[TeamRead])
@router.get("/by-season", response_model=list[TeamRead])
def list_teams_by_season(
    season: str = Query(..., min_length=1, max_length=32),
    session: Session = Depends(get_session),
) -> list[TeamRead]:
    return _list_teams_by_season(session=session, season_short_name=season)


@public_router.get("/{slug}", response_model=TeamRead)
def get_team_public(
    slug: str,
    session: Session = Depends(get_readonly_session),
) -> TeamRead:
    return get_team(slug=slug, session=session)


@admin_router.get("/{slug}", response_model=TeamRead)
@router.get("/{slug}", response_model=TeamRead)
def get_team(
    slug: str,
    session: Session = Depends(get_session),
) -> TeamRead:
    obj = _resolve_team(slug, session)
    return _resolve_teams([obj], session)[0]


@admin_router.patch("/{slug}", response_model=TeamRead)
@router.patch("/{slug}", response_model=TeamRead)
def update_team(
    slug: str,
    team_in: TeamUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> TeamRead:
    obj = _resolve_team(slug, session)

    update_data = model_dump(team_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(obj, key, value)

    # Regenerate the URL slug when the team name changes.
    if "team_name" in update_data:
        obj.slug = unique_slug(
            session, Team, slugify_text(obj.team_name), exclude_id=obj.id
        )

    session.add(obj)
    session.commit()
    session.refresh(obj)
    return obj


@admin_router.delete(
    "/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    slug: str,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    obj = _resolve_team(slug, session)

    session.delete(obj)
    session.commit()
    return None
