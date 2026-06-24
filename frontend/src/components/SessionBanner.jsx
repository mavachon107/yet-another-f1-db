import { useState } from "react";
import { apiFetch, readErrorMessage } from "../lib/api.js";
import { gmtToLocal, localToGmt } from "../lib/timezone.js";

const SESSION_TYPE_LABELS = {
  FP1: "Free Practice 1",
  FP2: "Free Practice 2",
  FP3: "Free Practice 3",
  QUALI: "Qualifications",
  Q1: "Qualifying 1",
  Q2: "Qualifying 2",
  Q3: "Qualifying 3",
  SQ: "Sprint Qualifying",
  SQ1: "Sprint Qualifying 1",
  SQ2: "Sprint Qualifying 2",
  SQ3: "Sprint Qualifying 3",
  SR: "Sprint Race",
  RACE: "Race",
};

const WEATHER_ICONS = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌦️",
  56: "🌨️", 57: "🌨️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  66: "🌨️", 67: "🌨️",
  71: "❄️", 73: "❄️", 75: "❄️", 77: "❄️",
  80: "🌦️", 81: "🌦️", 82: "🌦️",
  85: "🌨️", 86: "🌨️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const WEATHER_LABELS = {
  0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Rime fog",
  51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
  56: "Freezing drizzle", 57: "Dense freezing drizzle",
  61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
  66: "Freezing rain", 67: "Heavy freezing rain",
  71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
  80: "Rain showers", 81: "Moderate showers", 82: "Violent showers",
  85: "Snow showers", 86: "Heavy snow showers",
  95: "Thunderstorm", 96: "Thunderstorm / hail", 99: "Severe thunderstorm",
};

function ensureUtc(dateTimeStr) {
  if (!dateTimeStr) return null;
  const s = String(dateTimeStr).trim();
  // If the string has no timezone indicator, treat it as UTC
  if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) return s + "Z";
  return s;
}

function formatSessionTime(dateTimeStr, timezone) {
  if (!dateTimeStr) return null;
  try {
    const d = new Date(ensureUtc(dateTimeStr));
    if (Number.isNaN(d.getTime())) return null;
    const opts = { hour: "2-digit", minute: "2-digit", hour12: false };
    if (timezone) opts.timeZone = timezone;
    return d.toLocaleTimeString("en-US", opts);
  } catch {
    return null;
  }
}

function formatSessionDate(dateTimeStr, timezone) {
  if (!dateTimeStr) return null;
  try {
    const d = new Date(ensureUtc(dateTimeStr));
    if (Number.isNaN(d.getTime())) return null;
    const opts = { weekday: "long", month: "short", day: "numeric" };
    if (timezone) opts.timeZone = timezone;
    return d.toLocaleDateString("en-US", opts);
  } catch {
    return null;
  }
}

function toDateTimeInput(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return "";
  }
}

function fromDateTimeInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function deriveTrackCondition(session) {
  if (!session) return null;
  const rainfall = session.rainfall;
  if (rainfall != null && rainfall > 0) return "WET";
  const code = session.weather_code;
  if (code != null) {
    const n = Number(code);
    if (n >= 51 && n <= 67) return "WET";
    if (n >= 80 && n <= 82) return "WET";
    if (n >= 95) return "WET";
  }
  return "DRY";
}

