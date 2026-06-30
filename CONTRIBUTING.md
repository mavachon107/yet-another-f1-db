# Contributing to Yet Another F1 Database

Thank you for your interest in contributing! This project is community-driven and all kinds of contributions are welcome — data corrections, new records, code, documentation, or just raising issues when something looks wrong.

---

## Table of contents

- [Ways to contribute](#ways-to-contribute)
- [Data contributions](#data-contributions)
- [Code contributions](#code-contributions)
- [Opening issues](#opening-issues)
- [Pull request process](#pull-request-process)
- [Coding style](#coding-style)
- [Getting help](#getting-help)

---

## Ways to contribute

### You don't need to be a developer

The most valuable work right now is on the **data** — cleaning historical records, filling gaps, and adding new domains. If you can use a spreadsheet or a text editor, you can contribute.

Current priorities:

| Area | Label | What to do |
|------|-------|------------|
| Circuit version data | `circuit-versions` | Add historical layout data (length, config, DRS zones) per season |
| Penalty records | `penalties` | Complete and clean penalty data from historical race stewards reports |
| Regulatory system | `regulations` | Map seasons to their governing technical/sporting regulations |
| Historical data cleaning | `data-cleaning` | Cross-check results, fix inconsistencies, fill nulls |
| Stats API | `stats-api` | Propose or implement new aggregated stat endpoints |

Browse issues with these labels at:
`https://github.com/mavachon107/yet-another-f1-db/issues`

---

## Data contributions

### Format

All data lives in `data/` as CSV files, one per database table. The full schema is documented in the [Wiki → Data Model](https://github.com/mavachon107/yet-another-f1-db/wiki/Data-Model).

Rules for data PRs:
- Match the column names and types of the existing CSV exactly
- Use `NULL` (the string) for missing values — do not leave cells empty
- Use ISO 8601 dates (`YYYY-MM-DD`)
- Foreign key values must match an existing record in the referenced table
- Provide a source for any factual claim in the PR description (Wikipedia article, FIA document URL, race report, etc.)

### Workflow for data-only changes

You do not need to run the full Docker stack to fix data. The simplest path:

1. Fork the repo on GitHub
2. Edit the relevant CSV(s) directly in your fork (GitHub has a built-in editor)
3. Open a PR with a short description of what you changed and why

For larger changes (many rows, multiple tables), clone locally and use a spreadsheet editor or the import/export script:

```bash
# export current DB to CSVs
export DATABASE_URL="postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db"
python scripts/import_export_csv_postgres.py export

# make your edits to data/*.csv

# re-import to verify no FK violations
python scripts/import_export_csv_postgres.py import --truncate
```

---

## Code contributions

### Setup

Follow the [Wiki → Installation](https://github.com/mavachon107/yet-another-f1-db/wiki/Installation) guide to get the stack running locally.

### Branch naming

```
feature/short-description
fix/short-description
data/short-description
docs/short-description
```

### Where things live

| Layer | Location | Stack |
|-------|----------|-------|
| Database models | `backend/app/models/` | SQLModel |
| API routes | `backend/app/routers/` | FastAPI |
| MCP tools | `backend/app/mcp_tools/` | FastMCP |
| Scheduler | `backend/app/scheduler/` | APScheduler + OpenF1 |
| Frontend | `frontend/src/` | React + Vite |
| Data | `data/` | CSV |
| Scripts | `scripts/` | Python |

---

## Opening issues

Before opening an issue:
- Search existing issues to avoid duplicates
- For data errors, include the table name, the record identifier, the current value, the correct value, and a source

Use the issue templates when available. Label suggestions:
- `bug` — something is broken
- `data-error` — a factual data problem
- `enhancement` — a new feature or endpoint
- `help wanted` — good for external contributors
- `good first issue` — low-complexity entry points
- `question` — discussion or clarification

---

## Pull request process

1. Fork the repo and create a branch off `main`
2. Make your changes — keep PRs focused (one concern per PR)
3. For code changes: make sure `docker compose up --build` still works
4. For data changes: verify the import script runs cleanly with `--truncate`
5. Write a clear PR description:
   - What changed
   - Why
   - Sources (for data PRs)
6. Open the PR against `main`

A maintainer will review within a few days. Please be patient — this is a side project.

---

## Coding style

- **Python:** follow PEP 8; use type hints; keep functions small
- **JavaScript/React:** follow the existing component structure; no new dependencies without discussion
- **SQL/CSV:** snake_case for all column and table names

---

## Getting help

- Open a [GitHub Discussion](https://github.com/mavachon107/yet-another-f1-db/discussions) for questions, ideas, or general chat
- Tag an issue `question` if you're unsure how something works
- Check the [Wiki](https://github.com/mavachon107/yet-another-f1-db/wiki) first — the data model and API reference are documented there
