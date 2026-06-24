"""Persist scheduler activity and pending jobs so the admin UI can observe the
separate scheduler process.

Every function opens its own short-lived DB session and never raises — a logging/DB
hiccup must not take down a fetch. Timestamps are stored as naive UTC (matching the
rest of the schema); the UI renders them as UTC.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import delete
from sqlmodel import Session, select

from app.database import engine
from app.models.scheduler import SchedulerJob, SchedulerLog

logger = logging.getLogger("app.scheduler")

# Keep the activity feed bounded.
LOG_RETENTION = 500

PLANNER_JOB_ID = "openf1-planner"


def _to_naive_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def record_log(
    level: str,
    action: str,
    message: str,
    *,
    event_id: int | None = None,
    session_id: int | None = None,
    openf1_rows: int | None = None,
) -> None:
    """Append one entry to the activity feed (and trim old rows)."""
    try:
        with Session(engine) as db:
            db.add(
                SchedulerLog(
                    level=level,
                    action=action,
                    message=(message or "")[:1000],
                    event_id=event_id,
                    session_id=session_id,
                    openf1_rows=openf1_rows,
                )
            )
            db.commit()
            _trim_logs(db)
    except Exception:  # pragma: no cover - observability must never break the job
        logger.exception("scheduler.state.record_log_failed action=%s", action)


def _trim_logs(db: Session) -> None:
    threshold = db.exec(
        select(SchedulerLog.id)
        .order_by(SchedulerLog.id.desc())
        .offset(LOG_RETENTION)
        .limit(1)
    ).first()
    if threshold is not None:
        db.execute(delete(SchedulerLog).where(SchedulerLog.id <= threshold))
        db.commit()


def upsert_job(
    job_id: str,
    kind: str,
    next_run_at: datetime,
    *,
    event_id: int | None = None,
    session_id: int | None = None,
    attempt: int | None = None,
) -> None:
    """Insert or refresh a pending-job row (keyed by ``job_id``)."""
    try:
        run_at = _to_naive_utc(next_run_at)
        now = datetime.utcnow()
        with Session(engine) as db:
            existing = db.exec(
                select(SchedulerJob).where(SchedulerJob.job_id == job_id)
            ).first()
            if existing:
                existing.kind = kind
                existing.event_id = event_id
                existing.session_id = session_id
                existing.attempt = attempt
                existing.next_run_at = run_at
                existing.updated_at = now
                db.add(existing)
            else:
                db.add(
                    SchedulerJob(
                        job_id=job_id,
                        kind=kind,
                        event_id=event_id,
                        session_id=session_id,
                        attempt=attempt,
                        next_run_at=run_at,
                        updated_at=now,
                    )
                )
            db.commit()
    except Exception:  # pragma: no cover
        logger.exception("scheduler.state.upsert_job_failed job_id=%s", job_id)


def remove_job(job_id: str) -> None:
    """Drop a pending-job row once it has completed/given up."""
    try:
        with Session(engine) as db:
            existing = db.exec(
                select(SchedulerJob).where(SchedulerJob.job_id == job_id)
            ).first()
            if existing:
                db.delete(existing)
                db.commit()
    except Exception:  # pragma: no cover
        logger.exception("scheduler.state.remove_job_failed job_id=%s", job_id)
