"""Admin-only read API exposing the OpenF1 scheduler's state for the UI.

The scheduler runs in a separate process and writes its activity/pending jobs to the
`scheduler_log` / `scheduler_job` tables (see `app.scheduler.state`). This router just
reads them back, resolving event/session ids to human-friendly names.
"""

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select

from app.core.auth import require_role
from app.database import get_readonly_session
from app.models.event import Event
from app.models.scheduler import SchedulerJob, SchedulerLog
from app.models.session import Session as SessionModel
from app.models.user import UserRole

admin_router = APIRouter(
    prefix="/api/admin/scheduler",
    tags=["scheduler"],
    dependencies=[Depends(require_role({UserRole.admin}))],
)


def _event_names(db: Session, event_ids: list[int]) -> dict[int, str]:
    if not event_ids:
        return {}
    rows = db.exec(
        select(Event.id, Event.event_name).where(Event.id.in_(event_ids))
    ).all()
    return {row[0]: row[1] for row in rows}


def _session_types(db: Session, session_ids: list[int]) -> dict[int, str]:
    if not session_ids:
        return {}
    rows = db.exec(
        select(SessionModel.id, SessionModel.type).where(
            SessionModel.id.in_(session_ids)
        )
    ).all()
    return {row[0]: str(getattr(row[1], "value", row[1])) for row in rows}


@admin_router.get("/status")
def get_scheduler_status(
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_readonly_session),
) -> dict:
    """Return the next scheduled run, all pending jobs, and recent activity logs."""
    jobs = db.exec(
        select(SchedulerJob).order_by(SchedulerJob.next_run_at.asc())
    ).all()
    logs = db.exec(
        select(SchedulerLog).order_by(SchedulerLog.id.desc()).limit(limit)
    ).all()

    event_ids = {j.event_id for j in jobs if j.event_id} | {
        log.event_id for log in logs if log.event_id
    }
    session_ids = {j.session_id for j in jobs if j.session_id} | {
        log.session_id for log in logs if log.session_id
    }
    event_names = _event_names(db, list(event_ids))
    session_types = _session_types(db, list(session_ids))

    def job_dict(j: SchedulerJob) -> dict:
        return {
            "job_id": j.job_id,
            "kind": j.kind,
            "event_id": j.event_id,
            "session_id": j.session_id,
            "event_name": event_names.get(j.event_id) if j.event_id else None,
            "session_type": session_types.get(j.session_id) if j.session_id else None,
            "attempt": j.attempt,
            "next_run_at": j.next_run_at.isoformat() if j.next_run_at else None,
        }

    def log_dict(log: SchedulerLog) -> dict:
        return {
            "id": log.id,
            "created_at": log.created_at.isoformat() if log.created_at else None,
            "level": log.level,
            "action": log.action,
            "event_id": log.event_id,
            "session_id": log.session_id,
            "event_name": event_names.get(log.event_id) if log.event_id else None,
            "session_type": session_types.get(log.session_id)
            if log.session_id
            else None,
            "openf1_rows": log.openf1_rows,
            "message": log.message,
        }

    return {
        # jobs are sorted ascending, so the first is the soonest upcoming run.
        "next_run_at": jobs[0].next_run_at.isoformat() if jobs else None,
        "jobs": [job_dict(j) for j in jobs],
        "logs": [log_dict(log) for log in logs],
    }
