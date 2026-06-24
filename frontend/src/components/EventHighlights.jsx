import React, { useMemo } from "react";
import DriverName from "./DriverName.jsx";

const WEATHER_CODE_ICONS = {
  0: "☀️",
  1: "🌤️",
  2: "⛅",
  3: "☁️",
  45: "🌫️",
  48: "🌫️",
  51: "🌦️",
  53: "🌦️",
  55: "🌦️",
  56: "🌨️",
  57: "🌨️",
  61: "🌧️",
  63: "🌧️",
  65: "🌧️",
  66: "🌨️",
  67: "🌨️",
  71: "❄️",
  73: "❄️",
  75: "❄️",
  77: "❄️",
  80: "🌦️",
  81: "🌦️",
  82: "🌦️",
  85: "🌨️",
  86: "🌨️",
  95: "⛈️",
  96: "⛈️",
  99: "⛈️",
};

const WEATHER_CODE_LABELS = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow",
  73: "Moderate snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Slight showers",
  81: "Moderate showers",
  82: "Violent showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm w/ hail",
  99: "Thunderstorm w/ hail",
};

const resolveCircuitLengthKm = (event, circuitVersions) => {
  if (!event?.event_date || !circuitVersions?.length) return null;
  const year = Number(String(event.event_date).slice(0, 4));
  if (!year) return null;
  const sorted = [...circuitVersions].sort((a, b) => {
    const aFrom = a.valid_from ?? 0;
    const bFrom = b.valid_from ?? 0;
    return bFrom - aFrom;
  });
  const match = sorted.find((version) => {
    const start = version.valid_from ?? -Infinity;
    const end = version.valid_to ?? Infinity;
    return year >= start && year <= end;
  });
  const fallback = match || sorted[0];
  return fallback?.length_km ?? null;
};

export default function EventHighlights({
  event,
  circuitVersions,
  poleEntry,
  raceWinnerEntry,
  countryByCode,
  raceWeatherCode,
}) {
  const lengthKm = useMemo(
    () => resolveCircuitLengthKm(event, circuitVersions),
    [event, circuitVersions]
  );

  const renderEntryLabel = (entry) => {
    if (!entry?.driver) return "—";
    return <DriverName driver={entry.driver} countryByCode={countryByCode} />;
  };

  return (
    <div className="hero-panel">
      <div className="panel-title">Event highlights</div>
      <div className="panel-grid" style={{ marginBottom: 16 }}>
        <div className="panel-card">
          <div className="panel-label">Round #</div>
          <div className="panel-value">{event?.round ?? "--"}</div>
        </div>
        <div className="panel-card">
          <div className="panel-label">Circuit length (km)</div>
          <div className="panel-value">
            {lengthKm != null ? Number(lengthKm).toFixed(3) : "--"}
          </div>
        </div>
        <div className="panel-card">
          <div className="panel-label">Laps / Scheduled</div>
          <div className="panel-value">
            {event?.laps != null
              ? `${event.laps}${
                  event?.scheduled_laps != null
                    ? ` / ${event.scheduled_laps}`
                    : ""
                }`
              : event?.scheduled_laps ?? "--"}
          </div>
        </div>
        <div className="panel-card">
          <div className="panel-label">Distance (km)</div>
          <div className="panel-value">
            {event?.distance || event?.scheduled_distance || "--"}
            {event?.distance && event?.scheduled_distance
              ? ` / ${event.scheduled_distance}`
              : ""}
          </div>
        </div>
      </div>
      <div className="panel-grid">
        <div className="panel-card">
          <div className="panel-label">Pole position</div>
          <div className="panel-value">{renderEntryLabel(poleEntry)}</div>
        </div>
        <div className="panel-card">
          <div className="panel-label">Race winner</div>
          <div className="panel-value">{renderEntryLabel(raceWinnerEntry)}</div>
        </div>
        {raceWeatherCode != null && (
          <div className="panel-card">
            <div className="panel-label">Race weather</div>
            <div className="panel-value" title={WEATHER_CODE_LABELS[raceWeatherCode] || `Code ${raceWeatherCode}`}>
              <span style={{ fontSize: "1.5em", lineHeight: 1 }}>
                {WEATHER_CODE_ICONS[raceWeatherCode] || "🌡️"}
              </span>{" "}
              <span style={{ fontSize: "0.85em" }}>
                {WEATHER_CODE_LABELS[raceWeatherCode] || `Code ${raceWeatherCode}`}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
