from contextlib import asynccontextmanager
from pathlib import Path
import os

from fastapi import FastAPI, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.routers import (
    admin_api_keys_router,
    admin_car_router,
    admin_circuit_router,
    admin_circuit_version_router,
    admin_championship_router,
    admin_competition_router,
    admin_constructor_router,
    constructor_lineage_router,
    admin_constructor_lineage_router,
    admin_dotd_router,
    admin_penalty_router,
    admin_driver_router,
    admin_engine_router,
    admin_standing_router,
    admin_event_entry_router,
    admin_event_championship_router,
    admin_event_router,
    admin_reference_router,
    admin_regulatory_system_router,
    admin_scheduler_router,
    admin_season_router,
    admin_session_result_router,
    admin_session_router,
    admin_team_router,
    admin_tire_router,
    admin_stats_router,
    auth_router,
    public_championship_router,
    public_competition_router,
    public_country_router,
    csv_router,
    public_dotd_router,
    public_penalty_router,
    public_driver_router,
    public_standing_router,
    public_circuit_router,
    public_circuit_version_router,
    public_constructor_router,
    public_constructor_lineage_router,
    public_engine_router,
    public_event_championship_router,
    public_event_router,
    public_event_entry_router,
    public_reference_router,
    public_regulatory_system_router,
    public_season_router,
    public_session_result_router,
    public_session_router,
    public_stats_router,
    public_team_router,
    public_tire_router,
    public_car_router,
    public_chat_router,
)

# ---------------------------------------------------------------------------
# MCP Streamable HTTP setup (imported early so lifespan can reference it)
# ---------------------------------------------------------------------------
from mcp_server import mcp as _mcp_server  # noqa: E402
from mcp.server.fastmcp.server import StreamableHTTPASGIApp, StreamableHTTPSessionManager

_mcp_session_manager = StreamableHTTPSessionManager(app=_mcp_server._mcp_server)
_mcp_http_app = StreamableHTTPASGIApp(_mcp_session_manager)


@asynccontextmanager
async def lifespan(app):
    init_db()
    async with _mcp_session_manager.run():
        yield


app = FastAPI(
    title="F1 Stats Datahub API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)
PROD = os.getenv("PROD", "false").lower() == "true"
DOMAIN = os.getenv("DOMAIN", "localhost")

if PROD:
    allowed_origins=[
        f"https://{DOMAIN}",
        f"https://www.{DOMAIN}",
        f"https://claude.ai",
        f"https://app.claude.ai"
        ]    
else:
    allowed_origins = ["*"]

app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

STATIC_DIR = Path(__file__).resolve().parent / "static"
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

public_v1_openapi_schema: dict | None = None
public_latest_openapi_schema: dict | None = None
PUBLIC_V1_LATEST_PREFIXES = (
    "/cars",
    "/championships",
    "/circuits",
    "/circuit-versions",
    "/competitions",
    "/constructors",
    "/constructor-lineage-links",
    "/countries",
    "/driver-of-the-day",
    "/drivers",
    "/standings",
    "/engines",
    "/event-championships",
    "/event-entries",
    "/events",
    "/penalties",
    "/references",
    "/regulatory-systems",
    "/seasons",
    "/session-results",
    "/sessions",
    "/stats",
    "/teams",
    "/tires",
)


@app.get("/health")
def health():
    return {"status": "ok"}


def _get_public_v1_openapi_schema() -> dict:
    global public_v1_openapi_schema
    if public_v1_openapi_schema:
        return public_v1_openapi_schema

    public_routes = [
        route
        for route in app.routes
        if isinstance(route, APIRoute) and route.path.startswith("/v1/")
    ]
    public_v1_openapi_schema = get_openapi(
        title="Straight Line F1 Public API v1",
        version="1.0.0",
        description="Public read-only endpoints.",
        routes=public_routes,
    )
    return public_v1_openapi_schema


def _get_public_latest_openapi_schema() -> dict:
    global public_latest_openapi_schema
    if public_latest_openapi_schema:
        return public_latest_openapi_schema

    v1_schema = _get_public_v1_openapi_schema()
    latest_schema = dict(v1_schema)
    latest_schema["title"] = "Straight Line F1 Public API"
    latest_schema["paths"] = {
        path.replace("/v1/", "/", 1): value
        for path, value in (v1_schema.get("paths") or {}).items()
    }
    public_latest_openapi_schema = latest_schema
    return public_latest_openapi_schema


# ---------------------------------------------------------------------------
# API-key enforcement on /v1/ routes
# ---------------------------------------------------------------------------
from app.core.api_key_auth import make_api_key_middleware  # noqa: E402

REQUIRE_API_KEY = os.getenv(
    "REQUIRE_API_KEY", "true" if PROD else "false"
).lower() == "true"

_api_key_check = make_api_key_middleware(allowed_origins, REQUIRE_API_KEY)


@app.middleware("http")
async def public_latest_alias(request: Request, call_next):
    path = request.scope.get("path", "")
    method = request.method.upper()

    # Paths that skip both alias rewriting and API-key checks
    if (
        path.startswith("/admin/")
        or path.startswith("/static/")
        or path == "/health"
        or path in ("/sitemap.xml", "/robots.txt")
        or path in ("/docs", "/openapi.json")
        or path.startswith("/api/")
        or path.startswith("/sse")
        or path.startswith("/mcp")
        or path.startswith("/messages")
        or method not in {"GET", "HEAD", "OPTIONS"}
    ):
        return await call_next(request)

    # Already a /v1/ path — run API-key check, then proceed
    if path.startswith("/v1/"):
        return await _api_key_check(request, call_next)

    # Bare path alias: /drivers → /v1/drivers, then API-key check
    if any(
        path == prefix or path.startswith(f"{prefix}/")
        for prefix in PUBLIC_V1_LATEST_PREFIXES
    ):
        request.scope["path"] = f"/v1{path}"
        return await _api_key_check(request, call_next)

    return await call_next(request)


@app.get("/v1/openapi.json", include_in_schema=False)
def public_v1_openapi():
    return _get_public_v1_openapi_schema()


@app.get("/v1/docs", include_in_schema=False)
def public_v1_swagger_ui():
    return get_swagger_ui_html(
        openapi_url="/v1/openapi.json",
        title="Straight Line F1 Public API v1 Docs",
    )


@app.get("/openapi.json", include_in_schema=False)
def openapi_json():
    return _get_public_latest_openapi_schema()


@app.get("/docs", include_in_schema=False)
def swagger_ui():
    return get_swagger_ui_html(
        openapi_url="/openapi.json",
        title="Straight Line F1 Public API Docs",
    )


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap_xml():
    """Generate a fresh sitemap from the database.

    Reachable at the apex via the frontend nginx reverse-proxy. The middleware
    skip-list lets this bypass the API-key check (see ``public_latest_alias``).
    """
    from xml.sax.saxutils import escape
    from fastapi import Response
    from sqlmodel import Session, select

    from app.database import readonly_engine
    from app.models import Car, Circuit, Constructor, Driver, Engine, Event, Season, Team

    origin = f"https://{DOMAIN}".rstrip("/")

    # Static + hub URLs.
    paths: list[str] = [
        "/",
        "/about",
        "/methodology",
        "/changelog",
        "/docs",
        "/legal/disclaimer",
        "/legal/privacy",
        "/seasons",
        "/drivers",
        "/teams",
        "/circuits",
        "/constructors",
        "/cars",
        "/engines",
        "/stats/global",
        "/stats/drivers",
        "/stats/constructors",
    ]

    # Dynamic detail URLs. Reference entities are keyed by their public slug;
    # events are nested under their season as /seasons/<year>/events/<slug>.
    slug_models = [
        ("/drivers", Driver),
        ("/teams", Team),
        ("/circuits", Circuit),
        ("/constructors", Constructor),
        ("/cars", Car),
        ("/engines", Engine),
    ]
    with Session(readonly_engine) as session:
        for prefix, model in slug_models:
            for slug in session.exec(select(model.slug)).all():
                if slug:
                    paths.append(f"{prefix}/{slug}")
        for year in session.exec(select(Season.year)).all():
            if year is not None:
                paths.append(f"/seasons/{year}")
        # Events: join season for the year segment.
        for event_slug, year in session.exec(
            select(Event.slug, Season.year).join(
                Season, Season.short_name == Event.season_short_name
            )
        ).all():
            if event_slug and year is not None:
                paths.append(f"/seasons/{year}/events/{event_slug}")

    urls = "".join(
        f"<url><loc>{escape(origin + p)}</loc></url>" for p in paths
    )
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        f"{urls}</urlset>"
    )
    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Cache-Control": "public, max-age=3600"},
    )


