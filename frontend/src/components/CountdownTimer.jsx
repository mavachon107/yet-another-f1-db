import React, { useEffect, useState } from "react";

const SESSION_LABELS = {
  FP1: "Free Practice 1",
  FP2: "Free Practice 2",
  FP3: "Free Practice 3",
  QUALI: "Qualifying",
  Q1: "Q1",
  Q2: "Q2",
  Q3: "Q3",
  SQ: "Sprint Qualifying",
  SR: "Sprint Race",
  SQ1: "Sprint Q1",
  SQ2: "Sprint Q2",
  SQ3: "Sprint Q3",
  RACE: "Race",
};

function formatCountdown(ms) {
  if (ms <= 0) return null;
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days > 0) parts.push({ value: days, unit: "d" });
  parts.push({ value: hours, unit: "h" });
  parts.push({ value: minutes, unit: "m" });
  parts.push({ value: seconds, unit: "s" });
  return parts;
}

export default function CountdownTimer({ sessions }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!sessions || sessions.length === 0) return null;

  const sorted = [...sessions]
    .filter((s) => s.date_time_start)
    .sort((a, b) => new Date(a.date_time_start) - new Date(b.date_time_start));

  // Find ongoing session
  const ongoing = sorted.find((s) => {
    const start = new Date(s.date_time_start).getTime();
    const end = s.date_time_end ? new Date(s.date_time_end).getTime() : start + 7200000;
    return now >= start && now < end;
  });

  if (ongoing) {
    const label = SESSION_LABELS[ongoing.type] || ongoing.type || "Session";
    return (
      <div className="countdown-row">
        <span className="countdown-session-label">{label}</span>
        <span className="countdown-timer countdown-live">In progress</span>
      </div>
    );
  }

  // Find next upcoming session
  const upcoming = sorted.find(
    (s) => new Date(s.date_time_start).getTime() > now
  );

  if (!upcoming) {
    return (
      <div className="countdown-row">
        <span className="countdown-session-label">Event completed</span>
      </div>
    );
  }

  const label = SESSION_LABELS[upcoming.type] || upcoming.type || "Session";
  const diff = new Date(upcoming.date_time_start).getTime() - now;
  const parts = formatCountdown(diff);

  return (
    <div className="countdown-row">
      <span className="countdown-session-label">{label}</span>
      <span className="countdown-timer">
        {parts.map((p, i) => (
          <span key={i}>
            {p.value}
            <span className="countdown-unit">{p.unit}</span>
            {i < parts.length - 1 ? " " : ""}
          </span>
        ))}
      </span>
    </div>
  );
}
