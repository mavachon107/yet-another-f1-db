from collections import Counter
from datetime import date, datetime, timedelta, timezone
import json
import logging
import re
import threading
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session, select

from app.core.auth import require_role
from app.models.circuit import Circuit
from app.models.entry import EventEntry
from app.models.event import Event
from app.models.session_result import SessionResult
from app.models.session_weather import (
    SessionWeather,
    SessionWeatherSeriesRead,
    SessionWeatherSummary,
)

from app.database import get_readonly_session, get_session
from app.models.session import Session as SessionModel
from app.models.session import SessionCreate, SessionRead, SessionType, SessionUpdate
from app.models.user import User, UserRole
from app.utils import model_dump

router = APIRouter(prefix="/sessions", tags=["sessions"])
public_router = APIRouter(prefix="/v1/sessions", tags=["sessions"])
admin_router = APIRouter(
    prefix="/api/admin/sessions",
    tags=["sessions"],
    dependencies=[Depends(require_role({UserRole.admin, UserRole.editor}))],
)

logger = logging.getLogger(__name__)
OPENF1_BASE_URL = "https://api.openf1.org/v1"
OPENF1_ALLOWED_RESOURCES = {"meetings", "sessions", "weather", "session_result", "laps"}

# OpenF1 enforces a 30 requests/minute limit. Resolving a meeting/session re-fetches
# the same year's `meetings` and a meeting's `sessions` list repeatedly, so we:
#   - cache those stable lookups in-process (TTL), collapsing dozens of calls to a few;
#   - throttle to stay under the limit (~28/min);
#   - back off and retry on HTTP 429.
# Data resources (session_result/weather/laps) are NOT cached so manual re-fetches and
# the scheduler's retries always see fresh results.
OPENF1_CACHEABLE_RESOURCES = {"meetings", "sessions"}
OPENF1_CACHE_TTL_SECONDS = 600
OPENF1_MIN_REQUEST_INTERVAL_SECONDS = 2.1
OPENF1_RATE_LIMIT_MAX_RETRIES = 5

_openf1_cache: dict[str, tuple[float, list]] = {}
_openf1_cache_lock = threading.Lock()
_openf1_throttle_lock = threading.Lock()
_openf1_last_request_at = 0.0


def _openf1_throttle() -> None:
    """Block until at least the minimum interval since the last request has elapsed."""
    global _openf1_last_request_at
    with _openf1_throttle_lock:
        wait = OPENF1_MIN_REQUEST_INTERVAL_SECONDS - (
            time.monotonic() - _openf1_last_request_at
        )
        if wait > 0:
            time.sleep(wait)
        _openf1_last_request_at = time.monotonic()


def _openf1_retry_after_seconds(exc: HTTPError, attempt: int) -> float:
    """Seconds to wait after a 429: honour Retry-After if present, else exponential."""
    header = exc.headers.get("Retry-After") if exc.headers else None
    if header:
        try:
            return max(1.0, float(int(header)))
        except (TypeError, ValueError):
            pass
    return min(60.0, 2.0 * (2 ** attempt))  # 2, 4, 8, 16, 32 (capped at 60)





def _fetch_open_meteo_weather_range(
    lat: float,
    lon: float,
    start_dt: datetime,
    end_dt: datetime,
    tz: str,
) -> list[dict]:
    """Fetch hourly weather records from the Open-Meteo archive API.

    ``start_dt`` and ``end_dt`` must be naive datetimes in the circuit's
    local timezone (as stored in the DB via ``_to_local_datetime_for_storage``).
    Passing ``timezone=tz`` to Open-Meteo makes it both interpret
    ``start_date``/``end_date`` as local dates AND return ``time`` values as
    local ISO strings (e.g. "2024-03-23T14:00") — never UTC.  The filter
    below therefore compares local times on both sides.

    Returns a list of dicts, one per hour that falls within
    [start_dt - 30min, end_dt + 30min], each with keys:
        recorded_at      (datetime, naive, local time per tz)
        air_temperature  (float | None)
        rainfall         (float | None)  – mm accumulated that hour
        wind_speed       (float | None)  – m/s at 10 m
        weather_code     (int | None)    – WMO code
    """
    padding = timedelta(minutes=30)
    # window_start / window_end are in local time — same frame as Open-Meteo response
    window_start = start_dt - padding
    window_end = end_dt + padding

    params = {
        "latitude": lat,
        "longitude": lon,
        # Open-Meteo interprets these as LOCAL dates when timezone is set
        "start_date": window_start.date().isoformat(),
        "end_date": window_end.date().isoformat(),
        "hourly": "temperature_2m,rain,wind_speed_10m,weather_code",
        "wind_speed_unit": "ms",  # m/s — matches OpenF1 wind_speed unit
        "timezone": tz or "UTC",
    }
    url = f"https://archive-api.open-meteo.com/v1/archive?{urlencode(params)}"
    with urlopen(url, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))

    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        raise ValueError("No hourly data returned from Open-Meteo.")

    temps = hourly.get("temperature_2m") or []
    rains = hourly.get("rain") or []
    winds = hourly.get("wind_speed_10m") or []
    codes = hourly.get("weather_code") or []

    def _val(series: list, idx: int):
        if idx < len(series):
            v = series[idx]
            return None if v is None else v
        return None

    records = []
    for idx, time_str in enumerate(times):
        try:
            # Open-Meteo returns local ISO strings (no tzinfo) when timezone is set
            candidate = datetime.fromisoformat(time_str)
        except ValueError:
            continue
        # Both candidate and window bounds are in local time — comparison is valid
        if candidate < window_start or candidate > window_end:
            continue
        records.append(
            {
                "recorded_at": candidate,
                "air_temperature": _val(temps, idx),
                "rainfall": _val(rains, idx),
                "wind_speed": _val(winds, idx),
                "weather_code": _safe_int(_val(codes, idx)),
            }
        )
    return records


def _normalize_text(value) -> str:
    if value is None:
        return ""
    text = str(value).lower()
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def _tokenize_text(value) -> set[str]:
    normalized = _normalize_text(value)
    if not normalized:
        return set()
    return {token for token in normalized.split(" ") if token}


def _parse_iso_datetime(value) -> datetime | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _parse_iso_date(value) -> date | None:
    dt = _parse_iso_datetime(value)
    if dt:
        return dt.date()
    text = str(value or "").strip()
    if len(text) >= 10:
        try:
            return date.fromisoformat(text[:10])
        except ValueError:
            return None
    return None


def _parse_gmt_offset(value) -> timedelta | None:
    text = str(value or "").strip()
    if not text:
        return None
    match = re.match(r"^([+-]?)(\d{2}):(\d{2})(?::(\d{2}))?$", text)
    if not match:
        return None
    sign = -1 if match.group(1) == "-" else 1
    hours = int(match.group(2))
    minutes = int(match.group(3))
    seconds = int(match.group(4) or "0")
    delta = timedelta(hours=hours, minutes=minutes, seconds=seconds)
    return -delta if sign < 0 else delta


def _to_local_datetime_for_storage(
    utc_datetime: datetime | None,
    gmt_offset: str | None,
) -> datetime | None:
    if utc_datetime is None:
        return None
    offset_delta = _parse_gmt_offset(gmt_offset)
    if offset_delta is None:
        return utc_datetime
    return utc_datetime + offset_delta