app.include_router(admin_api_keys_router)
app.include_router(public_dotd_router)
app.include_router(admin_dotd_router)
app.include_router(public_penalty_router)
app.include_router(admin_penalty_router)
app.include_router(public_driver_router)
app.include_router(admin_driver_router)
app.include_router(auth_router)
app.include_router(public_standing_router)
app.include_router(admin_standing_router)
app.include_router(public_engine_router)
app.include_router(admin_engine_router)
app.include_router(public_circuit_router)
app.include_router(admin_circuit_router)
app.include_router(public_circuit_version_router)
app.include_router(admin_circuit_version_router)
app.include_router(public_constructor_router)
app.include_router(admin_constructor_router)
app.include_router(constructor_lineage_router)
app.include_router(public_constructor_lineage_router)
app.include_router(admin_constructor_lineage_router)
app.include_router(public_car_router)
app.include_router(admin_car_router)
app.include_router(public_championship_router)
app.include_router(admin_championship_router)
app.include_router(public_competition_router)
app.include_router(admin_competition_router)
app.include_router(public_country_router)
app.include_router(public_season_router)
app.include_router(admin_season_router)
app.include_router(admin_scheduler_router)
app.include_router(public_event_router)
app.include_router(admin_event_router)
app.include_router(public_event_entry_router)
app.include_router(admin_event_entry_router)
app.include_router(public_event_championship_router)
app.include_router(admin_event_championship_router)
app.include_router(public_session_router)
app.include_router(admin_session_router)
app.include_router(public_session_result_router)
app.include_router(admin_session_result_router)
app.include_router(public_stats_router)
app.include_router(admin_stats_router)
app.include_router(public_team_router)
app.include_router(admin_team_router)
app.include_router(public_regulatory_system_router)
app.include_router(admin_regulatory_system_router)
app.include_router(public_reference_router)
app.include_router(admin_reference_router)
app.include_router(public_tire_router)
app.include_router(admin_tire_router)
app.include_router(csv_router)
app.include_router(public_chat_router)

# ---------------------------------------------------------------------------
# Mount MCP transports — Traefik routes mcp.{DOMAIN} here.
#   Streamable HTTP: POST /mcp    (newer clients)
#   SSE:             GET  /sse + POST /messages  (Claude.ai remote MCP)
# ---------------------------------------------------------------------------
from starlette.routing import Route

app.routes.append(Route("/mcp", endpoint=_mcp_http_app))
app.mount("/", _mcp_server.sse_app())

if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
