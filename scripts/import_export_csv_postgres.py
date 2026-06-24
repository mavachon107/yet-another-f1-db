#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import os
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
import psycopg2

# ============================
# CONFIG — EDIT THIS
# ============================
    
#DATABASE_URL = "postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db"
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg2://f1user:f1password@127.0.0.1:5432/f1db",)  
#DATABASE_URL = "postgresql+psycopg2://f1user:f1password@10.0.0.33:5432/f1db"
#DATABASE_URL = "postgresql+psycopg2://f1user:f1password@100.83.254.20:5432/f1db"
SCHEMA = "public"

REPO_ROOT = Path(__file__).resolve().parents[1]  # assumes scripts/ is under repo root
DATA_DIR = REPO_ROOT / "data"

EXCLUDE_TABLES = {"alembic_version"}

# ============================


def _normalize_dsn(url: str) -> str:
    # psycopg2 expects the standard postgresql:// scheme, not SQLAlchemy's.
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url.split("postgresql+psycopg2://", 1)[1]
    return url


def connect():
    return psycopg2.connect(_normalize_dsn(DATABASE_URL))


def list_tables(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT tablename
            FROM pg_catalog.pg_tables
            WHERE schemaname = %s
            ORDER BY tablename
            """,
            (SCHEMA,),
        )
        return [r[0] for r in cur.fetchall() if r[0] not in EXCLUDE_TABLES]


def _table_dependencies(conn, tables: list[str]) -> dict[str, set[str]]:
    if not tables:
        return {}
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                tc.table_name,
                ccu.table_name AS foreign_table_name
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
             AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
             AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema = %s
            """,
            (SCHEMA,),
        )
        deps: dict[str, set[str]] = {t: set() for t in tables}
        for table_name, foreign_table_name in cur.fetchall():
            if table_name in deps and foreign_table_name in deps:
                deps[table_name].add(foreign_table_name)
        return deps


def _sort_tables_by_dependencies(tables: list[str], deps: dict[str, set[str]]) -> list[str]:
    remaining = {t: set(deps.get(t, set())) for t in tables}
    ordered: list[str] = []
    available = [t for t in tables if not remaining.get(t)]

    while available:
        table = available.pop(0)
        if table not in remaining:
            continue
        ordered.append(table)
        remaining.pop(table, None)
        for other, other_deps in list(remaining.items()):
            if table in other_deps:
                other_deps.remove(table)
                if not other_deps:
                    available.append(other)

    if remaining:
        # Fallback: append tables that are part of cycles in original order.
        ordered.extend([t for t in tables if t in remaining])
    return ordered


def export_table(conn, table: str, out_path: Path):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    sql = f"COPY {SCHEMA}.{table} TO STDOUT WITH (FORMAT csv, HEADER true)"
    with conn.cursor() as cur, out_path.open("w", encoding="utf-8", newline="") as f:
        cur.copy_expert(sql, f)


def import_table(conn, table: str, csv_path: Path, truncate: bool):
    with conn.cursor() as cur:
        if truncate:
            cur.execute(f"TRUNCATE TABLE {SCHEMA}.{table} RESTART IDENTITY CASCADE;")

        with csv_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            header = reader.fieldnames or []
            if not header:
                raise ValueError(f"Missing header in {csv_path}")

            # Some CSVs contain blank timestamps while DB columns are NOT NULL.
            ts_columns = [c for c in ("created_at", "updated_at") if c in header]
            if ts_columns:
                now_value = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f+00")
                rewritten = StringIO()
                writer = csv.DictWriter(rewritten, fieldnames=header)
                writer.writeheader()
                for row in reader:
                    for col in ts_columns:
                        value = row.get(col)
                        if value is None or value.strip() == "":
                            row[col] = now_value
                    writer.writerow(row)
                rewritten.seek(0)
                copy_source = rewritten
            else:
                f.seek(0)
                copy_source = f

            columns = ", ".join(f'"{col}"' for col in header)
            sql = (
                f"COPY {SCHEMA}.{table} ({columns}) "
                "FROM STDIN WITH (FORMAT csv, HEADER true)"
            )
            cur.copy_expert(sql, copy_source)


def download_file(url: str, dest: Path):
    try:
        import requests
    except ModuleNotFoundError as exc:
        raise SystemExit(
            "The 'requests' package is required only when using --download-base-url. "
            "Install it with: .venv/bin/pip install requests"
        ) from exc

    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_content(chunk_size=262144):
                if chunk:
                    f.write(chunk)


def download_csvs(base_url: str, data_dir: Path, tables: list[str]):
    for t in tables:
        url = f"{base_url.rstrip('/')}/{t}.csv"
        dest = data_dir / f"{t}.csv"
        print(f"Downloading {url}")
        download_file(url, dest)

def reset_sequences(conn):
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
              ns.nspname AS schema_name,
              cls.relname AS seq_name,
              tbl.relname AS table_name,
              col.attname AS column_name
            FROM pg_class cls
            JOIN pg_namespace ns ON ns.oid = cls.relnamespace
            JOIN pg_depend dep ON dep.objid = cls.oid
            JOIN pg_class tbl ON dep.refobjid = tbl.oid
            JOIN pg_attribute col ON col.attrelid = tbl.oid AND col.attnum = dep.refobjsubid
            WHERE cls.relkind = 'S'
              AND ns.nspname = %s
            """,
            (SCHEMA,),
        )
        rows = cur.fetchall()
        for schema_name, seq_name, table_name, column_name in rows:
            cur.execute(
                f"""
                SELECT setval(
                  %s,
                  COALESCE((SELECT MAX({column_name}) FROM {schema_name}.{table_name}), 1),
                  true
                )
                """,
                (f"{schema_name}.{seq_name}",),
            )
        conn.commit()


def cmd_export():
    with connect() as conn:
        tables = list_tables(conn)
        print(f"Exporting {len(tables)} tables to {DATA_DIR}")
        for t in tables:
            export_table(conn, t, DATA_DIR / f"{t}.csv")
    print("Export done.")


def cmd_import(truncate: bool, download_url: str | None):
    with connect() as conn:
        tables = list_tables(conn)
        deps = _table_dependencies(conn, tables)
        tables = _sort_tables_by_dependencies(tables, deps)

        if download_url:
            print(f"Downloading CSVs into {DATA_DIR}")
            download_csvs(download_url, DATA_DIR, tables)

        csv_files = {p.stem: p for p in DATA_DIR.glob("*.csv")}
        tables_to_import = [t for t in tables if t in csv_files]

        print(f"Importing {len(tables_to_import)} tables from {DATA_DIR}")
        for t in tables_to_import:
            import_table(conn, t, csv_files[t], truncate)
            conn.commit()
        print("Resetting sequences...")
        reset_sequences(conn)

    print("Import done.")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_export = sub.add_parser("export")

    p_import = sub.add_parser("import")
    p_import.add_argument("--truncate", action="store_true")
    p_import.add_argument("--download-base-url")

    p_reset = sub.add_parser("reset-sequences")

    args = parser.parse_args()

    if args.cmd == "export":
        cmd_export()
    elif args.cmd == "import":
        cmd_import(args.truncate, args.download_base_url)
    elif args.cmd == "reset-sequences":
        with connect() as conn:
            print("Resetting sequences...")
            reset_sequences(conn)
        print("Sequence reset done.")


if __name__ == "__main__":
    main()
