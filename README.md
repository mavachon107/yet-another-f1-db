# Yet Another F1 Database

> A community-driven Formula 1 historical database covering every season from **1950 to the present** — going beyond what any single source currently offers.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Issues](https://img.shields.io/github/issues/mavachon107/yet-another-f1-db)](https://github.com/mavachon107/yet-another-f1-db/issues)

**Live site:** [f1statsdatahub.com](https://f1statsdatahub.com)

---

## Why this project?

Existing F1 datasets (Ergast, OpenF1, Wikipedia) each cover part of the picture. None of them combine:

- Circuit layout **version history** (the Monaco of 1955 ≠ the Monaco of 2024)
- Structured **penalty records** (drive-through, time penalties, DSQs, reprimands)
- The **regulatory system** each season ran under (technical regulations, sporting regs, budget cap era)
- A fully **cleaned and verified** historical record going back to 1950

This project aims to build that dataset as a community, with a public REST API and MCP server on top so anyone — human or AI — can query it easily.

---

## Current focus — we need your help!

These are the active workstreams. If any of these interest you, jump in:

| # | Area | Status | What's needed |
|---|------|--------|----------------|
| 1 | **Circuit versions** | 🔨 In progress | Historical layout data per season — lengths, configurations, DRS zones |
| 2 | **Penalty data** | 🔨 In progress | Cleaning and completing penalty records from historical race steward reports |
| 3 | **Regulatory system** | 📋 Planned | Mapping each season to its governing technical & sporting regulations |
| 4 | **Data cleaning & verification** | 🔨 In progress | Cross-checking historical results, fixing inconsistencies, filling gaps |
| 5 | **Stats API** | 📋 Planned | New endpoints for aggregated career and season statistics |

See the [open issues](https://github.com/mavachon107/yet-another-f1-db/issues) for specific tasks, or the [Wiki](https://github.com/mavachon107/yet-another-f1-db/wiki) for the full data model and contribution guides.

---

## What's in the repo

```
yet-another-f1-db/
├── data/          # CSV exports — one file per database table (the actual dataset)
├── backend/       # FastAPI app (SQLModel + PostgreSQL)
├── frontend/      # React/Vite web app
├── scripts/       # Import/export and admin utilities
├── docs/          # ER diagram and supplementary documentation
└── docker-compose.yml
```

The dataset lives in `data/` as CSVs. The full relational schema is documented as a Mermaid ER diagram in [`docs/db-diagram.md`](docs/db-diagram.md). See the [Wiki → Data Model](https://github.com/mavachon107/yet-another-f1-db/wiki/Data-Model) for an overview of every table.

---

## Quick start

### Prerequisites

- [Docker](https://www.docker.com/) and Docker Compose
- Python 3.12+ (for seeding scripts, outside Docker)

### 1. Clone and configure

```bash
git clone https://github.com/mavachon107/yet-another-f1-db.git
cd yet-another-f1-db
```

Create a `.env` file at the repo root:

```env
JWT_SECRET_KEY=replace-with-a-long-random-secret   # required
ACCESS_TOKEN_MINUTES=30
VITE_APP_VERSION=dev

# Optional — only needed for the in-app chat widget
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Start the stack

```bash
docker compose up --build
```

| Service    | URL                     | Notes                          |
|------------|-------------------------|--------------------------------|
| `db`       | `localhost:5432`        | PostgreSQL 16                  |
| `api`      | `http://localhost:8010` | FastAPI + Swagger UI at `/docs`|
| `frontend` | `http://localhost:8081` | React app                      |

### 3. Seed the database

```bash
export DATABASE_URL="postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db"
python scripts/import_export_csv_postgres.py import --truncate
```

See the [Wiki → Installation](https://github.com/mavachon107/yet-another-f1-db/wiki/Installation) for full setup details including admin user creation and the optional OpenF1 scheduler.

---

## Using the API

The backend exposes three surfaces:

- **Public REST API** — `GET /v1/drivers`, `/v1/events`, `/v1/standings`, … (Swagger at `/docs`)
- **Admin API** — full CRUD, JWT-protected (`/admin/...`)
- **MCP server** — for AI assistants; supports Claude Desktop, Claude.ai remote MCP, and stdio

See the [Wiki → API Reference](https://github.com/mavachon107/yet-another-f1-db/wiki/API-Reference) for the full endpoint list and MCP tool catalog.

---

## Contributing

Contributions of all kinds are welcome — data, code, documentation, or just catching errors.

Read [CONTRIBUTING.md](CONTRIBUTING.md) to get started. Short version:

1. Check the [open issues](https://github.com/mavachon107/yet-another-f1-db/issues) for something labeled `help wanted` or `good first issue`
2. Fork the repo and create a branch
3. Make your changes and open a PR

Data contributions (CSV fixes, new records) are especially valuable right now. You don't need to run the full stack to help — a spreadsheet editor and a text editor are enough.

---

## Disclaimer

This project bundles historical Formula 1 data for reference and statistical purposes. It is not affiliated with Formula 1, the FIA, or any team.