def _safe_int(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return int(float(text))
    except (TypeError, ValueError):
        return None


def _safe_float(value) -> float | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _safe_text(value) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_text_with_null_list(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, (list, tuple)):
        for item in value:
            normalized = _safe_text(item)
            if normalized is not None:
                return normalized
        return None
    return _safe_text(value)


def _is_true_flag(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    if isinstance(value, (int, float)):
        return value != 0
    text = str(value).strip().lower()
    return text in {"1", "true", "t", "yes", "y"}


def _format_duration_seconds_to_time(value) -> str | None:
    seconds_value = _safe_float(value)
    if seconds_value is None:
        return None
    if seconds_value < 0:
        return None
    total_milliseconds = int(round(seconds_value * 1000))
    minutes = total_milliseconds // 60000
    seconds = (total_milliseconds % 60000) // 1000
    milliseconds = total_milliseconds % 1000
    return f"{minutes}:{seconds:02d}.{milliseconds:03d}"


def _format_openf1_time(value) -> str | None:
    normalized = _safe_text(value)
    if normalized is None:
        return None
    if ":" in normalized:
        return normalized
    seconds_value = _safe_float(normalized)
    if seconds_value is None:
        return normalized
    return _format_duration_seconds_to_time(seconds_value)


def _first_non_none(*values):
    for value in values:
        if value is not None:
            return value
    return None


def _round_float(value, digits=3):
    if value is None:
        return None
    return round(float(value), digits)


def _parse_numeric_position(value) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or not text.isdigit():
        return None
    try:
        return int(text)
    except ValueError:
        return None


def _value_for_phase(value, phase_index: int | None):
    if phase_index is None:
        return value
    if isinstance(value, (list, tuple)):
        if 0 <= phase_index < len(value):
            return value[phase_index]
    return None


def _value_for_phase_with_fallback(
    row: dict,
    phase_index: int | None,
    base_keys: tuple[str, ...],
    phase_key_map: dict[int, str | tuple[str, ...] | list[str]] | None = None,
):
    if phase_index is None:
        for key in base_keys:
            value = row.get(key)
            if value is not None:
                return value
        return None

    if phase_key_map:
        phase_key = phase_key_map.get(phase_index)
        if phase_key:
            phase_keys = (
                (phase_key,)
                if isinstance(phase_key, str)
                else tuple(phase_key)
            )
            for phase_key_name in phase_keys:
                phase_value = row.get(phase_key_name)
                if phase_value is not None:
                    return phase_value

    for key in base_keys:
        value = row.get(key)
        phase_value = _value_for_phase(value, phase_index)
        if phase_value is not None:
            return phase_value
    return None


def _openf1_get(resource: str, params: dict | None = None):
    normalized_resource = str(resource or "").strip().lstrip("/").lower()
    if normalized_resource not in OPENF1_ALLOWED_RESOURCES:
        raise ValueError("Unsupported OpenF1 resource.")

    query = urlencode(params or {})
    cache_key = f"{normalized_resource}?{query}"
    cacheable = normalized_resource in OPENF1_CACHEABLE_RESOURCES

    if cacheable:
        with _openf1_cache_lock:
            cached = _openf1_cache.get(cache_key)
            if cached and (time.monotonic() - cached[0]) < OPENF1_CACHE_TTL_SECONDS:
                return list(cached[1])

    url = f"{OPENF1_BASE_URL}/{normalized_resource}"
    if query:
        url = f"{url}?{query}"

    request = Request(
        url,
        headers={
            "User-Agent": "f1-datahub/1.0 (+https://api.openf1.org)",
            "Accept": "application/json",
        },
    )

    payload = None
    for attempt in range(OPENF1_RATE_LIMIT_MAX_RETRIES + 1):
        _openf1_throttle()
        try:
            with urlopen(request, timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
            break
        except HTTPError as exc:
            # OpenF1 returns 404 with {"detail":"No results found."} when a query
            # matches nothing — treat it as an empty result set, not an error.
            if exc.code == 404:
                logger.debug(
                    "openf1.no_results resource=%s params=%s",
                    normalized_resource,
                    params,
                )
                return []
            if exc.code == 429 and attempt < OPENF1_RATE_LIMIT_MAX_RETRIES:
                delay = _openf1_retry_after_seconds(exc, attempt)
                logger.warning(
                    "openf1.rate_limited resource=%s attempt=%s sleeping=%.1fs",
                    normalized_resource,
                    attempt + 1,
                    delay,
                )
                time.sleep(delay)
                continue
            body = ""
            try:
                body = (exc.read() or b"").decode("utf-8", errors="replace")
            except Exception:
                body = ""
            logger.warning(
                "openf1.http_error resource=%s status=%s body=%s",
                normalized_resource,
                exc.code,
                body[:400],
            )
            raise RuntimeError(f"OpenF1 upstream HTTP {exc.code}.") from exc
        except (URLError, TimeoutError, json.JSONDecodeError) as exc:
            logger.warning(
                "openf1.request_error resource=%s error=%s",
                normalized_resource,
                str(exc),
            )
            raise RuntimeError("OpenF1 upstream request failed.") from exc

    if not isinstance(payload, list):
        logger.warning(
            "openf1.unexpected_payload resource=%s payload_type=%s",
            normalized_resource,
            type(payload).__name__,
        )
        raise RuntimeError("Unexpected OpenF1 payload shape.")

    if cacheable:
        with _openf1_cache_lock:
            _openf1_cache[cache_key] = (time.monotonic(), payload)
    return payload


def _compute_weather_summary(
    session_id: int,
    points: list[SessionWeather],
) -> SessionWeatherSummary:
    air_values = [point.air_temperature for point in points if point.air_temperature is not None]
    track_values = [
        point.track_temperature
        for point in points
        if point.track_temperature is not None
    ]
    rainfall_values = [point.rainfall for point in points if point.rainfall is not None]
    wind_values = [point.wind_speed for point in points if point.wind_speed is not None]

    code_values = [point.weather_code for point in points if point.weather_code is not None]
    dominant_code: int | None = Counter(code_values).most_common(1)[0][0] if code_values else None

    return SessionWeatherSummary(
        session_id=session_id,
        sample_count=len(points),
        air_temperature_min=_round_float(min(air_values), 2) if air_values else None,
        air_temperature_max=_round_float(max(air_values), 2) if air_values else None,
        track_temperature_min=_round_float(min(track_values), 2) if track_values else None,
        track_temperature_max=_round_float(max(track_values), 2) if track_values else None,
        rainfall=_round_float(sum(rainfall_values), 3) if rainfall_values else None,
        wind_speed_min=_round_float(min(wind_values), 2) if wind_values else None,
        wind_speed_max=_round_float(max(wind_values), 2) if wind_values else None,
        weather_code=dominant_code,
    )


def _attach_weather_summary(
    sessions: list[SessionModel],
    db: Session,
) -> list[SessionRead]:
    if not sessions:
        return []
    session_ids = [item.id for item in sessions if item.id is not None]
    if not session_ids:
        return [SessionRead(**model_dump(item)) for item in sessions]
    weather_rows = db.exec(
        select(SessionWeather)
        .where(SessionWeather.session_id.in_(session_ids))
        .order_by(SessionWeather.recorded_at.asc())
    ).all()
    weather_by_session_id: dict[int, list[SessionWeather]] = {}
    for row in weather_rows:
        weather_by_session_id.setdefault(row.session_id, []).append(row)

    resolved_sessions: list[SessionRead] = []
    for session_item in sessions:
        summary = _compute_weather_summary(
            session_id=session_item.id,
            points=weather_by_session_id.get(session_item.id, []),
        )
        payload = model_dump(session_item)
        payload.update(
            {
                "air_temperature_min": summary.air_temperature_min,
                "air_temperature_max": summary.air_temperature_max,
                "track_temperature_min": summary.track_temperature_min,
                "track_temperature_max": summary.track_temperature_max,
                "rainfall": summary.rainfall,
                "wind_speed_min": summary.wind_speed_min,
                "wind_speed_max": summary.wind_speed_max,
                "weather_code": summary.weather_code,
            }
        )
        resolved_sessions.append(SessionRead(**payload))
    return resolved_sessions


def _name_similarity_score(source_name: str, candidate_name: str) -> float:
    source_tokens = _tokenize_text(source_name)
    candidate_tokens = _tokenize_text(candidate_name)
    if not source_tokens or not candidate_tokens:
        return 0.0
    overlap = source_tokens.intersection(candidate_tokens)
    union = source_tokens.union(candidate_tokens)
    return len(overlap) / max(1, len(union))


def _score_meeting_candidate(
    meeting: dict,
    event_date: date,
    event_country: str,
    event_name: str,
    event_official_name: str,
    circuit_short_name: str = "",
) -> tuple[float, dict]:
    score = 0.0
    reasons = {}

    meeting_start = _parse_iso_date(
        meeting.get("date_start") or meeting.get("meeting_date_start")
    )
    meeting_end = _parse_iso_date(meeting.get("date_end") or meeting.get("meeting_date_end"))
    meeting_date = _parse_iso_date(meeting.get("date") or meeting.get("meeting_date"))

    if meeting_start and meeting_end and meeting_start <= event_date <= meeting_end:
        score += 80.0
        reasons["date_overlap"] = True
    else:
        reference_date = meeting_start or meeting_date or meeting_end
        if reference_date:
            day_delta = abs((reference_date - event_date).days)
            date_score = max(0.0, 45.0 - float(day_delta * 3))
            score += date_score
            reasons["date_delta_days"] = day_delta
            reasons["date_score"] = date_score

    meeting_country = _normalize_text(
        meeting.get("country_name") or meeting.get("country") or meeting.get("location")
    )
    normalized_event_country = _normalize_text(event_country)
    if normalized_event_country and meeting_country:
        country_match = normalized_event_country == meeting_country
        if not country_match and normalized_event_country in meeting_country:
            country_match = True
        if country_match:
            score += 15.0
            reasons["country_match"] = True

    # Circuit short name match against OpenF1 circuit_short_name — reliable fallback
    # when event dates don't line up (e.g. event_date is race day but meeting spans Thu–Sun).
    normalized_circuit = _normalize_text(circuit_short_name)
    openf1_circuit = _normalize_text(meeting.get("circuit_short_name") or "")
    if normalized_circuit and openf1_circuit:
        if normalized_circuit == openf1_circuit or normalized_circuit in openf1_circuit or openf1_circuit in normalized_circuit:
            score += 20.0
            reasons["circuit_short_name_match"] = True

    meeting_name = meeting.get("meeting_name") or ""
    meeting_official_name = meeting.get("meeting_official_name") or ""
    similarity = max(
        _name_similarity_score(event_name, meeting_name),
        _name_similarity_score(event_name, meeting_official_name),
        _name_similarity_score(event_official_name, meeting_name),
        _name_similarity_score(event_official_name, meeting_official_name),
    )
    if similarity > 0:
        similarity_score = similarity * 25.0
        score += similarity_score
        reasons["name_similarity"] = round(similarity, 3)
        reasons["name_score"] = round(similarity_score, 3)

    reasons["meeting_key"] = meeting.get("meeting_key")
    reasons["meeting_name"] = meeting_name or meeting_official_name or "unknown"
    reasons["score"] = round(score, 3)
    return score, reasons


def _resolve_openf1_meeting_for_event(
    event: Event,
    circuit: Circuit | None,
) -> tuple[dict, dict]:
    event_date = getattr(event, "event_date", None)
    if not event_date:
        raise HTTPException(status_code=422, detail="Event date required to match OpenF1 meeting.")
    year = event_date.year
    event_country = circuit.country if circuit else ""
    circuit_short_name = circuit.short_name if circuit else ""
    event_name = event.event_name or ""
    event_official_name = event.event_official_name or ""

    meetings = _openf1_get("meetings", {"year": year})
    if not meetings:
        raise HTTPException(status_code=422, detail="No OpenF1 meeting found for this event.")

    scored = []
    for candidate in meetings:
        if not isinstance(candidate, dict):
            continue
        score, reasons = _score_meeting_candidate(
            candidate, event_date, event_country, event_name, event_official_name,
            circuit_short_name=circuit_short_name,
        )
        scored.append((score, candidate, reasons))

    if not scored:
        raise HTTPException(status_code=422, detail="No OpenF1 meeting found for this event.")

    scored.sort(key=lambda item: item[0], reverse=True)
    top_score = scored[0][0]
    if top_score < 25:
        raise HTTPException(status_code=422, detail="No viable OpenF1 meeting match for this event.")

    tied_top = [item for item in scored if abs(item[0] - top_score) < 0.001]
    if len(tied_top) > 1:
        raise HTTPException(status_code=409, detail="Ambiguous OpenF1 meeting match for this event.")

    best_score, best_meeting, best_reason = scored[0]
    logger.info(
        "openf1.meeting_resolved event_id=%s meeting_key=%s score=%.3f candidates=%s",
        getattr(event, "id", None),
        best_meeting.get("meeting_key"),
        best_score,
        len(scored),
    )
    details = {
        "candidate_count": len(scored),
        "top_score": round(best_score, 3),
        "winner": best_reason,
        "top_candidates": [item[2] for item in scored[:5]],
    }
    return best_meeting, details


def _session_name_matches(local_session_type: str, openf1_session_name: str) -> bool:
    local_type = _normalize_text(local_session_type)
    session_name = _normalize_text(openf1_session_name)
    if not local_type or not session_name:
        return False

    aliases = {
        "fp1": {"practice 1", "free practice 1", "fp1"},
        "fp2": {"practice 2", "free practice 2", "fp2"},
        "fp3": {"practice 3", "free practice 3", "fp3"},
        "quali": {"qualifying", "qualification", "quali"},
        "q1": {"q1"},
        "q2": {"q2"},
        "q3": {"q3"},
        "sq": {"sprint shootout", "sprint qualifying", "shootout"},
        "sq1": {"sq1"},
        "sq2": {"sq2"},
        "sq3": {"sq3"},
        "sr": {"sprint race", "sprint"},
        "race": {"race", "grand prix"},
    }
    values = aliases.get(local_type, {local_type})
    return any(value in session_name for value in values)


def _resolve_openf1_session_for_local_session(
    local_session: SessionModel,
    openf1_sessions: list[dict],
) -> tuple[dict, dict]:
    local_type = getattr(local_session.type, "value", local_session.type)
    local_start = _parse_iso_datetime(local_session.date_time_start)
    candidates = []

    for item in openf1_sessions:
        if not isinstance(item, dict):
            continue
        session_name = item.get("session_name") or item.get("session_type") or ""
        if not _session_name_matches(str(local_type), str(session_name)):
            continue
        openf1_start_utc = _parse_iso_datetime(item.get("date_start"))
        openf1_start = _to_local_datetime_for_storage(
            openf1_start_utc,
            item.get("gmt_offset"),
        )
        if local_start and openf1_start:
            delta = abs((openf1_start - local_start).total_seconds())
        else:
            delta = 0.0
        candidates.append((delta, item))

    if not candidates:
        raise HTTPException(status_code=422, detail="No viable OpenF1 session match for this session.")

    candidates.sort(key=lambda item: item[0])
    top_delta = candidates[0][0]
    tied_top = [item for item in candidates if abs(item[0] - top_delta) < 1]
    if len(tied_top) > 1:
        raise HTTPException(status_code=409, detail="Ambiguous OpenF1 session match for this session.")

    resolved = candidates[0][1]
    details = {
        "candidate_count": len(candidates),
        "closest_time_delta_seconds": round(float(top_delta), 3),
        "matched_session_name": resolved.get("session_name"),
    }
    logger.info(
        "openf1.session_resolved session_id=%s session_key=%s delta=%.3f candidates=%s",
        getattr(local_session, "id", None),
        resolved.get("session_key"),
        float(top_delta),
        len(candidates),
    )
    return resolved, details


def _infer_local_session_type_from_openf1(session_item: dict) -> SessionType | None:
    name = _normalize_text(session_item.get("session_name") or session_item.get("session_type"))
    if not name:
        return None
    if "practice 1" in name or name == "fp1":
        return SessionType.FP1
    if "practice 2" in name or name == "fp2":
        return SessionType.FP2
    if "practice 3" in name or name == "fp3":
        return SessionType.FP3
    if "sprint shootout" in name or "sprint qualifying" in name:
        return SessionType.SQ
    if name == "sq1":
        return SessionType.SQ1
    if name == "sq2":
        return SessionType.SQ2
    if name == "sq3":
        return SessionType.SQ3
    if "qualifying" in name:
        return SessionType.QUALI
    if name == "q1":
        return SessionType.Q1
    if name == "q2":
        return SessionType.Q2
    if name == "q3":
        return SessionType.Q3
    if "sprint" in name:
        # OpenF1 names the sprint race session simply "Sprint" (not "Sprint Race").
        return SessionType.SR
    if "race" in name or "grand prix" in name:
        return SessionType.RACE
    return None

@admin_router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
def create_session(
    session_in: SessionCreate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SessionRead:
    payload = model_dump(session_in)
    session_model = SessionModel(**payload)
    session.add(session_model)
    session.commit()
    session.refresh(session_model)
    return session_model


@public_router.get("", response_model=list[SessionRead])
def list_sessions_public(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_readonly_session),
) -> list[SessionRead]:
    return list_sessions(offset=offset, limit=limit, session=session)


@admin_router.get("", response_model=list[SessionRead])
@router.get("", response_model=list[SessionRead])
def list_sessions(
    offset: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    session: Session = Depends(get_session),
) -> list[SessionRead]:
    statement = (
        select(SessionModel)
        
        .offset(offset)
        .limit(limit)
    )
    sessions = session.exec(statement).all()
    return _attach_weather_summary(sessions, session)


@public_router.get("/{session_id}", response_model=SessionRead)
def get_session_by_id_public(
    session_id: int,
    session: Session = Depends(get_readonly_session),
) -> SessionRead:
    return get_session_by_id(session_id=session_id, session=session)


@admin_router.get("/{session_id}", response_model=SessionRead)
@router.get("/{session_id}", response_model=SessionRead)
def get_session_by_id(
    session_id: int,
    session: Session = Depends(get_session),
) -> SessionRead:
    session_model = session.get(SessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")
    results = _attach_weather_summary([session_model], session)
    return results[0]


@public_router.get("/by-event/{event_id}", response_model=list[SessionRead])
def list_sessions_by_event_public(
    event_id: int,
    session: Session = Depends(get_readonly_session),
) -> list[SessionRead]:
    return list_sessions_by_event(event_id=event_id, session=session)


@admin_router.get("/by-event/{event_id}", response_model=list[SessionRead])
@router.get("/by-event/{event_id}", response_model=list[SessionRead])
def list_sessions_by_event(
    event_id: int,
    session: Session = Depends(get_session),
) -> list[SessionRead]:
    statement = select(SessionModel).where(SessionModel.event_id == event_id)
    statement = statement
    sessions = session.exec(statement).all()
    return _attach_weather_summary(sessions, session)


@admin_router.patch("/{session_id}", response_model=SessionRead)
@router.patch("/{session_id}", response_model=SessionRead)
def update_session(
    session_id: int,
    session_in: SessionUpdate,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> SessionRead:
    session_model = session.get(SessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    update_data = model_dump(session_in, exclude_unset=True)
    for key, value in update_data.items():
        setattr(session_model, key, value)
    session_model.updated_at = datetime.utcnow()

    session.add(session_model)
    session.commit()
    session.refresh(session_model)
    return session_model


@public_router.get("/{session_id}/weather", response_model=SessionWeatherSeriesRead)
def get_session_weather_series_public(
    session_id: int,
    session: Session = Depends(get_readonly_session),
) -> SessionWeatherSeriesRead:
    return get_session_weather_series(session_id=session_id, session=session)


@admin_router.get("/{session_id}/weather", response_model=SessionWeatherSeriesRead)
@router.get("/{session_id}/weather", response_model=SessionWeatherSeriesRead)
def get_session_weather_series(
    session_id: int,
    session: Session = Depends(get_session),
) -> SessionWeatherSeriesRead:
    session_model = session.get(SessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    weather_rows = session.exec(
        select(SessionWeather)
        .where(SessionWeather.session_id == session_id)
        .order_by(SessionWeather.recorded_at.asc())
    ).all()
    summary = _compute_weather_summary(session_id=session_id, points=weather_rows)
    return SessionWeatherSeriesRead(
        **summary.model_dump(),
        points=weather_rows,
    )


@admin_router.post("/{session_id}/weather/fetch")
@router.post("/{session_id}/weather/fetch")
def fetch_session_weather(
    session_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    return _impl_fetch_weather(session, session_id)


def _impl_fetch_weather(session: Session, session_id: int) -> dict:
    """Fetch OpenF1 weather for a session. Reusable by routes and the scheduler.

    Raises ``HTTPException``; ``app.services.openf1_fetch`` translates these into
    transport-agnostic domain exceptions for the scheduler.
    """
    session_model = session.get(SessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")
    event = session.get(Event, session_model.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    circuit = session.get(Circuit, event.circuit_id) if event.circuit_id else None
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    if not session_model.date_time_start:
        raise HTTPException(
            status_code=400,
            detail="Session date_time_start required to fetch weather.",
        )

    try:
        openf1_meeting, _matching_details = _resolve_openf1_meeting_for_event(event, circuit)
        meeting_key = openf1_meeting.get("meeting_key")
        if meeting_key is None:
            raise HTTPException(status_code=422, detail="OpenF1 meeting key missing in matched payload.")

        openf1_sessions = _openf1_get("sessions", {"meeting_key": meeting_key})
        openf1_session, _session_matching = _resolve_openf1_session_for_local_session(
            session_model,
            openf1_sessions,
        )
        session_key = openf1_session.get("session_key")
        if session_key is None:
            raise HTTPException(status_code=422, detail="OpenF1 session key missing in matched payload.")

        weather_rows = _openf1_get(
            "weather",
            {"meeting_key": meeting_key, "session_key": session_key},
        )

        start_window = session_model.date_time_start - timedelta(minutes=5)
        end_reference = session_model.date_time_end or session_model.date_time_start
        end_window = end_reference + timedelta(minutes=5)

        existing_rows = session.exec(
            select(SessionWeather).where(SessionWeather.session_id == session_id)
        ).all()
        for existing in existing_rows:
            session.delete(existing)
        # Flush the deletes before re-inserting: SQLAlchemy's unit of work runs INSERTs
        # before DELETEs in a single flush, so without this an existing row would collide
        # with a new one on the (session_id, recorded_at) unique constraint.
        session.flush()

        imported_count = 0
        seen_recorded_at: set = set()
        weather_default_offset = openf1_session.get("gmt_offset") or openf1_meeting.get(
            "gmt_offset"
        )
        for row in weather_rows:
            if not isinstance(row, dict):
                continue
            weather_offset = row.get("gmt_offset") or weather_default_offset
            recorded_at_utc = _parse_iso_datetime(row.get("date"))
            recorded_at = _to_local_datetime_for_storage(recorded_at_utc, weather_offset)
            if not recorded_at:
                continue
            if recorded_at < start_window or recorded_at > end_window:
                continue
            # Guard against duplicate timestamps within one OpenF1 response.
            if recorded_at in seen_recorded_at:
                continue
            seen_recorded_at.add(recorded_at)

            now_utc = datetime.utcnow()
            record = SessionWeather(
                session_id=session_id,
                recorded_at=recorded_at,
                air_temperature=_safe_float(row.get("air_temperature")),
                track_temperature=_safe_float(row.get("track_temperature")),
                rainfall=_safe_float(row.get("rainfall")),
                weather_code=None,
                wind_speed=_safe_float(row.get("wind_speed")),
                created_at=now_utc,
                updated_at=now_utc,
            )
            session.add(record)
            imported_count += 1

        session.commit()
        imported_rows = session.exec(
            select(SessionWeather)
            .where(SessionWeather.session_id == session_id)
            .order_by(SessionWeather.recorded_at.asc())
        ).all()
        summary = _compute_weather_summary(session_id=session_id, points=imported_rows)
    except Exception as exc:
        if isinstance(exc, HTTPException):
            raise
        raise HTTPException(status_code=502, detail="Failed to fetch weather data from OpenF1.") from exc

    return {
        "session_id": session_id,
        "imported_count": imported_count,
        "window_start": start_window.isoformat(),
        "window_end": end_window.isoformat(),
        "summary": summary.model_dump(),
    }


@admin_router.post("/{session_id}/openmeteo/weather/fetch")
@router.post("/{session_id}/openmeteo/weather/fetch")
def fetch_openmeteo_session_weather(
    session_id: int,
    mode: str = Query(
        "full",
        description=(
            "full – replace all existing rows with Open-Meteo hourly data. "
            "weather_code_only – only fill in weather_code on existing rows that have it null."
        ),
    ),
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    """Fetch weather data from Open-Meteo archive API for a session.

    Two modes:
    - ``full``: used for pre-2019 sessions (no OpenF1 data). Deletes any
      existing session_weather rows and inserts one row per hour from
      Open-Meteo covering the session window.
    - ``weather_code_only``: used for post-2019 sessions that already have
      OpenF1 rows but are missing weather_code. Matches each existing row to
      the closest Open-Meteo hourly record and backfills only the
      weather_code column.

    Requires the session's circuit to have lat/lon coordinates set.
    """
    if mode not in ("full", "weather_code_only"):
        raise HTTPException(
            status_code=422,
            detail="mode must be 'full' or 'weather_code_only'.",
        )

    session_model = session.get(SessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    if not session_model.date_time_start:
        raise HTTPException(
            status_code=400,
            detail="Session date_time_start is required to fetch weather.",
        )

    event = session.get(Event, session_model.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")

    circuit = session.get(Circuit, event.circuit_id) if event.circuit_id else None
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    if circuit.lat is None or circuit.lon is None:
        raise HTTPException(
            status_code=422,
            detail=f"Circuit '{circuit.name}' has no coordinates (lat/lon). "
                   "Add them before fetching weather.",
        )

    tz = circuit.timezone or "UTC"
    start_dt = session_model.date_time_start
    end_dt = session_model.date_time_end or (start_dt + timedelta(hours=2))

    if mode == "weather_code_only":
        # Widen the window to cover all existing session_weather rows so that
        # every recorded_at has a nearby Open-Meteo hourly record to match against.
        existing_timestamps = session.exec(
            select(SessionWeather.recorded_at)
            .where(SessionWeather.session_id == session_id)
            .where(SessionWeather.weather_code.is_(None))
        ).all()
        if existing_timestamps:
            valid_ts = [ts for ts in existing_timestamps if ts is not None]
            if valid_ts:
                start_dt = min(min(valid_ts), start_dt)
                end_dt = max(max(valid_ts), end_dt)

    try:
        om_records = _fetch_open_meteo_weather_range(
            lat=circuit.lat,
            lon=circuit.lon,
            start_dt=start_dt,
            end_dt=end_dt,
            tz=tz,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to fetch data from Open-Meteo: {exc}",
        ) from exc

    if not om_records:
        raise HTTPException(
            status_code=502,
            detail="Open-Meteo returned no records for the session window.",
        )

    now_utc = datetime.utcnow()

    if mode == "full":
        # Delete existing rows and insert fresh hourly records.
        existing = session.exec(
            select(SessionWeather).where(SessionWeather.session_id == session_id)
        ).all()
        for row in existing:
            session.delete(row)

        imported_count = 0
        for rec in om_records:
            session.add(
                SessionWeather(
                    session_id=session_id,
                    recorded_at=rec["recorded_at"],
                    air_temperature=rec["air_temperature"],
                    track_temperature=None,
                    rainfall=rec["rainfall"],
                    weather_code=rec["weather_code"],
                    wind_speed=rec["wind_speed"],
                    created_at=now_utc,
                    updated_at=now_utc,
                )
            )
            imported_count += 1

        session.commit()
        updated_count = 0

    else:  # weather_code_only
        # Match each existing row to the nearest Open-Meteo hourly record
        # and fill weather_code where it is currently null.
        existing_rows = session.exec(
            select(SessionWeather)
            .where(SessionWeather.session_id == session_id)
            .where(SessionWeather.weather_code.is_(None))
        ).all()

        updated_count = 0
        imported_count = 0
        for existing_row in existing_rows:
            best_rec = min(
                om_records,
                key=lambda r: abs(
                    (r["recorded_at"] - existing_row.recorded_at).total_seconds()
                ),
            )
            if best_rec["weather_code"] is not None:
                existing_row.weather_code = best_rec["weather_code"]
                existing_row.updated_at = now_utc
                session.add(existing_row)
                updated_count += 1

        session.commit()

    all_rows = session.exec(
        select(SessionWeather)
        .where(SessionWeather.session_id == session_id)
        .order_by(SessionWeather.recorded_at.asc())
    ).all()
    summary = _compute_weather_summary(session_id=session_id, points=all_rows)

    return {
        "session_id": session_id,
        "mode": mode,
        "imported_count": imported_count,
        "updated_count": updated_count,
        "open_meteo_records_fetched": len(om_records),
        "summary": summary.model_dump(),
    }


@admin_router.post("/by-event/{event_id}/openf1/meeting-sessions-weather/fetch")
@router.post("/by-event/{event_id}/openf1/meeting-sessions-weather/fetch")
def fetch_openf1_meeting_sessions_weather(
    event_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
):
    return _impl_fetch_meeting_sessions_weather(session, event_id)


def _impl_fetch_meeting_sessions_weather(session: Session, event_id: int) -> dict:
    """Sync the local session schedule from OpenF1. Reusable by routes and scheduler.

    Raises ``HTTPException``; translated to domain exceptions in
    ``app.services.openf1_fetch`` for the scheduler.
    """
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    circuit = session.get(Circuit, event.circuit_id) if event.circuit_id else None
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")

    try:
        openf1_meeting, matching_details = _resolve_openf1_meeting_for_event(event, circuit)
        meeting_key = openf1_meeting.get("meeting_key")
        if meeting_key is None:
            raise HTTPException(status_code=422, detail="OpenF1 meeting key missing in matched payload.")
        openf1_sessions = _openf1_get("sessions", {"meeting_key": meeting_key})
        local_sessions = session.exec(
            select(SessionModel).where(SessionModel.event_id == event_id)
        ).all()
        local_by_type = {}
        for local_session in local_sessions:
            key = _normalize_text(getattr(local_session.type, "value", local_session.type))
            local_by_type.setdefault(key, []).append(local_session)

        updated_session_ids = []
        created_session_ids = []
        skipped_openf1_sessions = []

        for openf1_session in openf1_sessions:
            mapped_type = _infer_local_session_type_from_openf1(openf1_session)
            openf1_start_utc = _parse_iso_datetime(openf1_session.get("date_start"))
            openf1_end_utc = _parse_iso_datetime(openf1_session.get("date_end"))
            gmt_offset = openf1_session.get("gmt_offset") or openf1_meeting.get(
                "gmt_offset"
            )
            openf1_start_local = _to_local_datetime_for_storage(
                openf1_start_utc, gmt_offset
            )
            openf1_end_local = _to_local_datetime_for_storage(openf1_end_utc, gmt_offset)
            if mapped_type is None or openf1_start_local is None:
                skipped_openf1_sessions.append(
                    {
                        "session_key": openf1_session.get("session_key"),
                        "session_name": openf1_session.get("session_name"),
                        "reason": "unmapped_session_type_or_missing_start",
                    }
                )
                continue

            type_key = _normalize_text(mapped_type.value)
            candidates = local_by_type.get(type_key, [])
            target_session = None
            if candidates:
                if len(candidates) == 1:
                    target_session = candidates[0]
                else:
                    # Resolve duplicates by nearest current start datetime.
                    nearest = None
                    nearest_delta = None
                    for candidate in candidates:
                        existing_start = _parse_iso_datetime(candidate.date_time_start)
                        delta = (
                            abs((existing_start - openf1_start_local).total_seconds())
                            if existing_start
                            else float("inf")
                        )
                        if nearest_delta is None or delta < nearest_delta:
                            nearest = candidate
                            nearest_delta = delta
                    target_session = nearest

            if target_session:
                target_session.date_time_start = openf1_start_local
                target_session.date_time_end = openf1_end_local
                target_session.updated_at = datetime.utcnow()
                session.add(target_session)
                if target_session.id not in updated_session_ids:
                    updated_session_ids.append(target_session.id)
            else:
                created = SessionModel(
                    event_id=event_id,
                    type=mapped_type,
                    date_time_start=openf1_start_local,
                    date_time_end=openf1_end_local,
                )
                session.add(created)
                session.flush()
                if created.id not in created_session_ids:
                    created_session_ids.append(created.id)
                local_by_type.setdefault(type_key, []).append(created)

            # OpenF1 often provides qualifying sessions as one session; keep split
            # sessions aligned for both regular qualifying and sprint qualifying.
            if mapped_type in {SessionType.QUALI, SessionType.SQ}:
                if mapped_type == SessionType.QUALI:
                    split_types = (SessionType.Q1, SessionType.Q2, SessionType.Q3)
                else:
                    split_types = (
                        SessionType.SQ1,
                        SessionType.SQ2,
                        SessionType.SQ3,
                    )
                for split_type in split_types:
                    split_key = _normalize_text(split_type.value)
                    split_candidates = local_by_type.get(split_key, [])
                    split_target = None
                    if split_candidates:
                        if len(split_candidates) == 1:
                            split_target = split_candidates[0]
                        else:
                            nearest = None
                            nearest_delta = None
                            for candidate in split_candidates:
                                existing_start = _parse_iso_datetime(candidate.date_time_start)
                                delta = (
                                    abs((existing_start - openf1_start_local).total_seconds())
                                    if existing_start
                                    else float("inf")
                                )
                                if nearest_delta is None or delta < nearest_delta:
                                    nearest = candidate
                                    nearest_delta = delta
                            split_target = nearest

                    if split_target:
                        split_target.date_time_start = openf1_start_local
                        split_target.date_time_end = openf1_end_local
                        split_target.updated_at = datetime.utcnow()
                        session.add(split_target)
                        if split_target.id not in updated_session_ids:
                            updated_session_ids.append(split_target.id)
                    else:
                        split_created = SessionModel(
                            event_id=event_id,
                            type=split_type,
                            date_time_start=openf1_start_local,
                            date_time_end=openf1_end_local,
                        )
                        session.add(split_created)
                        session.flush()
                        local_by_type.setdefault(split_key, []).append(split_created)
                        if split_created.id not in created_session_ids:
                            created_session_ids.append(split_created.id)

        session.commit()
        refreshed_local_sessions = session.exec(
            select(SessionModel).where(SessionModel.event_id == event_id)
        ).all()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("openf1.meeting_sessions_weather_fetch_failed event_id=%s", event_id)
        raise HTTPException(status_code=502, detail="Failed to fetch data from OpenF1.") from exc

    return {
        "event_id": event_id,
        "openf1_meeting": openf1_meeting,
        "local_sessions": refreshed_local_sessions,
        "meta": {
            "matching_details": matching_details,
            "resolved_meeting_key": meeting_key,
            "resolved_year": event.event_date.year if event.event_date else None,
            "updated_session_ids": updated_session_ids,
            "created_session_ids": created_session_ids,
            "skipped_openf1_sessions": skipped_openf1_sessions,
        },
    }


@admin_router.post("/{session_id}/openf1/session-results/fetch")
@router.post("/{session_id}/openf1/session-results/fetch")
def fetch_openf1_session_results(
    session_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
):
    return _impl_fetch_session_results(session, session_id)


def _impl_fetch_session_results(session: Session, session_id: int) -> dict:
    """Fetch OpenF1 session results for one session. Reusable by routes and scheduler.

    Raises ``HTTPException``; translated to domain exceptions in
    ``app.services.openf1_fetch`` for the scheduler.
    """
    session_model = session.get(SessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")
    event = session.get(Event, session_model.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    circuit = session.get(Circuit, event.circuit_id) if event.circuit_id else None
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")

    try:
        openf1_meeting, matching_details = _resolve_openf1_meeting_for_event(event, circuit)
        meeting_key = openf1_meeting.get("meeting_key")
        if meeting_key is None:
            raise HTTPException(status_code=422, detail="OpenF1 meeting key missing in matched payload.")
        openf1_sessions = _openf1_get("sessions", {"meeting_key": meeting_key})
        openf1_session, session_matching_details = _resolve_openf1_session_for_local_session(
            session_model,
            openf1_sessions,
        )
        session_key = openf1_session.get("session_key")
        if session_key is None:
            raise HTTPException(status_code=422, detail="OpenF1 session key missing in matched payload.")
        openf1_session_results = _openf1_get("session_result", {"session_key": session_key})

        event_entries = session.exec(
            select(EventEntry).where(EventEntry.event_id == event.id)
        ).all()
        entry_by_driver_number: dict[str, list[EventEntry]] = {}
        for event_entry in event_entries:
            if event_entry.car_number is None:
                continue
            key = str(event_entry.car_number).strip()
            if not key:
                continue
            entry_by_driver_number.setdefault(key, []).append(event_entry)

        existing_results = session.exec(
            select(SessionResult).where(SessionResult.session_id == session_id)
        ).all()
        existing_result_by_session_entry: dict[tuple[int, int], SessionResult] = {}
        for existing_result in existing_results:
            key = (existing_result.session_id, existing_result.entry_id)
            if key not in existing_result_by_session_entry:
                existing_result_by_session_entry[key] = existing_result

        quali_split_session_map: dict[int, int] = {}
        session_type_value = getattr(session_model.type, "value", session_model.type)
        normalized_session_type = str(session_type_value).upper()
        is_qualifying_session = normalized_session_type in {"QUALI", "SQ"}
        if normalized_session_type in {"QUALI", "SQ"}:
            event_sessions = session.exec(
                select(SessionModel).where(SessionModel.event_id == event.id)
            ).all()
            if normalized_session_type == "QUALI":
                split_types = [SessionType.Q1, SessionType.Q2, SessionType.Q3]
            else:
                split_types = [SessionType.SQ1, SessionType.SQ2, SessionType.SQ3]
            for idx, split_type in enumerate(split_types):
                matching = next(
                    (
                        candidate
                        for candidate in event_sessions
                        if getattr(candidate.type, "value", candidate.type) == split_type.value
                    ),
                    None,
                )
                if matching:
                    quali_split_session_map[idx] = matching.id
            for idx, split_type in enumerate(split_types):
                if idx in quali_split_session_map:
                    continue
                split_existing = next(
                    (
                        candidate
                        for candidate in event_sessions
                        if getattr(candidate.type, "value", candidate.type) == split_type.value
                    ),
                    None,
                )
                if split_existing:
                    quali_split_session_map[idx] = split_existing.id
                    continue
                split_created = SessionModel(
                    event_id=event.id,
                    type=split_type,
                    date_time_start=session_model.date_time_start,
                    date_time_end=session_model.date_time_end,
                )
                session.add(split_created)
                session.flush()
                event_sessions.append(split_created)
                quali_split_session_map[idx] = split_created.id

            if quali_split_session_map:
                split_existing_results = session.exec(
                    select(SessionResult).where(
                        SessionResult.session_id.in_(list(quali_split_session_map.values()))
                    )
                ).all()
                for existing_result in split_existing_results:
                    key = (existing_result.session_id, existing_result.entry_id)
                    if key not in existing_result_by_session_entry:
                        existing_result_by_session_entry[key] = existing_result

        created_result_ids = []
        updated_result_ids = []
        skipped_rows = []
        split_laps_by_entry_and_phase: dict[tuple[int, int], int | None] = {}

        for row in openf1_session_results:
            if not isinstance(row, dict):
                skipped_rows.append({"reason": "invalid_row_shape"})
                continue
            driver_number = _safe_int(row.get("driver_number"))
            if driver_number is None:
                skipped_rows.append(
                    {
                        "reason": "missing_driver_number",
                        "row_preview": {
                            "position": row.get("position"),
                            "full_name": row.get("full_name"),
                        },
                    }
                )
                continue

            entry_candidates = entry_by_driver_number.get(str(driver_number), [])
            if not entry_candidates:
                skipped_rows.append(
                    {
                        "reason": "entry_not_found_for_driver_number",
                        "driver_number": driver_number,
                    }
                )
                continue
            if len(entry_candidates) > 1:
                skipped_rows.append(
                    {
                        "reason": "multiple_entries_for_driver_number",
                        "driver_number": driver_number,
                        "entry_ids": [candidate.id for candidate in entry_candidates],
                    }
                )
                continue

            entry = entry_candidates[0]
            duration_value = _first_non_none(
                row.get("duration"),
                row.get("duration_sec"),
                row.get("duration_seconds"),
            )
            gap_value = _first_non_none(row.get("gap_to_leader"), row.get("gap"))
            interval_value = _first_non_none(
                row.get("interval_to_position_ahead"), row.get("interval")
            )
            laps_value = _first_non_none(
                row.get("number_of_laps"),
                row.get("laps_completed"),
                row.get("laps"),
            )
            session_laps_value = _safe_int(laps_value)

            import_targets: list[tuple[int, int | None]] = []
            phase_time_keys = None
            phase_gap_keys = None
            phase_interval_keys = None
            phase_lap_keys = None
            if quali_split_session_map and is_qualifying_session:
                phase_time_keys = {
                    0: ("q1", "sq1", "time_q1", "time_sq1"),
                    1: ("q2", "sq2", "time_q2", "time_sq2"),
                    2: ("q3", "sq3", "time_q3", "time_sq3"),
                }
                phase_gap_keys = {
                    0: ("gap_q1", "gap_sq1", "q1_gap", "sq1_gap"),
                    1: ("gap_q2", "gap_sq2", "q2_gap", "sq2_gap"),
                    2: ("gap_q3", "gap_sq3", "q3_gap", "sq3_gap"),
                }
                phase_interval_keys = {
                    0: ("interval_q1", "interval_sq1", "interval_1", "interval_sq1"),
                    1: ("interval_q2", "interval_sq2", "interval_2", "interval_sq2"),
                    2: ("interval_q3", "interval_sq3", "interval_3", "interval_sq3"),
                }
                phase_lap_keys = {
                    0: (
                        "laps_q1",
                        "laps_sq1",
                        "number_of_laps_q1",
                        "number_of_laps_sq1",
                        "q1_laps",
                        "sq1_laps",
                        "lap_count_q1",
                        "lap_count_sq1",
                        "laps_1",
                    ),
                    1: (
                        "laps_q2",
                        "laps_sq2",
                        "number_of_laps_q2",
                        "number_of_laps_sq2",
                        "q2_laps",
                        "sq2_laps",
                        "lap_count_q2",
                        "lap_count_sq2",
                        "laps_2",
                    ),
                    2: (
                        "laps_q3",
                        "laps_sq3",
                        "number_of_laps_q3",
                        "number_of_laps_sq3",
                        "q3_laps",
                        "sq3_laps",
                        "lap_count_q3",
                        "lap_count_sq3",
                        "laps_3",
                    ),
                }
                for phase_index, split_session_id in sorted(quali_split_session_map.items()):
                    phase_position_value = _value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=("position", "classified_position"),
                    )
                    phase_time_value = _value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=("time", "duration", "duration_sec", "duration_seconds"),
                        phase_key_map=phase_time_keys,
                    )
                    phase_laps_value = _value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=("number_of_laps", "laps_completed", "laps"),
                        phase_key_map=phase_lap_keys,
                    )
                    if is_qualifying_session and phase_laps_value is None:
                        phase_laps_value = session_laps_value
                    if (
                        phase_position_value is not None
                        or phase_time_value is not None
                        or phase_laps_value is not None
                    ):
                        import_targets.append((split_session_id, phase_index))
                if not import_targets:
                    import_targets.append((session_id, None))
            else:
                import_targets.append((session_id, None))

            for target_session_id, phase_index in import_targets:
                target_result = existing_result_by_session_entry.get(
                    (target_session_id, entry.id)
                )
                position_value = _safe_text(
                    _value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=("position", "classified_position"),
                    )
                ) or _safe_text(
                    _value_for_phase_with_fallback(
                        row=row,
                        phase_index=None,
                        base_keys=("position", "classified_position"),
                    )
                )
                if position_value is None:
                    if _is_true_flag(row.get("dnf")):
                        position_value = "DNF"
                    elif _is_true_flag(row.get("dns")):
                        position_value = "DNS"
                    elif _is_true_flag(row.get("dsq")):
                        position_value = "DSQ"
                phase_time = _format_openf1_time(
                    _value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=("time", "duration", "duration_sec", "duration_seconds"),
                        phase_key_map=phase_time_keys,
                    )
                ) or _format_duration_seconds_to_time(
                    _value_for_phase(duration_value, phase_index)
                )
                phase_laps_value = _safe_int(
                    _value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=(
                            "number_of_laps",
                            "laps_completed",
                            "laps",
                        ),
                        phase_key_map=phase_lap_keys,
                    )
                )
                if phase_index is not None and is_qualifying_session and phase_laps_value is None:
                    phase_laps_value = session_laps_value
                if phase_index is not None and is_qualifying_session:
                    split_laps_by_entry_and_phase[(entry.id, phase_index)] = phase_laps_value
                payload = {
                    "position": position_value,
                    "points": _safe_float(row.get("points")),
                    "time": phase_time,
                    "gap": _safe_text_with_null_list(_value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=("gap_to_leader", "gap"),
                        phase_key_map=phase_gap_keys,
                    )),
                    "interval": _safe_text(_value_for_phase_with_fallback(
                        row=row,
                        phase_index=phase_index,
                        base_keys=("interval_to_position_ahead", "interval"),
                        phase_key_map=phase_interval_keys,
                    )),
                    "laps": phase_laps_value
                    if (not is_qualifying_session) or (target_session_id == session_id)
                    else None,
                    "time_penalty": _safe_text(row.get("time_penalty")),
                    "grid_position": _safe_text(row.get("grid_position")),
                    "retired_reason": _safe_text(
                        row.get("status") or row.get("retired_reason")
                    ),
                }

                if target_result:
                    for key, value in payload.items():
                        setattr(target_result, key, value)
                    target_result.updated_at = datetime.utcnow()
                    session.add(target_result)
                    updated_result_ids.append(target_result.id)
                else:
                    created_result = SessionResult(
                        session_id=target_session_id,
                        entry_id=entry.id,
                        **payload,
                    )
                    session.add(created_result)
                    session.flush()
                    existing_result_by_session_entry[
                        (target_session_id, entry.id)
                    ] = created_result
                    created_result_ids.append(created_result.id)

        if normalized_session_type in {"QUALI", "SQ"} and quali_split_session_map:
            session.flush()

            split_session_ids = list(quali_split_session_map.values())
            split_results = session.exec(
                select(SessionResult).where(SessionResult.session_id.in_(split_session_ids))
            ).all()
            split_results_by_session: dict[int, list[SessionResult]] = {}
            for item in split_results:
                split_results_by_session.setdefault(item.session_id, []).append(item)

            aggregated_targets: list[SessionResult] = []
            q3_session_id = quali_split_session_map.get(2)
            q2_session_id = quali_split_session_map.get(1)
            q1_session_id = quali_split_session_map.get(0)
            split_session_to_phase_index = {
                session_id_value: index for index, session_id_value in quali_split_session_map.items()
            }
            event_year = event.event_date.year if event.event_date else None

            if normalized_session_type == "SQ":
                q3_min, q3_max = 1, 10
                q2_min, q2_max = 11, 15
                q1_min, q1_max = 16, 20
            elif event_year == 2026:
                q3_min, q3_max = 1, 10
                q2_min, q2_max = 11, 16
                q1_min, q1_max = 17, 22
            else:
                q3_min, q3_max = 1, 10
                q2_min, q2_max = 11, 15
                q1_min, q1_max = 16, 20

            for split_item in split_results_by_session.get(q3_session_id or -1, []):
                numeric_position = _parse_numeric_position(split_item.position)
                if numeric_position is not None and q3_min <= numeric_position <= q3_max:
                    aggregated_targets.append(split_item)
            for split_item in split_results_by_session.get(q2_session_id or -1, []):
                numeric_position = _parse_numeric_position(split_item.position)
                if numeric_position is not None and q2_min <= numeric_position <= q2_max:
                    aggregated_targets.append(split_item)
            for split_item in split_results_by_session.get(q1_session_id or -1, []):
                numeric_position = _parse_numeric_position(split_item.position)
                if numeric_position is not None and q1_min <= numeric_position <= q1_max:
                    aggregated_targets.append(split_item)

            aggregated_targets.sort(
                key=lambda item: (
                    _parse_numeric_position(item.position) or 999,
                    item.id or 0,
                )
            )

            for split_item in aggregated_targets:
                target_result = existing_result_by_session_entry.get((session_id, split_item.entry_id))
                payload = {
                    "position": split_item.position,
                    "points": split_item.points,
                    "time": split_item.time,
                    "gap": split_item.gap,
                    "interval": split_item.interval,
                    "laps": _safe_int(
                        _first_non_none(
                            split_laps_by_entry_and_phase.get((split_item.entry_id, split_session_to_phase_index.get(split_item.session_id)), None),
                            split_item.laps,
                        )
                    ),
                    "time_penalty": split_item.time_penalty,
                    "grid_position": split_item.grid_position,
                    "retired_reason": split_item.retired_reason,
                }
                if target_result:
                    for key, value in payload.items():
                        setattr(target_result, key, value)
                    target_result.updated_at = datetime.utcnow()
                    session.add(target_result)
                    updated_result_ids.append(target_result.id)
                else:
                    created_result = SessionResult(
                        session_id=session_id,
                        entry_id=split_item.entry_id,
                        **payload,
                    )
                    session.add(created_result)
                    session.flush()
                    existing_result_by_session_entry[(session_id, split_item.entry_id)] = created_result
                    created_result_ids.append(created_result.id)

        session.commit()
        imported_session_results = session.exec(
            select(SessionResult).where(SessionResult.session_id == session_id)
        ).all()
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("openf1.session_results_fetch_failed session_id=%s", session_id)
        raise HTTPException(status_code=502, detail="Failed to fetch data from OpenF1.") from exc

    return {
        "session_id": session_id,
        "openf1_meeting": openf1_meeting,
        "openf1_session": openf1_session,
        "openf1_session_results": openf1_session_results,
        "imported_session_results": imported_session_results,
        "meta": {
            "matching_details": {
                "meeting": matching_details,
                "session": session_matching_details,
            },
            "resolved_meeting_key": meeting_key,
            "resolved_session_key": session_key,
            "imported": {
                "created_result_ids": created_result_ids,
                "updated_result_ids": updated_result_ids,
                "skipped_rows": skipped_rows,
                "openf1_rows_count": len(openf1_session_results),
            },
        },
    }


@admin_router.delete(
    "/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role({UserRole.admin}))],
)
@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin})),
) -> None:
    session_model = session.get(SessionModel, session_id)
    if not session_model:
        raise HTTPException(status_code=404, detail="Session not found")

    session.delete(session_model)
    session.commit()
    return None


@admin_router.post("/import/free-practice/{event_id}")
@router.post("/import/free-practice/{event_id}")
async def import_free_practice_endpoint(
    event_id: int,
    files: list[UploadFile] = File(...),
    dry_run: bool = Query(default=False),
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    """Import free practice results from uploaded YAML files."""
    from app.services.yaml_import import import_free_practice

    file_data = [(f.filename or "unknown.yml", await f.read()) for f in files]
    try:
        result = import_free_practice(session, event_id, dry_run, file_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "event_id": event_id,
        "dry_run": dry_run,
        "imported": result.get("imported", 0),
        "stdout": "\n".join(result.get("log", [])),
    }


@admin_router.post("/import/qualifying/{event_id}")
@router.post("/import/qualifying/{event_id}")
async def import_qualifying_endpoint(
    event_id: int,
    files: list[UploadFile] = File(...),
    dry_run: bool = Query(default=False),
    session: Session = Depends(get_session),
    _: User = Depends(require_role({UserRole.admin, UserRole.editor})),
) -> dict:
    """Import qualifying results from uploaded YAML file."""
    from app.services.yaml_import import import_qualifying

    file_data = [(f.filename or "unknown.yml", await f.read()) for f in files]
    try:
        result = import_qualifying(session, event_id, dry_run, file_data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {
        "event_id": event_id,
        "dry_run": dry_run,
        "imported": result.get("imported", 0),
        "stdout": "\n".join(result.get("log", [])),
    }
