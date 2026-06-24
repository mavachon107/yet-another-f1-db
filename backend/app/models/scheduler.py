"""Models backing the scheduler observability UI.

The OpenF1 scheduler runs as a separate process from the web app, so it can't expose
its in-memory state directly. Instead it persists what it's doing to these two tables,
which the admin "Scheduler" page reads:

- ``scheduler_log`` — append-only activity feed (fetched/retry/error/...).
- ``scheduler_job`` — snapshot of currently-pending jobs, upserted by job id, used to
  show the next scheduled run and upcoming work.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel


class SchedulerLog(SQLModel, table=True):
    __tablename__ = "scheduler_log"

    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow, index=True)
    level: str = Field(default="info", max_length=20)  # info | success | warning | error
    action: str = Field(default="", max_length=40)  # planner | scheduled | fetch | retry | ...
    event_id: Optional[int] = Field(default=None, index=True)
    session_id: Optional[int] = Field(default=None, index=True)
    openf1_rows: Optional[int] = None
    message: str = Field(default="", max_length=1000)


class SchedulerJob(SQLModel, table=True):
    __tablename__ = "scheduler_job"

    id: Optional[int] = Field(default=None, primary_key=True)
    job_id: str = Field(sa_column=Column(String(80), unique=True, index=True))
    kind: str = Field(default="", max_length=20)  # planner | fetch | final
    event_id: Optional[int] = None
    session_id: Optional[int] = None
    attempt: Optional[int] = None
    next_run_at: datetime = Field(index=True)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
