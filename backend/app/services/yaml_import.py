"""Import session results from uploaded YAML content."""

from __future__ import annotations

from datetime import datetime, time as dt_time
from typing import Any

import yaml
from sqlalchemy import text
from sqlmodel import Session


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalize_rows(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("session_result", "sessionResult", "results"):
            if key in payload and isinstance(payload[key], list):
                return payload[key]
    raise ValueError("Unsupported YAML payload format.")


def _slug_variants(value: str) -> list[str]:
    base = value.strip().lower()
    return [v for v in {
        base,
        base.replace("-", "_"),
        base.replace("-", " "),
        base.replace("-", ""),
    } if v]


def _fetch_one(conn, sql: str, params: dict) -> tuple | None:
    result = conn.execute(text(sql), params).first()
    return tuple(result) if result else None


def _parse_position(value: Any) -> str | None:
    if value is None:
        return None
    t = str(value).strip()
    return t if t else None


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------

def _lookup_driver_id(conn, slug: str, cache: dict[str, int]) -> int:
    cached = cache.get(slug)
    if cached is not None:
        return cached

    for variant in _slug_variants(slug):
        row = _fetch_one(conn, "SELECT id FROM driver WHERE lower(short_name) = :v LIMIT 1", {"v": variant})
        if row:
            cache[slug] = row[0]
            return row[0]

    parts = slug.strip().split("-")
    if len(parts) >= 2:
        first_name = parts[0].lower()
        last_name = "-".join(parts[1:]).lower()
        row = _fetch_one(
            conn,
            "SELECT id FROM driver WHERE lower(first_name) = :f AND lower(last_name) = :l LIMIT 1",
            {"f": first_name, "l": last_name},
        )
        if row:
            cache[slug] = row[0]
            return row[0]

    raise ValueError(f"Driver not found: {slug}")


def _lookup_event_entry_id(conn, event_id: int, driver_id: int) -> int:
    row = _fetch_one(
        conn,
        "SELECT id FROM event_entry WHERE event_id = :eid AND driver_id = :did LIMIT 1",
        {"eid": event_id, "did": driver_id},
    )
    if not row:
        raise ValueError(f"Event entry not found for event_id={event_id}, driver_id={driver_id}")
    return row[0]


def _lookup_or_create_session(conn, event_id: int, session_type: str, log: list[str]) -> int:
    row = _fetch_one(
        conn,
        "SELECT id FROM session WHERE event_id = :eid AND type = :st LIMIT 1",
        {"eid": event_id, "st": session_type},
    )
    if row:
        return row[0]
    date_row = _fetch_one(conn, "SELECT event_date FROM event WHERE id = :eid", {"eid": event_id})
    if not date_row or not date_row[0]:
        raise ValueError(f"Event not found: {event_id}")
    dt_start = datetime.combine(date_row[0], dt_time.min)
    row = _fetch_one(
        conn,
        "INSERT INTO session (event_id, type, date_time_start) VALUES (:eid, :st, :dts) RETURNING id",
        {"eid": event_id, "st": session_type, "dts": dt_start},
    )
    if not row:
        raise RuntimeError("Failed to insert session.")
    log.append(f"Created {session_type} session for event {event_id}")
    return row[0]


def _upsert_session_result(
    conn, session_id: int, entry_id: int,
    position, points, time_val, gap, interval, laps,
    time_penalty, grid_position, retired_reason,
    cache: dict[tuple[int, int], int],
) -> int:
    key = (session_id, entry_id)
    if key in cache:
        return cache[key]
    row = _fetch_one(
        conn,
        "SELECT id FROM session_result WHERE session_id = :sid AND entry_id = :eid LIMIT 1",
        {"sid": session_id, "eid": entry_id},
    )
    if row:
        fields = {
            "position": position, "points": points, "time": time_val,
            "gap": gap, "interval": interval, "laps": laps,
            "time_penalty": time_penalty, "grid_position": grid_position,
            "retired_reason": retired_reason,
        }
        updates = {k: v for k, v in fields.items() if v is not None}
        if updates:
            updates["result_id"] = row[0]
            set_clause = ", ".join(f"{k} = :{k}" for k in updates if k != "result_id")
            conn.execute(text(f"UPDATE session_result SET {set_clause} WHERE id = :result_id"), updates)
        cache[key] = row[0]
        return row[0]
    row = _fetch_one(
        conn,
        """INSERT INTO session_result
           (session_id, entry_id, position, points, time, gap, interval,
            laps, time_penalty, grid_position, retired_reason)
           VALUES (:sid, :eid, :pos, :pts, :tm, :gap, :intv, :laps, :tp, :gp, :rr)
           RETURNING id""",
        {
            "sid": session_id, "eid": entry_id, "pos": position, "pts": points,
            "tm": time_val, "gap": gap, "intv": interval, "laps": laps,
            "tp": time_penalty, "gp": grid_position, "rr": retired_reason,
        },
    )
    if not row:
        raise RuntimeError("Failed to insert session_result.")
    cache[key] = row[0]
    return row[0]


# ---------------------------------------------------------------------------
# Process rows (shared logic)
# ---------------------------------------------------------------------------

def _process_rows(
    conn, rows: list[dict], event_id: int, session_type: str,
    session_id: int | None, dry_run: bool,
    driver_cache: dict, entry_cache: dict, result_cache: dict,
    log: list[str],
) -> int:
    """Process a list of YAML rows for a single session. Returns row count."""
    for row in rows:
        driver_slug = row.get("driverId")
        position = _parse_position(row.get("position"))

        if not driver_slug:
            log.append(f"  {session_type} P{position or '?'}: ERROR — missing driverId")
            continue

        driver_id = None
        driver_error = None
        try:
            driver_id = _lookup_driver_id(conn, driver_slug, driver_cache)
        except ValueError as exc:
            driver_error = str(exc)

        if dry_run:
            flags = []
            if driver_error:
                flags.append(f"DRIVER NOT FOUND ({driver_error})")
            elif driver_id:
                try:
                    _lookup_event_entry_id(conn, event_id, driver_id)
                except ValueError:
                    flags.append(f"EVENT ENTRY NOT FOUND (event_id={event_id}, driver_id={driver_id})")
            status = " | ".join(flags) if flags else "OK"
            log.append(
                f"  {session_type} P{position or '?'}: "
                f"driver={driver_slug} (id={driver_id or '?'}), "
                f"time={row.get('time', '—')} — {status}"
            )
            continue

        if driver_error:
            log.append(f"  {session_type}: SKIPPED {driver_slug} — {driver_error}")
            continue

        ekey = (event_id, driver_id)
        entry_id = entry_cache.get(ekey)
        if entry_id is None:
            try:
                entry_id = _lookup_event_entry_id(conn, event_id, driver_id)
            except ValueError:
                log.append(f"  {session_type}: SKIPPED {driver_slug} — no event entry")
                continue
            entry_cache[ekey] = entry_id

        _upsert_session_result(
            conn, session_id, entry_id, position,
            row.get("points"), row.get("time"), row.get("gap"),
            row.get("interval"), row.get("laps"), row.get("timePenalty"),
            _parse_position(row.get("gridPosition")), row.get("retiredReason"),
            result_cache,
        )

    return len(rows)


# ---------------------------------------------------------------------------
# Free practice import
# ---------------------------------------------------------------------------

FP_SESSION_TYPES = {"FP1", "FP2", "FP3"}


def _detect_fp_session_type(filename: str) -> str | None:
    """Detect FP session type from filename."""
    name = filename.lower()
    if "free-practice-1" in name or "fp1" in name:
        return "FP1"
    if "free-practice-2" in name or "fp2" in name:
        return "FP2"
    if "free-practice-3" in name or "fp3" in name:
        return "FP3"
    return None


def import_free_practice(
    session_db: Session,
    event_id: int,
    dry_run: bool,
    files: list[tuple[str, bytes]],
) -> dict:
    """Import free practice results from uploaded YAML files.

    files: list of (filename, content_bytes) tuples.
    """
    log: list[str] = []
    conn = session_db.connection()
    driver_cache: dict[str, int] = {}
    entry_cache: dict[tuple[int, int], int] = {}
    total = 0

    for filename, content in files:
        session_type = _detect_fp_session_type(filename)
        if not session_type:
            log.append(f"Skipping {filename} — cannot detect session type (expected FP1/FP2/FP3)")
            continue

        payload = yaml.safe_load(content)

        if not payload:
            if not dry_run:
                _lookup_or_create_session(conn, event_id, session_type, log)
            log.append(f"{session_type} — {filename} (empty, session created)")
            continue

        rows = _normalize_rows(payload)
        log.append(f"{session_type} — {filename} ({len(rows)} rows)")

        session_id = None
        if not dry_run:
            session_id = _lookup_or_create_session(conn, event_id, session_type, log)

        result_cache: dict[tuple[int, int], int] = {}
        count = _process_rows(
            conn, rows, event_id, session_type, session_id, dry_run,
            driver_cache, entry_cache, result_cache, log,
        )
        total += count

    if dry_run:
        log.append(f"\nDry run complete. {total} rows checked, no data written.")
    else:
        session_db.commit()
        log.append(f"\nImported {total} results across {len(files)} file(s).")

    return {"log": log, "imported": total}


# ---------------------------------------------------------------------------
# Qualifying import
# ---------------------------------------------------------------------------

def import_qualifying(
    session_db: Session,
    event_id: int,
    dry_run: bool,
    files: list[tuple[str, bytes]],
) -> dict:
    """Import qualifying results from uploaded YAML file(s).

    files: list of (filename, content_bytes) tuples. Typically one file.
    """
    log: list[str] = []
    conn = session_db.connection()

    if not files:
        return {"log": ["No files provided."], "imported": 0}

    filename, content = files[0]
    payload = yaml.safe_load(content)

    if not payload:
        if not dry_run:
            for st in ("QUALI", "Q1", "Q2", "Q3"):
                _lookup_or_create_session(conn, event_id, st, log)
            session_db.commit()
        log.append(f"{filename} is empty, sessions created")
        return {"log": log, "imported": 0}

    rows = _normalize_rows(payload)
    log.append(f"{filename} ({len(rows)} rows)")

    session_id = None
    q1_session_id = None
    q2_session_id = None
    q3_session_id = None
    if not dry_run:
        session_id = _lookup_or_create_session(conn, event_id, "QUALI", log)
        q1_session_id = _lookup_or_create_session(conn, event_id, "Q1", log)
        q2_session_id = _lookup_or_create_session(conn, event_id, "Q2", log)
        q3_session_id = _lookup_or_create_session(conn, event_id, "Q3", log)

    driver_cache: dict[str, int] = {}
    entry_cache: dict[tuple[int, int], int] = {}
    result_cache: dict[tuple[int, int], int] = {}

    for row in rows:
        driver_slug = row.get("driverId")
        position = _parse_position(row.get("position"))

        if not driver_slug:
            log.append(f"  QUALI P{position or '?'}: ERROR — missing driverId")
            continue

        driver_id = None
        driver_error = None
        try:
            driver_id = _lookup_driver_id(conn, driver_slug, driver_cache)
        except ValueError as exc:
            driver_error = str(exc)

        if dry_run:
            flags = []
            if driver_error:
                flags.append(f"DRIVER NOT FOUND ({driver_error})")
            elif driver_id:
                try:
                    _lookup_event_entry_id(conn, event_id, driver_id)
                except ValueError:
                    flags.append(f"EVENT ENTRY NOT FOUND (event_id={event_id}, driver_id={driver_id})")
            q_times = f"Q1={row.get('q1', '—')} Q2={row.get('q2', '—')} Q3={row.get('q3', '—')}"
            status = " | ".join(flags) if flags else "OK"
            log.append(
                f"  QUALI P{position or '?'}: "
                f"driver={driver_slug} (id={driver_id or '?'}), "
                f"{q_times} — {status}"
            )
            continue

        if driver_error:
            log.append(f"  QUALI: SKIPPED {driver_slug} — {driver_error}")
            continue

        ekey = (event_id, driver_id)
        entry_id = entry_cache.get(ekey)
        if entry_id is None:
            try:
                entry_id = _lookup_event_entry_id(conn, event_id, driver_id)
            except ValueError:
                log.append(f"  QUALI: SKIPPED {driver_slug} — no event entry")
                continue
            entry_cache[ekey] = entry_id

        _upsert_session_result(
            conn, session_id, entry_id, position,
            row.get("points"),
            row.get("time") or row.get("q3") or row.get("q2") or row.get("q1"),
            row.get("gap"), row.get("interval"), row.get("laps"),
            row.get("timePenalty"), _parse_position(row.get("gridPosition")),
            row.get("retiredReason"), result_cache,
        )

        q_session_ids = {"q1": q1_session_id, "q2": q2_session_id, "q3": q3_session_id}
        for q_key, q_sid in q_session_ids.items():
            q_time = row.get(q_key)
            if q_time:
                _upsert_session_result(
                    conn, q_sid, entry_id,
                    None, None, q_time, None, None, None, None, None, None,
                    result_cache,
                )

    if dry_run:
        log.append(f"\nDry run complete. {len(rows)} rows checked, no data written.")
    else:
        session_db.commit()
        log.append(f"\nImported {len(rows)} qualifying results from {filename}.")

    return {"log": log, "imported": len(rows)}
