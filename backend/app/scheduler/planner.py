"""Planning + per-session fetch logic for the OpenF1 auto-fetch scheduler.

The planner queries events in a date window, resolves each to its OpenF1 meeting, and —
using the **true UTC** ``date_end`` from OpenF1 (not the ambiguous naive DB column) —
registers a fetch job a few minutes after each session ends. The fetch job pulls
results, then weather and (for the race) fastest laps, retrying with backoff until the
data is published. A single delayed "final sweep" per session absorbs later penalty
corrections (safe because every fetch upserts idempotently).
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

try:
    from pytz import utc
except ImportError:  # pragma: no cover
    from datetime import timezone

    utc = timezone.utc

from sqlmodel import Session, func, select

from app.core import config
from app.database import engine
from app.models.circuit import Circuit
from app.models.event import Event
from app.models.session import Session as SessionModel
from app.models.session_result import SessionResult
from app.scheduler import state
from app.services import openf1_fetch
from app.services.openf1_errors import (
    OpenF1Ambiguous,
    OpenF1BadInput,
    OpenF1FetchError,
    OpenF1NoMatch,
    OpenF1NotFound,
    OpenF1NotReady,
    OpenF1Upstream,
)

logger = logging.getLogger("app.scheduler")

# Exceptions worth retrying (data likely not published yet) vs. terminal ones.
_RETRYABLE = (OpenF1NoMatch, OpenF1NotReady, OpenF1Upstream)
_TERMINAL = (OpenF1Ambiguous, OpenF1NotFound, OpenF1BadInput)


def _now() -> datetime:
    return datetime.now(utc)


def _session_has_results(db: Session, session_id: int) -> bool:
    count = db.exec(
        select(func.count())
        .select_from(SessionResult)
        .where(SessionResult.session_id == session_id)
    ).first()
    return bool(count)


def _openf1_rows_count(results: dict) -> int:
    """How many raw rows OpenF1 returned — 0 means results aren't published yet."""
    try:
        return int(results["meta"]["imported"]["openf1_rows_count"])
    except (KeyError, TypeError, ValueError):
        return 0


def _events_in_window(db: Session) -> list[Event]:
    today = _now().date()
    start_date = today - timedelta(days=config.SCHEDULER_WINDOW_PAST_DAYS)
    end_date = today + timedelta(days=config.SCHEDULER_WINDOW_FUTURE_DAYS)
    events = db.exec(
        select(Event).where(
            Event.event_date >= start_date,
            Event.event_date <= end_date,
        )
    ).all()
    logger.info(
        "scheduler.planner.window start=%s end=%s events=%s",
        start_date,
        end_date,
        len(events),
    )
    return events


def _collect_event_sessions(
    db: Session, event: Event
) -> list[tuple[SessionModel, str, datetime]]:
    """Resolve an event's OpenF1 sessions.

    Returns a list of ``(local_session, session_type_value, end_utc)`` where ``end_utc``
    is tz-aware UTC taken from OpenF1's ``date_end``. Optionally syncs the local schedule
    first. Raises a domain ``OpenF1FetchError`` if the event can't be resolved.
    """
    circuit = db.get(Circuit, event.circuit_id) if event.circuit_id else None
    _meeting, openf1_sessions = openf1_fetch.resolve_event_openf1_sessions(event, circuit)

    if config.SCHEDULER_SYNC_SCHEDULE:
        try:
            openf1_fetch.fetch_meeting_sessions_weather(db, event.id)
        except OpenF1FetchError as exc:
            logger.info(
                "scheduler.planner.schedule_sync_skipped event_id=%s reason=%s",
                event.id,
                exc,
            )

    local_sessions = db.exec(
        select(SessionModel).where(SessionModel.event_id == event.id)
    ).all()
    local_by_type: dict[str, list[SessionModel]] = {}
    for local_session in local_sessions:
        key = str(getattr(local_session.type, "value", local_session.type)).upper()
        local_by_type.setdefault(key, []).append(local_session)

    collected: list[tuple[SessionModel, str, datetime]] = []
    for openf1_session in openf1_sessions:
        mapped_type = openf1_fetch.infer_session_type(openf1_session)
        if mapped_type is None:
            continue
        end_naive = openf1_fetch.parse_openf1_datetime(openf1_session.get("date_end"))
        if end_naive is None:
            continue
        end_utc = end_naive.replace(tzinfo=utc)
        type_value = str(mapped_type.value).upper()
        candidates = local_by_type.get(type_value, [])
        if not candidates:
            continue
        # First candidate; same-type duplicates within an event are not expected.
        collected.append((candidates[0], type_value, end_utc))
    return collected


