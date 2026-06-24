# Yet another F1 Database

A historical Formula 1 database and web application covering every season from **1950 to the 
present**. It pairs a curated PostgreSQL dataset of drivers, teams, constructors,
circuits, cars, engines, race results and championship standings with three ways to
consume it:

- A **React web app** for browsing seasons, events, drivers, teams and stats dashboards.
- A **public read-only REST API** (OpenAPI/Swagger documented).
- An **MCP server** so AI assistants (Claude Desktop, Claude.ai) can query the data
  conversationally, plus a built-in chat widget powered by Claude.

The stack is a FastAPI backend (SQLModel + PostgreSQL) and a Vite/React frontend, all
wired together with Docker Compose.

This is the public repository version of the website https://f1statsdatahub.com

---

## The Data

The dataset lives in `data/` as one CSV per database table — a full export of the
PostgreSQL schema. You seed a fresh database by importing these files (see
[Installation](#installation)).

### Core entities

| Domain        | Tables (CSV)                                                                                 |
| ------------- | -------------------------------------------------------------------------------------------- |
| People & orgs | `driver`, `team`, `team_effective_period`, `constructor`, `constructor_lineage`              |
| Machinery     | `car`, `engine`, `tire`                                                                       |
| Venues        | `circuit`, `circuit_version`, `country`                                                       |
| Calendar      | `season`, `competition`, `event`, `event_entry`, `session`, `session_weather`                |
| Results       | `session_result`, `standing`, `driver_of_the_day`, `penalty`                                 |
| Championships | `championship`, `event_championship`                                                          |
| Rules         | `regulatory_system`, `season_point_system`, `point_system_definition`, `point_system_distance_rule` |
| Operational   | `user`, `refresh_token`, `api_key`, `user_preference`, `scheduler_job`, `scheduler_log`      |


The full relational model (primary keys, foreign keys, relationships) is documented as
a Mermaid ER diagram in [`docs/db-diagram.md`](docs/db-diagram.md).

### Data sources

- The bulk of the historical data is curated and stored in this repository's CSV exports.
- Recent/live sessions are kept up to date by the **OpenF1 scheduler** — a standalone
  process (`backend/app/scheduler/`) that periodically plans and fetches new session
  results around race weekends. It is **off by default** and enabled explicitly via a
  Docker Compose profile (see below).

---

## The APIs

The backend serves several API surfaces from a single FastAPI app.

### 1. Public REST API (read-only)

Versioned, read-only endpoints for all public entities. Available two ways:

- Versioned: `GET /v1/drivers`, `GET /v1/events`, `GET /v1/standings`, …
- Bare alias (latest): `GET /drivers`, `GET /events`, … (rewritten to `/v1/...`)

Resource groups include: `cars`, `championships`, `circuits`, `circuit-versions`,
`competitions`, `constructors`, `constructor-lineage-links`, `countries`,
`driver-of-the-day`, `drivers`, `standings`, `engines`, `event-championships`,
`event-entries`, `events`, `penalties`, `references`, `regulatory-systems`, `seasons`,
`session-results`, `sessions`, `stats`, `teams`, `tires`.

**Interactive docs (Swagger UI):**

- `GET /docs` — latest public API
- `GET /v1/docs` — v1 public API
- `GET /openapi.json`, `GET /v1/openapi.json` — raw OpenAPI schemas

**API keys:** In production the `/v1/` (and aliased) routes require an API key. In
development this is disabled by default (`REQUIRE_API_KEY=false`). Keys are managed via
the admin API and the `api_key` table.

### 2. Admin API (authenticated)

Full CRUD over every entity under `/admin/...`, protected by JWT authentication
(`/auth/login`, refresh tokens). Used by the web app's admin/editor surfaces. Create the
first admin user with `scripts/create_admin.py` (see below). There is also a CSV
import/export router (`/csv`).

### 3. MCP server (for AI assistants)

The same data is exposed over the **Model Context Protocol**, so AI clients can call it
as tools:

- **Streamable HTTP:** `POST /mcp` (newer clients)
- **SSE:** `GET /sse` + `POST /messages` (Claude.ai remote MCP)
- **stdio:** run `python backend/mcp_server.py` directly (e.g. for Claude Desktop —
  config example is in the file's docstring).

**Available MCP tools** (all read-only):

| Tool                          | Description                                            |
| ----------------------------- | ----------------------------------------------------- |
| `search_driver`               | Find a driver by name                                 |
| `get_driver_stats`            | Career stats: starts, wins, poles, podiums, years     |
| `get_driver_wins`             | All race wins for a driver                             |
| `get_all_driver_win_counts`   | All drivers ranked by wins                             |
| `get_all_driver_pole_counts`  | All drivers ranked by poles                            |
| `search_circuit`              | Find a circuit by name                                 |
| `get_season_events`           | Events in a given season                               |
| `get_race_results`            | Results for an event                                   |
| `get_standings_by_season`     | Driver/constructor standings for a season             |
| `search_constructor`          | Find a constructor                                     |
| `search_team`                 | Find a team                                            |
| `get_constructor_stats`       | Career stats for a constructor                         |
| `get_overview_stats`          | Headline totals across the dataset                    |
| `get_season_champions`        | Champions by season                                   |
| `list_seasons`                | All seasons in the dataset                             |

### 4. Chat endpoint

`POST /chat` powers the in-app chat widget, using Anthropic's Claude with the same set
of tools as the MCP server to answer F1 questions in natural language. Requires an
`ANTHROPIC_API_KEY`.

### Utility endpoints

- `GET /health` — health check
- `GET /sitemap.xml`, `GET /robots.txt` — SEO, generated from the live database

---

## Installation

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- (Optional, for running scripts/services outside Docker) Python 3.12 and Node 18+

### 1. Clone and configure

```bash
git clone <repo-url> f1-stats-public
cd f1-stats-public
```

Create a `.env` file in the repo root. At minimum the backend requires a JWT secret:

```bash
# .env
JWT_SECRET_KEY=replace-with-a-long-random-secret   # required, must not be "change-me"
ACCESS_TOKEN_MINUTES=30
VITE_APP_VERSION=dev

# Optional — only needed for the in-app chat widget / chat endpoint
ANTHROPIC_API_KEY=sk-ant-...
```

> The server refuses to start if `JWT_SECRET_KEY` is unset or left as `change-me`.

### 2. Start the stack

```bash
docker compose up --build
```

This launches three services:

| Service    | URL / Port                       | Notes                              |
| ---------- | -------------------------------- | ---------------------------------- |
| `db`       | `localhost:5432`                 | PostgreSQL 16 (`f1db`/`f1user`)    |
| `api`      | `http://localhost:8010`          | FastAPI (container port 8000)      |
| `frontend` | `http://localhost:8081`          | React app (nginx)                  |

The API auto-creates the schema on startup. Verify it's up:

```bash
curl http://localhost:8010/health        # {"status":"ok"}
open http://localhost:8010/docs          # Swagger UI
```

### 3. Seed the database

The schema is created automatically, but it starts empty. Import the bundled CSVs with
the import/export script (run it against the running Postgres container):

```bash
# from the repo root, with a local Python that has psycopg2 installed
export DATABASE_URL="postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db"
python scripts/import_export_csv_postgres.py import --truncate
```

This loads every CSV in `data/`, resolving foreign-key order automatically and resetting
sequences afterward. To export the current database back to `data/`:

```bash
python scripts/import_export_csv_postgres.py export
```

### 4. Create an admin user

To access the admin API / editor features:

```bash
export DATABASE_URL="postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db"
python scripts/create_admin.py --email you@example.com --password 'your-password'
```

### 5. (Optional) Enable the OpenF1 scheduler

The auto-fetch scheduler is defined behind a Compose profile and is off by default:

```bash
# long-running scheduler
docker compose --profile scheduler up scheduler

# or a single planning + fetch pass
docker compose run --rm scheduler python -m app.scheduler --once
```

## Notes

- This project bundles historical Formula 1 data for reference and statistics; it is not
  affiliated with Formula 1, the FIA, or any team.
