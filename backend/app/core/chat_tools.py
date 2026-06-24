"""Shared tool definitions and executor for the AI chatbot.

This module is designed to be reusable by both the in-app chat endpoint
(via Claude API tool_use) and a future MCP server.
"""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import cast, func, String
from sqlmodel import Session, select

from app.models.car import Car
from app.models.championship import Championship
from app.models.circuit import Circuit
from app.models.constructor import Constructor
from app.models.driver import Driver
from app.models.driver_standing import DriverStanding
from app.models.engine import Engine
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.event_championship import EventChampionship
from app.models.season import Season
from app.models.session import Session as EventSession, SessionType
from app.models.session_result import SessionResult
from app.models.team import Team


# ---------------------------------------------------------------------------
# Tool definitions (format-agnostic: used by both Claude API and MCP)
# ---------------------------------------------------------------------------

TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_driver",
        "description": "Search for a driver by name. Returns matching drivers with their ID, name, nationality, and date of birth.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Driver name or partial name"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_driver_stats",
        "description": "Get career statistics for a driver: starts, wins, poles, podiums, years active, first and last event.",
        "input_schema": {
            "type": "object",
            "properties": {
                "driver_id": {"type": "integer", "description": "The driver's database ID (get from search_driver first)"},
            },
            "required": ["driver_id"],
        },
    },
    {
        "name": "get_driver_wins",
        "description": "Get the list of all race wins for a driver, with event name, year, team, and car.",
        "input_schema": {
            "type": "object",
            "properties": {
                "driver_id": {"type": "integer"},
            },
            "required": ["driver_id"],
        },
    },
    {
        "name": "get_all_driver_win_counts",
        "description": "Get all drivers ranked by number of F1 race wins. Returns driver name and win count.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_all_driver_pole_counts",
        "description": "Get all drivers ranked by number of F1 pole positions. Returns driver name and pole count.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "search_circuit",
        "description": "Search for a circuit by name or location.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Circuit name or partial name"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_season_events",
        "description": "Get all events (races) for a given season year, ordered by date.",
        "input_schema": {
            "type": "object",
            "properties": {
                "year": {"type": "integer", "description": "The season year, e.g. 1994"},
            },
            "required": ["year"],
        },
    },
    {
        "name": "get_race_results",
        "description": "Get race results for a specific event. Returns finishing positions, driver names, teams, and points.",
        "input_schema": {
            "type": "object",
            "properties": {
                "event_id": {"type": "integer", "description": "The event's database ID"},
            },
            "required": ["event_id"],
        },
    },
    {
        "name": "get_standings_by_season",
        "description": "Get final championship standings for a season. Use standing_type DRIVER or CONSTRUCTOR.",
        "input_schema": {
            "type": "object",
            "properties": {
                "season_id": {"type": "integer", "description": "The season's database ID"},
                "standing_type": {
                    "type": "string",
                    "enum": ["DRIVER", "CONSTRUCTOR"],
                    "description": "Type of standing",
                },
            },
            "required": ["season_id", "standing_type"],
        },
    },
    {
        "name": "search_constructor",
        "description": "Search for a constructor (car manufacturer) by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "search_team",
        "description": "Search for a team by name.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_overview_stats",
        "description": "Get overall database counts: total seasons, events, circuits, drivers, teams.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_season_champions",
        "description": "Get the world champion driver and constructor for every season.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_constructor_stats",
        "description": "Get career statistics for a constructor: starts, wins, poles, podiums, first and last event.",
        "input_schema": {
            "type": "object",
            "properties": {
                "constructor_id": {"type": "integer"},
            },
            "required": ["constructor_id"],
        },
    },
    {
        "name": "list_seasons",
        "description": "List all available seasons with their year and ID. Useful for finding a season_id from a year.",
        "input_schema": {
            "type": "object",
            "properties": {},
        },
    },
]


# ---------------------------------------------------------------------------
# Tool executor
# ---------------------------------------------------------------------------


def execute_tool(tool_name: str, tool_input: dict, session: Session) -> Any:
    """Execute a tool and return the result as a JSON-serializable value."""
    handler = _HANDLERS.get(tool_name)
    if handler is None:
        return {"error": f"Unknown tool: {tool_name}"}
    try:
        return handler(tool_input, session)
    except Exception as exc:
        return {"error": str(exc)}


# ---------------------------------------------------------------------------
# Individual tool handlers
# ---------------------------------------------------------------------------


