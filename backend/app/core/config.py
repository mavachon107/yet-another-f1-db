import os
from datetime import timedelta


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _require_secret(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value or value == "change-me":
        raise RuntimeError(
            f"Environment variable '{name}' must be set to a strong secret before starting the server."
        )
    return value


JWT_SECRET_KEY = _require_secret("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_MINUTES = _env_int("ACCESS_TOKEN_MINUTES", 30)
REFRESH_TOKEN_DAYS = _env_int("REFRESH_TOKEN_DAYS", 14)


# --- OpenF1 auto-fetch scheduler ---------------------------------------------
# Consumed by the standalone scheduler process (app.scheduler). The web app does
# not read these. See docker-compose.yml "scheduler" service.
SCHEDULER_PLANNER_INTERVAL_H = _env_int("SCHEDULER_PLANNER_INTERVAL_H", 6)
SCHEDULER_WINDOW_PAST_DAYS = _env_int("SCHEDULER_WINDOW_PAST_DAYS", 2)
SCHEDULER_WINDOW_FUTURE_DAYS = _env_int("SCHEDULER_WINDOW_FUTURE_DAYS", 10)
SCHEDULER_FETCH_DELAY_MIN = _env_int("SCHEDULER_FETCH_DELAY_MIN", 5)
SCHEDULER_RETRY_INTERVAL_MIN = _env_int("SCHEDULER_RETRY_INTERVAL_MIN", 10)
SCHEDULER_MAX_RETRIES = _env_int("SCHEDULER_MAX_RETRIES", 6)
SCHEDULER_STALE_GRACE_H = _env_int("SCHEDULER_STALE_GRACE_H", 6)
SCHEDULER_FINAL_SWEEP_WINDOW_H = _env_int("SCHEDULER_FINAL_SWEEP_WINDOW_H", 24)
SCHEDULER_FINAL_SWEEP_DELAY_H = _env_int("SCHEDULER_FINAL_SWEEP_DELAY_H", 3)
SCHEDULER_SYNC_SCHEDULE = _env_bool("SCHEDULER_SYNC_SCHEDULE", True)


def access_token_ttl() -> timedelta:
    return timedelta(minutes=ACCESS_TOKEN_MINUTES)


def refresh_token_ttl() -> timedelta:
    return timedelta(days=REFRESH_TOKEN_DAYS)