def run_planner() -> None:
    """One planning pass: register fetch/sweep jobs for all due sessions in the window."""
    from app.scheduler import runner

    now = _now()
    scheduled = 0
    with Session(engine) as db:
        for event in _events_in_window(db):
            try:
                sessions = _collect_event_sessions(db, event)
            except OpenF1FetchError as exc:
                logger.info(
                    "scheduler.planner.skip event_id=%s reason=%s", event.id, exc
                )
                continue
            except Exception:  # pragma: no cover - never let one event kill the pass
                logger.exception(
                    "scheduler.planner.event_failed event_id=%s", event.id
                )
                continue

            for local_session, type_value, end_utc in sessions:
                sid = local_session.id
                if sid is None:
                    continue
                has_results = _session_has_results(db, sid)

                if not has_results:
                    run_at = end_utc + timedelta(
                        minutes=config.SCHEDULER_FETCH_DELAY_MIN
                    )
                    if run_at < now:
                        stale_cutoff = now - timedelta(
                            hours=config.SCHEDULER_STALE_GRACE_H
                        )
                        if end_utc < stale_cutoff:
                            # Ended too long ago and still empty — likely no OpenF1
                            # data for this (older) session; don't keep chasing it.
                            continue
                        run_at = now + timedelta(seconds=30)
                    runner.schedule_session_fetch(
                        sid, event.id, run_at, attempt=0, final=False
                    )
                    scheduled += 1
                else:
                    # Already populated — schedule one delayed final sweep to absorb
                    # penalty/final corrections, but only within the sweep window.
                    sweep_cutoff = now - timedelta(
                        hours=config.SCHEDULER_FINAL_SWEEP_WINDOW_H
                    )
                    if end_utc < sweep_cutoff:
                        continue
                    run_at = end_utc + timedelta(
                        hours=config.SCHEDULER_FINAL_SWEEP_DELAY_H
                    )
                    if run_at < now:
                        run_at = now + timedelta(seconds=30)
                    runner.schedule_session_fetch(
                        sid, event.id, run_at, attempt=0, final=True
                    )
                    scheduled += 1

    state.upsert_job(
        state.PLANNER_JOB_ID,
        "planner",
        _now() + timedelta(hours=config.SCHEDULER_PLANNER_INTERVAL_H),
    )
    state.record_log(
        "info", "planner", f"Planner pass complete: {scheduled} job(s) scheduled"
    )


def _do_fetch(db: Session, session_id: int, event_id: int) -> int:
    """Fetch results (+weather, +fastest laps for race). Returns OpenF1 row count.

    Raises the domain exceptions for the caller (retry vs terminal handling).
    """
    results = openf1_fetch.fetch_session_results(db, session_id)
    rows = _openf1_rows_count(results)
    if rows == 0 and not _session_has_results(db, session_id):
        raise OpenF1NotReady("OpenF1 returned no result rows yet.")

    try:
        openf1_fetch.fetch_weather(db, session_id)
    except OpenF1FetchError as exc:
        # A failed fetch may leave the session mid-transaction; roll back so the
        # following queries/fetches don't hit PendingRollbackError.
        db.rollback()
        logger.info(
            "scheduler.fetch.weather_skipped session_id=%s reason=%s", session_id, exc
        )

    session_model = db.get(SessionModel, session_id)
    type_value = (
        str(getattr(session_model.type, "value", session_model.type)).upper()
        if session_model
        else ""
    )
    if type_value == "RACE":
        try:
            openf1_fetch.fetch_fastest_laps(db, event_id)
        except OpenF1FetchError as exc:
            db.rollback()
            logger.info(
                "scheduler.fetch.fastest_laps_skipped event_id=%s reason=%s",
                event_id,
                exc,
            )
    return rows