def _search_driver(inp: dict, session: Session) -> list[dict]:
    q = inp["query"]
    term = f"%{q.strip()}%"
    rows = session.exec(
        select(Driver)
        .where(Driver.first_name.ilike(term) | Driver.last_name.ilike(term))
        .order_by(Driver.last_name.asc())
        .limit(10)
    ).all()
    return [
        {
            "id": d.id,
            "first_name": d.first_name,
            "last_name": d.last_name,
            "nationality": d.nationality,
            "dob": str(d.dob) if d.dob else None,
        }
        for d in rows
    ]


def _get_driver_stats(inp: dict, session: Session) -> dict:
    from app.routers.driver import _get_driver_stats_by_id

    stats = _get_driver_stats_by_id(inp["driver_id"], session)
    return stats.model_dump()


def _get_driver_wins(inp: dict, session: Session) -> list[dict]:
    from app.routers.driver import _get_driver_wins as _wins

    wins = _wins(inp["driver_id"], session)
    return [w.model_dump() for w in wins]


def _get_all_driver_win_counts(inp: dict, session: Session) -> list[dict]:
    from app.routers.driver import _driver_counts_by_session_type

    counts = _driver_counts_by_session_type(session, SessionType.RACE)
    return [c.model_dump() for c in counts]


def _get_all_driver_pole_counts(inp: dict, session: Session) -> list[dict]:
    from app.routers.driver import _driver_counts_by_session_type

    # Poles are counted from the qualifying grid (grid_position == 1) so grid
    # penalties are reflected, not the qualifying classification.
    counts = _driver_counts_by_session_type(
        session, SessionType.QUALI, SessionResult.grid_position
    )
    return [c.model_dump() for c in counts]


def _search_circuit(inp: dict, session: Session) -> list[dict]:
    q = inp["query"]
    term = f"%{q.strip()}%"
    rows = session.exec(
        select(Circuit)
        .where(Circuit.name.ilike(term) | Circuit.short_name.ilike(term))
        .order_by(Circuit.name.asc())
        .limit(10)
    ).all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "short_name": c.short_name,
            "city": c.city,
            "country": c.country,
        }
        for c in rows
    ]


def _get_season_events(inp: dict, session: Session) -> list[dict]:
    year = inp["year"]
    season = session.exec(select(Season).where(Season.year == year)).first()
    if not season:
        return {"error": f"No season found for year {year}"}
    events = session.exec(
        select(Event)
        .where(Event.season_short_name == season.short_name)
        .order_by(Event.event_date.asc())
    ).all()
    return [
        {
            "id": e.id,
            "name": e.event_name,
            "event_date": str(e.event_date) if e.event_date else None,
            "round": e.round,
            "laps": e.laps,
        }
        for e in events
    ]


def _get_race_results(inp: dict, session: Session) -> list[dict]:
    event_id = inp["event_id"]
    # Find the race session for this event
    race_session = session.exec(
        select(EventSession)
        .where(EventSession.event_id == event_id)
        .where(EventSession.type == SessionType.RACE)
    ).first()
    if not race_session:
        return {"error": f"No race session found for event {event_id}"}

    results = session.exec(
        select(SessionResult)
        .where(SessionResult.session_id == race_session.id)
        .where(SessionResult.position != "FL")
    ).all()

    # Resolve entry info
    entry_ids = {r.entry_id for r in results}
    entries = {
        e.id: e
        for e in session.exec(
            select(EventEntry).where(EventEntry.id.in_(entry_ids))
        ).all()
    }
    driver_ids = {e.driver_id for e in entries.values() if e.driver_id}
    drivers = {
        d.id: d
        for d in session.exec(
            select(Driver).where(Driver.id.in_(driver_ids))
        ).all()
    } if driver_ids else {}
    team_ids = {e.team_id for e in entries.values() if e.team_id}
    teams = {
        t.id: t
        for t in session.exec(
            select(Team).where(Team.id.in_(team_ids))
        ).all()
    } if team_ids else {}

    out = []
    for r in results:
        entry = entries.get(r.entry_id)
        driver = drivers.get(entry.driver_id) if entry else None
        team = teams.get(entry.team_id) if entry else None
        out.append({
            "position": r.position,
            "driver_id": driver.id if driver else None,
            "driver": f"{driver.first_name} {driver.last_name}" if driver else None,
            "team_id": team.id if team else None,
            "team": team.team_name if team else None,
            "points": r.points,
            "time": r.time,
            "gap": r.gap,
            "laps": r.laps,
            "grid": r.grid_position,
        })

    # Sort by position (numeric first, then text)
    def pos_key(item):
        try:
            return (0, int(item["position"]))
        except (ValueError, TypeError):
            return (1, item["position"] or "")

    out.sort(key=pos_key)
    return out


