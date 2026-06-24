"""API-key middleware: enforces X-API-Key on /v1/ routes for external consumers."""

from __future__ import annotations

import hashlib
import threading
import time
from collections import defaultdict, deque
from datetime import date, datetime, timezone

from fastapi import Request
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

from app.database import readonly_engine
from app.models.api_key import ApiKey

# ---------------------------------------------------------------------------
# In-memory rate-limiter & daily quota tracker
# ---------------------------------------------------------------------------

_lock = threading.Lock()
_rate_windows: dict[int, deque[float]] = defaultdict(deque)
_daily_counts: dict[int, dict] = {}

# ---------------------------------------------------------------------------
# DB-lookup cache  (key_hash -> (ApiKey, expiry_monotonic))
# ---------------------------------------------------------------------------

_key_cache: dict[str, tuple[ApiKey, float]] = {}
_KEY_CACHE_TTL = 300  # seconds


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _lookup_key(key_hash: str) -> ApiKey | None:
    now = time.monotonic()
    cached = _key_cache.get(key_hash)
    if cached and now < cached[1]:
        return cached[0]

    with Session(readonly_engine) as session:
        api_key = session.exec(
            select(ApiKey).where(ApiKey.key_hash == key_hash)
        ).first()
        if api_key:
            # Detach from session so it's usable after close
            session.expunge(api_key)

    if api_key:
        _key_cache[key_hash] = (api_key, now + _KEY_CACHE_TTL)
    else:
        # Cache misses too, to avoid repeated DB hits for bad keys
        _key_cache[key_hash] = (None, now + 60)  # type: ignore[arg-type]
    return api_key


def invalidate_key_cache(key_hash: str | None = None) -> None:
    """Clear cached key(s). Call after admin updates a key."""
    if key_hash:
        _key_cache.pop(key_hash, None)
    else:
        _key_cache.clear()


# ---------------------------------------------------------------------------
# Rate-limit helpers
# ---------------------------------------------------------------------------


def _check_rate_limit(key_id: int, limit: int) -> tuple[bool, int]:
    """Sliding-window per-minute check. Returns (allowed, retry_after_secs)."""
    now = time.monotonic()
    with _lock:
        window = _rate_windows[key_id]
        cutoff = now - 60.0
        while window and window[0] < cutoff:
            window.popleft()
        if len(window) >= limit:
            retry_after = int(window[0] - cutoff) + 1
            return False, retry_after
        window.append(now)
        return True, 0


def _check_daily_quota(key_id: int, quota: int) -> tuple[bool, str]:
    """Daily counter (UTC). Returns (allowed, resets_at_iso)."""
    today = date.today().isoformat()
    with _lock:
        entry = _daily_counts.get(key_id)
        if not entry or entry["date"] != today:
            _daily_counts[key_id] = {"date": today, "count": 1}
            return True, ""
        if entry["count"] >= quota:
            return False, f"{today}T23:59:59Z"
        entry["count"] += 1
        return True, ""


def get_key_usage(key_id: int) -> dict:
    """Return current in-memory usage stats for an API key."""
    today = date.today().isoformat()
    with _lock:
        window = _rate_windows.get(key_id, deque())
        cutoff = time.monotonic() - 60.0
        recent = sum(1 for t in window if t >= cutoff)
        daily = _daily_counts.get(key_id, {})
        daily_count = daily.get("count", 0) if daily.get("date") == today else 0
    return {"requests_last_minute": recent, "requests_today": daily_count}


# ---------------------------------------------------------------------------
# Origin / Referer helpers
# ---------------------------------------------------------------------------


def _is_trusted_origin(
    origin: str, referer: str, allowed_origins: list[str]
) -> bool:
    if "*" in allowed_origins:
        return True
    if origin:
        return origin in allowed_origins
    if referer:
        return any(referer.startswith(o) for o in allowed_origins)
    return False


# ---------------------------------------------------------------------------
# Middleware factory
# ---------------------------------------------------------------------------

_SKIP_PATHS = frozenset({"/v1/docs", "/v1/openapi.json"})


def make_api_key_middleware(
    allowed_origins: list[str],
    require: bool,
):
    """Return an ASGI middleware function for API-key enforcement."""

    async def api_key_check(request: Request, call_next):
        if not require:
            return await call_next(request)

        path: str = request.scope.get("path", "")

        # Only enforce on public /v1/ API routes
        if not path.startswith("/v1/"):
            return await call_next(request)

        if path in _SKIP_PATHS:
            return await call_next(request)

        # CORS preflight
        if request.method == "OPTIONS":
            return await call_next(request)

        # Frontend bypass
        origin = request.headers.get("origin", "")
        referer = request.headers.get("referer", "")
        if _is_trusted_origin(origin, referer, allowed_origins):
            return await call_next(request)

        # ---- Require X-API-Key ----
        raw_key = request.headers.get("x-api-key")
        if not raw_key:
            return JSONResponse(
                status_code=401,
                content={"detail": "API key required. Include an X-API-Key header."},
            )

        key_hash = _hash_key(raw_key)
        api_key = _lookup_key(key_hash)

        if api_key is None or not api_key.is_active:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid or inactive API key."},
            )

        if api_key.expires_at and api_key.expires_at < datetime.now(timezone.utc):
            return JSONResponse(
                status_code=401,
                content={"detail": "API key has expired."},
            )

        # Rate limit
        allowed, retry_after = _check_rate_limit(
            api_key.id, api_key.rate_limit_per_minute
        )
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Rate limit exceeded.",
                    "retry_after": retry_after,
                },
                headers={"Retry-After": str(retry_after)},
            )

        # Daily quota
        allowed, resets_at = _check_daily_quota(api_key.id, api_key.daily_quota)
        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": "Daily quota exceeded.",
                    "quota": api_key.daily_quota,
                    "resets_at": resets_at,
                },
                headers={"Retry-After": "3600"},
            )

        return await call_next(request)

    return api_key_check
