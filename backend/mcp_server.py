"""
MCP server for Straight Line F1 — exposes F1 database tools via the Model Context Protocol.

Usage:
    python mcp_server.py                     # stdio transport (default, for Claude Desktop)
    python mcp_server.py --transport sse     # SSE transport (for web clients)

Claude Desktop config (~/.claude/claude_desktop_config.json):
    {
      "mcpServers": {
        "apex-f1": {
          "command": "/path/to/.venv/bin/python",
          "args": ["/path/to/backend/mcp_server.py"],
          "env": {
            "DATABASE_URL": "postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db"
          }
        }
      }
    }
"""

from __future__ import annotations

import json
import os
import sys

# Add backend/ to sys.path so app.* imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Load .env from the repo root if present
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from mcp.server.fastmcp import FastMCP
from sqlmodel import Session

from app.database import readonly_engine
from app.core.chat_tools import TOOLS, execute_tool

mcp = FastMCP(
    "Straight Line F1",
    instructions="Formula 1 historical data — search drivers, circuits, constructors, race results, standings, and statistics from 1950 to the present.",
)


def _run_tool(tool_name: str, tool_input: dict) -> str:
    """Execute a chat tool with a fresh DB session and return JSON."""
    with Session(readonly_engine) as session:
        result = execute_tool(tool_name, tool_input, session)
    return json.dumps(result, default=str, indent=2)


# ---------------------------------------------------------------------------
# Register each tool from chat_tools.TOOLS as an MCP tool
# ---------------------------------------------------------------------------

@mcp.tool(annotations={"readOnlyHint": True})
def search_driver(query: str) -> str:
    """Search for a driver by name. Returns matching drivers with their ID, name, nationality, and date of birth."""
    return _run_tool("search_driver", {"query": query})


@mcp.tool(annotations={"readOnlyHint": True})
def get_driver_stats(driver_id: int) -> str:
    """Get career statistics for a driver: starts, wins, poles, podiums, years active, first and last event."""
    return _run_tool("get_driver_stats", {"driver_id": driver_id})


@mcp.tool(annotations={"readOnlyHint": True})
def get_driver_wins(driver_id: int) -> str:
    """Get the list of all race wins for a driver, with event name, year, team, and car."""
    return _run_tool("get_driver_wins", {"driver_id": driver_id})


@mcp.tool(annotations={"readOnlyHint": True})
def get_all_driver_win_counts() -> str:
    """Get all drivers ranked by number of F1 race wins. Returns driver name and win count."""
    return _run_tool("get_all_driver_win_counts", {})


@mcp.tool(annotations={"readOnlyHint": True})
def get_all_driver_pole_counts() -> str:
    """Get all drivers ranked by number of F1 pole positions. Returns driver name and pole count."""
    return _run_tool("get_all_driver_pole_counts", {})


@mcp.tool(annotations={"readOnlyHint": True})
def search_circuit(query: str) -> str:
    """Search for a circuit by name or location."""
    return _run_tool("search_circuit", {"query": query})


@mcp.tool(annotations={"readOnlyHint": True})
def get_season_events(year: int) -> str:
    """Get all events (races) for a given season year, ordered by date."""
    return _run_tool("get_season_events", {"year": year})


@mcp.tool(annotations={"readOnlyHint": True})
def get_race_results(event_id: int) -> str:
    """Get race results for a specific event. Returns finishing positions, driver names, teams, and points."""
    return _run_tool("get_race_results", {"event_id": event_id})


@mcp.tool(annotations={"readOnlyHint": True})
def get_standings_by_season(season_id: int, standing_type: str) -> str:
    """Get final championship standings for a season. Use standing_type DRIVER or CONSTRUCTOR."""
    return _run_tool("get_standings_by_season", {"season_id": season_id, "standing_type": standing_type})


@mcp.tool(annotations={"readOnlyHint": True})
def search_constructor(query: str) -> str:
    """Search for a constructor (car manufacturer) by name."""
    return _run_tool("search_constructor", {"query": query})


@mcp.tool(annotations={"readOnlyHint": True})
def search_team(query: str) -> str:
    """Search for a team by name."""
    return _run_tool("search_team", {"query": query})


@mcp.tool(annotations={"readOnlyHint": True})
def get_overview_stats() -> str:
    """Get overall database counts: total seasons, events, circuits, drivers, teams."""
    return _run_tool("get_overview_stats", {})


@mcp.tool(annotations={"readOnlyHint": True})
def get_season_champions() -> str:
    """Get the world champion driver and constructor for every season."""
    return _run_tool("get_season_champions", {})


@mcp.tool(annotations={"readOnlyHint": True})
def get_constructor_stats(constructor_id: int) -> str:
    """Get career statistics for a constructor: starts, wins, poles, podiums, first and last event."""
    return _run_tool("get_constructor_stats", {"constructor_id": constructor_id})


@mcp.tool(annotations={"readOnlyHint": True})
def list_seasons() -> str:
    """List all available seasons with their year and ID. Useful for finding a season_id from a year."""
    return _run_tool("list_seasons", {})


if __name__ == "__main__":
    transport = "stdio"
    if "--transport" in sys.argv:
        idx = sys.argv.index("--transport")
        if idx + 1 < len(sys.argv):
            transport = sys.argv[idx + 1]

    mcp.run(transport=transport)