def _get_standings_by_season(inp: dict, session: Session) -> list[dict]:
    season_id = inp["season_id"]
    standing_type = inp["standing_type"]
    standings = session.exec(
        select(DriverStanding)
        .where(DriverStanding.season_id == season_id)
        .where(DriverStanding.standing_type == standing_type)
        .where(DriverStanding.event_id.is_(None))
        .order_by(DriverStanding.position.asc())
    ).all()

    out = []
    for s in standings:
        row = {"position": s.position, "points": s.points}
        if standing_type == "DRIVER" and s.driver_id:
            driver = session.get(Driver, s.driver_id)
            row["driver"] = f"{driver.first_name} {driver.last_name}" if driver else None
        if s.constructor_id:
            constructor = session.get(Constructor, s.constructor_id)
            row["constructor"] = constructor.name if constructor else None
        out.append(row)
    return out


def _search_constructor(inp: dict, session: Session) -> list[dict]:
    q = inp["query"]
    term = f"%{q.strip()}%"
    rows = session.exec(
        select(Constructor)
        .where(Constructor.name.ilike(term) | Constructor.short_name.ilike(term))
        .order_by(Constructor.name.asc())
        .limit(10)
    ).all()
    return [
        {"id": c.id, "name": c.name, "short_name": c.short_name}
        for c in rows
    ]


def _search_team(inp: dict, session: Session) -> list[dict]:
    q = inp["query"]
    term = f"%{q.strip()}%"
    rows = session.exec(
        select(Team)
        .where(Team.team_name.ilike(term) | Team.short_name.ilike(term))
        .order_by(Team.team_name.asc())
        .limit(10)
    ).all()
    return [
        {"id": t.id, "team_name": t.team_name, "short_name": t.short_name}
        for t in rows
    ]


def _get_overview_stats(inp: dict, session: Session) -> dict:
    return {
        "seasons": session.exec(select(func.count()).select_from(Season)).first() or 0,
        "events": session.exec(select(func.count()).select_from(Event)).first() or 0,
        "circuits": session.exec(select(func.count()).select_from(Circuit)).first() or 0,
        "drivers": session.exec(select(func.count()).select_from(Driver)).first() or 0,
        "teams": session.exec(select(func.count()).select_from(Team)).first() or 0,
    }


def _get_season_champions(inp: dict, session: Session) -> list[dict]:
    from app.routers.stats import season_champions as _season_champions

    champions = _season_champions(session=session)
    out = []
    for c in champions:
        row: dict = {"season_id": c.season_id}
        if c.driver:
            row["driver"] = f"{c.driver.first_name} {c.driver.last_name}"
        if c.constructor:
            row["constructor"] = c.constructor.name
        out.append(row)
    return out


def _get_constructor_stats(inp: dict, session: Session) -> dict:
    from app.routers.constructor import _get_constructor_stats_by_id

    stats = _get_constructor_stats_by_id(inp["constructor_id"], session)
    return stats.model_dump()


def _list_seasons(inp: dict, session: Session) -> list[dict]:
    rows = session.exec(
        select(Season).order_by(Season.year.asc())
    ).all()
    return [{"id": s.id, "year": s.year, "short_name": s.short_name} for s in rows]


# ---------------------------------------------------------------------------
# Handler dispatch table
# ---------------------------------------------------------------------------

_HANDLERS = {
    "search_driver": _search_driver,
    "get_driver_stats": _get_driver_stats,
    "get_driver_wins": _get_driver_wins,
    "get_all_driver_win_counts": _get_all_driver_win_counts,
    "get_all_driver_pole_counts": _get_all_driver_pole_counts,
    "search_circuit": _search_circuit,
    "get_season_events": _get_season_events,
    "get_race_results": _get_race_results,
    "get_standings_by_season": _get_standings_by_season,
    "search_constructor": _search_constructor,
    "search_team": _search_team,
    "get_overview_stats": _get_overview_stats,
    "get_season_champions": _get_season_champions,
    "get_constructor_stats": _get_constructor_stats,
    "list_seasons": _list_seasons,
}