export default function SessionBanner({ session, sessionType, title, canEdit, onSessionUpdated, eventId, circuitTimezone }) {
  if (!session && !sessionType && !title) return null;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({ date_time_start: "", date_time_end: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [fetchStatus, setFetchStatus] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importLog, setImportLog] = useState("");
  const [importFiles, setImportFiles] = useState([]);
  const [timeMode, setTimeMode] = useState(circuitTimezone ? "local" : "gmt");

  const label = title || SESSION_TYPE_LABELS[sessionType] || sessionType || "Session";

  const startTime = formatSessionTime(session?.date_time_start, circuitTimezone);
  const endTime = formatSessionTime(session?.date_time_end, circuitTimezone);
  const sessionDate = formatSessionDate(session?.date_time_start, circuitTimezone);
  const timeRange = startTime && endTime ? `${startTime} – ${endTime}` : startTime || null;

  const trackCondition = deriveTrackCondition(session);
  const airTempMin = session?.air_temperature_min;
  const airTempMax = session?.air_temperature_max;
  const trackTempMin = session?.track_temperature_min;
  const trackTempMax = session?.track_temperature_max;

  const weatherCode = session?.weather_code != null ? Number(session.weather_code) : null;
  const weatherIcon = weatherCode != null ? WEATHER_ICONS[weatherCode] : null;
  const weatherLabel = weatherCode != null ? WEATHER_LABELS[weatherCode] : null;

  const humidity = session?.humidity ?? null;
  const hasConditions = trackCondition || airTempMin != null || weatherIcon || humidity != null;

  const openModal = () => {
    const mode = circuitTimezone ? "local" : "gmt";
    setTimeMode(mode);
    const convertStart = mode === "local" && circuitTimezone
      ? gmtToLocal(session?.date_time_start, circuitTimezone)
      : toDateTimeInput(session?.date_time_start);
    const convertEnd = mode === "local" && circuitTimezone
      ? gmtToLocal(session?.date_time_end || session?.date_time_start, circuitTimezone)
      : toDateTimeInput(session?.date_time_end || session?.date_time_start);
    setForm({
      date_time_start: convertStart,
      date_time_end: convertEnd,
      is_cancelled: session?.is_cancelled || false,
      cancel_reason: session?.cancel_reason || "",
    });
    setSaveError("");
    setFetchStatus("");
    setIsModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleTimeModeChange = (newMode) => {
    if (newMode === timeMode || !circuitTimezone) return;
    // Re-convert the displayed date/time values between modes
    setForm((prev) => {
      const convert = (val) => {
        if (!val) return val;
        if (newMode === "gmt") {
          // Currently local → convert to GMT for display
          const gmt = localToGmt(val, circuitTimezone);
          return toDateTimeInput(gmt);
        }
        // Currently GMT → convert to local for display
        const gmt = fromDateTimeInput(val);
        return gmtToLocal(gmt, circuitTimezone);
      };
      return {
        ...prev,
        date_time_start: convert(prev.date_time_start),
        date_time_end: convert(prev.date_time_end),
      };
    });
    setTimeMode(newMode);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!session?.id) return;
    setSaving(true);
    setSaveError("");
    try {
      const useLocal = timeMode === "local" && circuitTimezone;
      const payload = {
        date_time_start: useLocal
          ? localToGmt(form.date_time_start, circuitTimezone)
          : fromDateTimeInput(form.date_time_start),
        date_time_end: form.date_time_end
          ? (useLocal ? localToGmt(form.date_time_end, circuitTimezone) : fromDateTimeInput(form.date_time_end))
          : null,
        is_cancelled: form.is_cancelled || false,
        cancel_reason: form.is_cancelled ? (form.cancel_reason || null) : null,
      };
      const res = await apiFetch(`/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Failed to update session."));
      setIsModalOpen(false);
      if (onSessionUpdated) onSessionUpdated();
    } catch (err) {
      setSaveError(err.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  const handleFetchWeather = async (source) => {
    if (!session?.id) return;
    setFetchLoading(true);
    setFetchStatus("");
    try {
      const endpoint = source === "openmeteo"
        ? `/sessions/${session.id}/openmeteo/weather/fetch`
        : `/sessions/${session.id}/weather/fetch`;
      const res = await apiFetch(endpoint, { method: "POST" });
      if (!res.ok) throw new Error(await readErrorMessage(res, "Weather fetch failed."));
      const data = await res.json();
      setFetchStatus(
        source === "openmeteo"
          ? "Open-Meteo weather updated"
          : `OpenF1: ${data.imported_count ?? 0} records imported`
      );
      if (onSessionUpdated) onSessionUpdated();
    } catch (err) {
      setFetchStatus(err.message || "Fetch failed.");
    } finally {
      setFetchLoading(false);
    }
  };

  const importType = (() => {
    const t = (sessionType || session?.type || "").toUpperCase();
    if (["FP1", "FP2", "FP3"].includes(t)) return "free-practice";
    if (["QUALI", "Q1", "Q2", "Q3"].includes(t)) return "qualifying";
    return null;
  })();

  const handleImportYaml = async (dryRun) => {
    if (!eventId || !importType || !importFiles.length) return;
    setImportLoading(true);
    setImportLog("");
    try {
      const formData = new FormData();
      for (const file of importFiles) {
        formData.append("files", file);
      }
      const res = await apiFetch(
        `/sessions/import/${importType}/${eventId}?dry_run=${dryRun}`,
        { method: "POST", body: formData }
      );
      if (!res.ok) throw new Error(await readErrorMessage(res, "Import failed."));
      const data = await res.json();
      setImportLog(data.stdout || "Done.");
      if (!dryRun && onSessionUpdated) onSessionUpdated();
    } catch (err) {
      setImportLog(err.message || "Import failed.");
    } finally {
      setImportLoading(false);
    }
  };

  return (
    <>
      <div className="session-banner">
        <div className="session-banner-left">
          <div className="session-banner-title-row">
            <h2 className="session-banner-title">{label}</h2>
            {canEdit && session?.id && (
              <button
                type="button"
                className="session-banner-edit"
                title="Edit session date/time & weather"
                onClick={openModal}
              >
                <span className="material-symbols-outlined">edit</span>
              </button>
            )}
          </div>
          {(sessionDate || timeRange) && (
            <div className="session-banner-stats">
              {sessionDate && (
                <div className="session-banner-stat">
                  <span className="session-banner-stat-label">Date</span>
                  <span className="session-banner-stat-value">{sessionDate}</span>
                </div>
              )}
              {timeRange && (
                <div className="session-banner-stat">
                  <span className="session-banner-stat-label">Time (Local time)</span>
                  <span className="session-banner-stat-value">{timeRange}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {hasConditions && (
          <div className="session-banner-right">
            {weatherIcon && (
              <div className="session-banner-stat">
                <span className="session-banner-stat-label">Weather</span>
                <span className="session-banner-stat-value">
                  <span className="session-banner-weather-icon">{weatherIcon}</span>
                  {weatherLabel || ""}
                </span>
              </div>
            )}
            {trackCondition && (
              <div className="session-banner-stat">
                <span className="session-banner-stat-label">Track Conditions</span>
                <span className="session-banner-stat-value">
                  {trackCondition}
                  {airTempMin != null ? ` / ${Math.round(airTempMin)}°C` : ""}
                  {airTempMax != null && airTempMin != null && airTempMax !== airTempMin
                    ? `–${Math.round(airTempMax)}°C`
                    : ""}
                </span>
              </div>
            )}
            {trackTempMin != null && (
              <div className="session-banner-stat">
                <span className="session-banner-stat-label">Track Temp</span>
                <span className="session-banner-stat-value">
                  {Math.round(trackTempMin)}°C
                  {trackTempMax != null && trackTempMax !== trackTempMin
                    ? `–${Math.round(trackTempMax)}°C`
                    : ""}
                </span>
              </div>
            )}
            {humidity != null && (
              <div className="session-banner-stat">
                <span className="session-banner-stat-label">Humidity</span>
                <span className="session-banner-stat-value">{humidity}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Edit {label}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSave}>
              <div className="form-grid">
                {circuitTimezone && (
                  <div className="time-mode-toggle" style={{ gridColumn: "1 / -1" }}>
                    <button
                      type="button"
                      className={`time-mode-btn${timeMode === "local" ? " is-active" : ""}`}
                      onClick={() => handleTimeModeChange("local")}
                    >
                      Local ({circuitTimezone})
                    </button>
                    <button
                      type="button"
                      className={`time-mode-btn${timeMode === "gmt" ? " is-active" : ""}`}
                      onClick={() => handleTimeModeChange("gmt")}
                    >
                      GMT
                    </button>
                  </div>
                )}
                <label>
                  Start date/time{circuitTimezone ? ` (${timeMode === "local" ? "local" : "GMT"})` : ""}
                  <input
                    type="datetime-local"
                    name="date_time_start"
                    value={form.date_time_start}
                    onChange={handleChange}
                    required
                  />
                </label>
                <label>
                  End date/time{circuitTimezone ? ` (${timeMode === "local" ? "local" : "GMT"})` : ""}
                  <input
                    type="datetime-local"
                    name="date_time_end"
                    value={form.date_time_end}
                    onChange={handleChange}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_cancelled"
                    checked={form.is_cancelled}
                    onChange={handleChange}
                  />
                  Session cancelled
                </label>
                {form.is_cancelled && (
                  <label>
                    Cancel reason
                    <input
                      type="text"
                      name="cancel_reason"
                      value={form.cancel_reason}
                      onChange={handleChange}
                      placeholder="e.g. Weather conditions, safety concerns…"
                    />
                  </label>
                )}
              </div>

              <div className="session-banner-modal-weather">
                <span className="session-banner-stat-label">Fetch Weather Data</span>
                <div className="session-banner-modal-weather-buttons">
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={fetchLoading}
                    onClick={() => handleFetchWeather("openf1")}
                  >
                    {fetchLoading ? "Fetching…" : "OpenF1 Weather"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    disabled={fetchLoading}
                    onClick={() => handleFetchWeather("openmeteo")}
                  >
                    {fetchLoading ? "Fetching…" : "Open-Meteo Weather"}
                  </button>
                </div>
                {fetchStatus && <p className="session-banner-modal-fetch-status">{fetchStatus}</p>}
              </div>

              {importType && eventId && (
                <div className="session-banner-modal-weather">
                  <span className="session-banner-stat-label">Import YAML Data</span>
                  <input
                    type="file"
                    accept=".yml,.yaml"
                    multiple={importType === "free-practice"}
                    onChange={(e) => setImportFiles([...e.target.files])}
                    className="session-banner-file-input"
                  />
                  {importFiles.length > 0 && (
                    <p className="session-banner-modal-fetch-status">
                      {importFiles.map((f) => f.name).join(", ")}
                    </p>
                  )}
                  <div className="session-banner-modal-weather-buttons">
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={importLoading || !importFiles.length}
                      onClick={() => handleImportYaml(true)}
                    >
                      {importLoading ? "Running…" : "Dry Run"}
                    </button>
                    <button
                      type="button"
                      className="ghost-button"
                      disabled={importLoading || !importFiles.length}
                      onClick={() => handleImportYaml(false)}
                    >
                      {importLoading ? "Running…" : "Import"}
                    </button>
                  </div>
                  {importLog && (
                    <pre className="session-banner-import-log">{importLog}</pre>
                  )}
                </div>
              )}

              {saveError && <div className="status-card error">{saveError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
