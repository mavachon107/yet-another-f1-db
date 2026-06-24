"""Transport-agnostic facade over the OpenF1 fetch logic.

The DB-writing logic lives in the router modules (``app.routers.session`` and
``app.routers.session_result``) as ``_impl_*`` functions so the web endpoints and this
service share one implementation. Those impls raise ``fastapi.HTTPException`` to preserve
the web routes' status codes. This module is the boundary the **scheduler** imports: it
calls the impls and re-raises any ``HTTPException`` as a domain exception from
``app.services.openf1_errors`` so no FastAPI semantics leak into the background process.

All functions take an open SQLModel ``Session`` and return the same dict the routes do.
"""

from __future__ import annotations

from fastapi import HTTPException
from sqlmodel import Session

from app.services.openf1_errors import (
    HTTP_STATUS_TO_EXCEPTION,
    OpenF1FetchError,
    OpenF1NoMatch,
    OpenF1Upstream,
)

__all__ = [
    "fetch_meeting_sessions_weather",
    "fetch_session_results",
    "fetch_weather",
    "fetch_fastest_laps",
    "resolve_event_openf1_sessions",
    "infer_session_type",
    "parse_openf1_datetime",
]


def _translate(exc: HTTPException) -> OpenF1FetchError:
    """Map an HTTPException raised by the impls to a domain exception."""
    cls = HTTP_STATUS_TO_EXCEPTION.get(exc.status_code, OpenF1Upstream)
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return cls(detail)


def fetch_meeting_sessions_weather(db: Session, event_id: int) -> dict:
    """Sync the local session schedule for an event from OpenF1 (idempotent)."""
    from app.routers.session import _impl_fetch_meeting_sessions_weather

    try:
        return _impl_fetch_meeting_sessions_weather(db, event_id)
    except HTTPException as exc:
        raise _translate(exc) from exc


def fetch_session_results(db: Session, session_id: int) -> dict:
    """Fetch + upsert OpenF1 session results for one session (idempotent)."""
    from app.routers.session import _impl_fetch_session_results

    try:
        return _impl_fetch_session_results(db, session_id)
    except HTTPException as exc:
        raise _translate(exc) from exc


def fetch_weather(db: Session, session_id: int) -> dict:
    """Fetch + replace OpenF1 weather for one session (idempotent)."""
    from app.routers.session import _impl_fetch_weather

    try:
        return _impl_fetch_weather(db, session_id)
    except HTTPException as exc:
        raise _translate(exc) from exc


def fetch_fastest_laps(db: Session, event_id: int) -> dict:
    """Fetch + upsert OpenF1 race fastest laps for an event (idempotent)."""
    from app.routers.session_result import _impl_fetch_fastest_laps

    try:
        return _impl_fetch_fastest_laps(db, event_id)
    except HTTPException as exc:
        raise _translate(exc) from exc


def resolve_event_openf1_sessions(event, circuit) -> tuple[dict, list[dict]]:
    """Resolve the OpenF1 meeting for an event and return ``(meeting, sessions)``.

    Used by the planner to read true-UTC ``date_end`` values for scheduling. Raises
    domain exceptions only (never HTTPException) so the scheduler stays FastAPI-free.
    """
    from app.routers.session import (
        _openf1_get,
        _resolve_openf1_meeting_for_event,
    )

    try:
        meeting, _details = _resolve_openf1_meeting_for_event(event, circuit)
    except HTTPException as exc:
        raise _translate(exc) from exc

    meeting_key = meeting.get("meeting_key")
    if meeting_key is None:
        raise OpenF1NoMatch("OpenF1 meeting key missing in matched payload.")

    try:
        sessions = _openf1_get("sessions", {"meeting_key": meeting_key})
    except (ValueError, RuntimeError) as exc:
        raise OpenF1Upstream(str(exc)) from exc
    return meeting, sessions


def infer_session_type(openf1_session: dict):
    """Map an OpenF1 session payload to a local ``SessionType`` (or ``None``)."""
    from app.routers.session import _infer_local_session_type_from_openf1

    return _infer_local_session_type_from_openf1(openf1_session)


def parse_openf1_datetime(value):
    """Parse an OpenF1 ISO datetime to a naive-UTC ``datetime`` (or ``None``)."""
    from app.routers.session import _parse_iso_datetime

    return _parse_iso_datetime(value)
