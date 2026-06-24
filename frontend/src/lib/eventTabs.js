const EXCLUDED_SESSION_TYPES = new Set(["Q1", "Q2", "Q3", "SQ1", "SQ2", "SQ3"]);

export function getEventSessionCount(sessions = []) {
  return sessions.filter((sessionItem) => {
    const type = String(sessionItem?.type || "").toUpperCase();
    return !EXCLUDED_SESSION_TYPES.has(type);
  }).length;
}

// `basePath` is the season-scoped event root, e.g. `/seasons/1956/events/grand_prix_de_monaco_1956`.
export function buildEventTabs({
  basePath,
  sessions = [],
  sessionCounts = {},
  entriesCount = 0,
  fastestLapCount = 0,
  standingsCount = 0,
  driverOfTheDayCount = 0,
}) {
  const byType = Object.entries(sessionCounts || {}).reduce((acc, [type, count]) => {
    acc[String(type).toUpperCase()] = Number(count) || 0;
    return acc;
  }, {});
  const fpCount = (byType.FP1 || 0) + (byType.FP2 || 0) + (byType.FP3 || 0);
  const sprintQualifyingCount =
    byType.SQ || (byType.SQ1 || 0) + (byType.SQ2 || 0) + (byType.SQ3 || 0);
  const sprintRaceCount = byType.SR || 0;
  const hasSprintSession = sessions.some((sessionItem) => {
    const sessionType = String(sessionItem?.type || "").toUpperCase();
    return sessionType === "SR";
  });
  const sprintRaceLink = `${basePath}/race?sessionType=SR&label=Sprint`;
  const raceLink = `${basePath}/race`;
  const sessionCount = getEventSessionCount(sessions);

  const tabs = [
    {
      id: "entries",
      label: `Entries (${entriesCount})`,
      to: `${basePath}/entry-list`,
    },
    {
      id: "practice",
      label: `Free Practice (${fpCount})`,
      to: `${basePath}/practice`,
    },
  ];

  if (sprintQualifyingCount > 0) {
    tabs.push({
      id: "sprint-qualifying",
      label: `Sprint Qualifying (${sprintQualifyingCount})`,
      to: `${basePath}/sprint-qualifying`,
    });
  }

  tabs.push({
    id: "qualifying",
    label: `Qualifications (${byType.QUALI || 0})`,
    to: `${basePath}/qualifying`,
  });

  if (sprintRaceCount > 0 || hasSprintSession) {
    tabs.push({
      id: "sprint",
      label: `Sprint (${sprintRaceCount})`,
      to: sprintRaceLink,
    });
  }

  tabs.push(
    { id: "race", label: `Race (${byType.RACE || 0})`, to: raceLink },
  );

  tabs.push({
    id: "driver-of-the-day",
    label: `Driver of the Day (${driverOfTheDayCount})`,
    to: `${basePath}/driver-of-the-day`,
  });

  tabs.push(
    {
      id: "fastest-lap",
      label: `Fastest Lap (${fastestLapCount})`,
      to: `${basePath}/fastest-lap`,
    },
    {
      id: "speed-trap",
      label: `Speed Trap (${fastestLapCount})`,
      to: `${basePath}/speed-trap`,
    },
    {
      id: "standings",
      label: `Standing (${standingsCount})`,
      to: `${basePath}/standings`,
    },
    {
      id: "references",
      label: "References",
      to: `${basePath}/references`,
    }
  );

  return tabs;
}

// `basePath` is the season-scoped event root (see buildEventTabs).
export function resolveActiveEventTab(basePath, pathname, search = "") {
  const base = basePath;
  const path = pathname || "";
  if (path.endsWith(base) || path.endsWith(`${base}/sessions`)) return "practice";
  if (path.endsWith(`${base}/practice`)) return "practice";
  if (path.endsWith(`${base}/entry-list`)) return "entries";
  if (path.endsWith(`${base}/sprint-qualifying`)) return "sprint-qualifying";
  if (path.endsWith(`${base}/qualifying`)) return "qualifying";
  if (path.endsWith(`${base}/race`)) {
    const params = new URLSearchParams(search);
    const querySessionType = params.get("sessionType") || params.get("sessiontype");
    const hasSprintSessionType = String(querySessionType || "")
      .toUpperCase() === "SR";
    return hasSprintSessionType
      ? "sprint"
      : "race";
  }
  if (path.endsWith(`${base}/driver-of-the-day`)) return "driver-of-the-day";
  if (path.endsWith(`${base}/fastest-lap`)) return "fastest-lap";
  if (path.endsWith(`${base}/speed-trap`)) return "speed-trap";
  if (path.endsWith(`${base}/standings`)) return "standings";
  if (path.endsWith(`${base}/references`)) return "references";
  return "practice";
}
