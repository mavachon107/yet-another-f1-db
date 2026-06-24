"""APScheduler lifecycle for the standalone OpenF1 fetch scheduler.

Holds a single ``BlockingScheduler`` configured in UTC. The planner registers
per-session ``date``-trigger jobs against this scheduler; those jobs may reschedule
themselves (retry/backoff). All datetimes passed to ``add_job`` are tz-aware UTC so the
scheduler never interprets a naive value in server-local time.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.blocking import BlockingScheduler

try:  # APScheduler 3.x ships pytz; fall back to stdlib just in case.
    from pytz import utc
except ImportError:  # pragma: no cover
    from datetime import timezone

    utc = timezone.utc

from app.core import config

logger = logging.getLogger("app.scheduler")

scheduler = BlockingScheduler(timezone=utc)


def schedule_session_fetch(
    session_id: int,
    event_id: int,
    run_at: datetime,
    *,
    attempt: int = 0,
    final: bool = False,
) -> None:
    """Register (or refresh) a per-session fetch job at ``run_at`` (tz-aware UTC).

    The job id is keyed on ``session_id`` (distinct for the final sweep), so re-planning
    refreshes the run time rather than creating duplicates.
    """
    from app.scheduler import state
    from app.scheduler.planner import run_session_fetch

    job_id = f"openf1-final-{session_id}" if final else f"openf1-fetch-{session_id}"
    scheduler.add_job(
        run_session_fetch,
        "date",
        run_date=run_at,
        id=job_id,
        replace_existing=True,
        coalesce=True,
        misfire_grace_time=3600,
        kwargs={
            "session_id": session_id,
            "event_id": event_id,
            "attempt": attempt,
            "final": final,
        },
    )
    state.upsert_job(
        job_id,
        "final" if final else "fetch",
        run_at,
        event_id=event_id,
        session_id=session_id,
        attempt=attempt,
    )
    logger.info(
        "scheduler.planner.scheduled job_id=%s run_at=%s attempt=%s final=%s",
        job_id,
        run_at.isoformat(),
        attempt,
        final,
    )


def start() -> None:
    """Start the blocking scheduler: register the recurring planner, run one pass now."""
    from app.scheduler import state
    from app.scheduler.planner import run_planner

    interval_h = config.SCHEDULER_PLANNER_INTERVAL_H
    scheduler.add_job(
        run_planner,
        "interval",
        hours=interval_h,
        id="openf1-planner",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    state.upsert_job(
        state.PLANNER_JOB_ID,
        "planner",
        datetime.now(utc) + timedelta(hours=interval_h),
    )
    state.record_log(
        "info", "started", f"Scheduler started (planner every {interval_h}h)"
    )
    logger.info("scheduler.starting planner_interval_h=%s", interval_h)

    # Run one planning pass immediately so a freshly-(re)started scheduler catches up.
    try:
        run_planner()
    except Exception:  # pragma: no cover - defensive; never crash startup
        logger.exception("scheduler.initial_planner_failed")

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):  # pragma: no cover
        logger.info("scheduler.stopping")
        scheduler.shutdown(wait=False)