def run_session_fetch(
    session_id: int, event_id: int, attempt: int = 0, final: bool = False
) -> None:
    """Job body: fetch a session's data; retry with backoff if not yet published."""
    from app.scheduler import runner

    label = "final" if final else "fetch"
    job_id = f"openf1-{label}-{session_id}"
    with Session(engine) as db:
        try:
            rows = _do_fetch(db, session_id, event_id)
        except _RETRYABLE as exc:
            if final:
                logger.info(
                    "scheduler.final.no_data session_id=%s reason=%s", session_id, exc
                )
                state.record_log(
                    "info", "final", "Final sweep: no new data",
                    event_id=event_id, session_id=session_id,
                )
                state.remove_job(job_id)
                return
            if attempt + 1 > config.SCHEDULER_MAX_RETRIES:
                logger.info(
                    "scheduler.fetch.gave_up session_id=%s attempts=%s reason=%s",
                    session_id,
                    attempt,
                    exc,
                )
                state.record_log(
                    "error", "gave_up",
                    f"Gave up after {attempt} retries: {exc}",
                    event_id=event_id, session_id=session_id,
                )
                state.remove_job(job_id)
                return
            run_at = _now() + timedelta(minutes=config.SCHEDULER_RETRY_INTERVAL_MIN)
            runner.schedule_session_fetch(
                session_id, event_id, run_at, attempt=attempt + 1, final=False
            )
            logger.info(
                "scheduler.fetch.retry session_id=%s next_attempt=%s reason=%s",
                session_id,
                attempt + 1,
                exc,
            )
            state.record_log(
                "warning", "retry",
                f"Not ready, retry {attempt + 1}/{config.SCHEDULER_MAX_RETRIES}: {exc}",
                event_id=event_id, session_id=session_id,
            )
            return
        except _TERMINAL as exc:
            logger.warning(
                "scheduler.fetch.terminal session_id=%s reason=%s", session_id, exc
            )
            state.record_log(
                "error", "terminal", str(exc),
                event_id=event_id, session_id=session_id,
            )
            state.remove_job(job_id)
            return
        except Exception:  # pragma: no cover - defensive
            logger.exception("scheduler.fetch.unexpected session_id=%s", session_id)
            state.record_log(
                "error", "error", "Unexpected error during fetch",
                event_id=event_id, session_id=session_id,
            )
            state.remove_job(job_id)
            return

        logger.info(
            "scheduler.fetch.done session_id=%s label=%s openf1_rows=%s",
            session_id,
            label,
            rows,
        )
        state.record_log(
            "success", label,
            f"Fetched {rows} OpenF1 result row(s)",
            event_id=event_id, session_id=session_id, openf1_rows=rows,
        )
        state.remove_job(job_id)


def run_once() -> None:
    """Single synchronous pass for cron/testing: fetch every due session inline, then exit.

    Unlike ``run_planner`` (which schedules future jobs), this executes fetches now for
    sessions that have already ended and aren't complete, plus a final sweep for recently
    completed ones. No blocking scheduler, no retries.
    """
    now = _now()
    state.record_log("info", "once", "Manual --once pass started")
    fetched = 0
    with Session(engine) as db:
        for event in _events_in_window(db):
            try:
                sessions = _collect_event_sessions(db, event)
            except OpenF1FetchError as exc:
                logger.info(
                    "scheduler.once.skip event_id=%s reason=%s", event.id, exc
                )
                continue

            for local_session, _type_value, end_utc in sessions:
                sid = local_session.id
                if sid is None or end_utc > now:
                    continue  # session hasn't ended yet
                has_results = _session_has_results(db, sid)
                sweep_cutoff = now - timedelta(
                    hours=config.SCHEDULER_FINAL_SWEEP_WINDOW_H
                )
                if has_results and end_utc < sweep_cutoff:
                    continue  # complete and outside the sweep window
                try:
                    rows = _do_fetch(db, sid, event.id)
                    logger.info(
                        "scheduler.once.fetched session_id=%s openf1_rows=%s", sid, rows
                    )
                    fetched += 1
                    state.record_log(
                        "success", "fetch",
                        f"Fetched {rows} OpenF1 result row(s) (--once)",
                        event_id=event.id, session_id=sid, openf1_rows=rows,
                    )
                except OpenF1FetchError as exc:
                    logger.info(
                        "scheduler.once.no_data session_id=%s reason=%s", sid, exc
                    )
                    state.record_log(
                        "warning", "no_data", f"No data: {exc}",
                        event_id=event.id, session_id=sid,
                    )
    state.record_log("info", "once", f"Manual --once pass complete: {fetched} fetched")
