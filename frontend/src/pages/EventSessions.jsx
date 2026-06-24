import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router-dom";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";
import { gmtToLocal, localToGmt } from "../lib/timezone.js";
import { isAuthenticated, onAuthChanged } from "../lib/auth.js";
import { buildEventTabs, resolveActiveEventTab } from "../lib/eventTabs.js";
import { resolvePrevNextEvents } from "../lib/eventNavigation.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DataTable from "../components/DataTable.jsx";
import EventDetailHeader from "../components/EventDetailHeader.jsx";
import EventHighlights from "../components/EventHighlights.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import useCountries from "../hooks/useCountries.js";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ensureUtc = (value) => {
  if (!value) return null;
  const s = String(value).trim();
  if (!s.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(s)) return s + "Z";
  return s;
};

const formatDate = (value, timezone) => {
  if (!value) return "TBD";
  const date = new Date(ensureUtc(value));
  const opts = { month: "short", day: "numeric", year: "numeric" };
  if (timezone) opts.timeZone = timezone;
  return date.toLocaleDateString("en-US", opts);
};

const formatTime = (value, timezone) => {
  if (!value) return "TBD";
  const date = new Date(ensureUtc(value));
  const opts = { hour: "2-digit", minute: "2-digit", hour12: false };
  if (timezone) opts.timeZone = timezone;
  return date.toLocaleTimeString("en-US", opts);
};

const formatSessionWindow = (startValue, endValue, timezone) => {
  if (!startValue) return "TBD";
  const startDate = new Date(ensureUtc(startValue));
  const endDate = endValue ? new Date(ensureUtc(endValue)) : null;
  const dateLabel = formatDate(startDate, timezone);
  const startTime = formatTime(startDate, timezone);
  if (!endDate || Number.isNaN(endDate.getTime())) {
    return `${dateLabel}, ${startTime} - TBD`;
  }
  const endTime = formatTime(endDate, timezone);
  if (formatDate(endDate, timezone) !== dateLabel) {
    return `${dateLabel}, ${startTime} - ${formatDate(endDate, timezone)}, ${endTime}`;
  }
  return `${dateLabel}, ${startTime} - ${endTime}`;
};

const formatUpdatedAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const weatherCodeLabels = {
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
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Thunderstorm with heavy hail",
};


const weatherCodeIcons = {
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

const WeatherCodeCell = ({ value }) => {
  if (value === null || value === undefined || value === "") return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  const icon = weatherCodeIcons[numeric] || "🌡️";
  const label = weatherCodeLabels[numeric] || `Code ${numeric}`;
  return (
    <span title={label}>
      <span style={{ fontSize: "1.2em", lineHeight: 1 }}>{icon}</span>{" "}
      <span style={{ fontSize: "0.85em" }}>{label}</span>
    </span>
  );
};

const formatRange = (minValue, maxValue) => {
  if (
    minValue === null ||
    minValue === undefined ||
    maxValue === null ||
    maxValue === undefined
  ) {
    return "—";
  }
  return `${minValue} - ${maxValue}`;
};

const toDateTimeInput = (value) => {
  if (!value) return "";
  const text = String(value).replace(" ", "T");
  return text.length >= 16 ? text.slice(0, 16) : text;
};

const fromDateTimeInput = (value) => {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length === 16 ? `${text}:00` : text;
};

const editIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M4 20l4.5-1 9-9-3.5-3.5-9 9L4 20z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M13.5 5.5l3.5 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export default function EventSessions() {
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [event, setEvent] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [prevEvent, setPrevEvent] = useState(null);
  const [nextEvent, setNextEvent] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [entries, setEntries] = useState([]);
  const [entriesCount, setEntriesCount] = useState(0);
  const [sessionCounts, setSessionCounts] = useState({});
  const [eventSessions, setEventSessions] = useState([]);
  const [fastestLapCount, setFastestLapCount] = useState(0);
  const [standingsCount, setStandingsCount] = useState(0);
  const [driverOfTheDayCount, setDriverOfTheDayCount] = useState(0);
  const [poleResult, setPoleResult] = useState(null);
  const [raceWinnerResult, setRaceWinnerResult] = useState(null);
  const [fastestLapResults, setFastestLapResults] = useState([]);
  const [driverStandings, setDriverStandings] = useState([]);
  const [constructorStandings, setConstructorStandings] = useState([]);
  const [fp1Results, setFp1Results] = useState([]);
  const [fp2Results, setFp2Results] = useState([]);
  const [fp3Results, setFp3Results] = useState([]);
  const [practiceLoaded, setPracticeLoaded] = useState(false);
  const [fastestLapLoaded, setFastestLapLoaded] = useState(false);
  const [standingsLoaded, setStandingsLoaded] = useState(false);
  const [standingsUpdateLoading, setStandingsUpdateLoading] = useState(false);
  const [standingsUpdateError, setStandingsUpdateError] = useState("");
  const [standingsUpdateStatus, setStandingsUpdateStatus] = useState("");
  const [isFastestLapModalOpen, setIsFastestLapModalOpen] = useState(false);
  const [fastestLapForm, setFastestLapForm] = useState({
    entry_id: "",
    laps: "",
    time: "",
  });
  const [fastestLapEditingId, setFastestLapEditingId] = useState(null);
  const [fastestLapSaving, setFastestLapSaving] = useState(false);
  const [fastestLapSaveError, setFastestLapSaveError] = useState("");
  const [isFastestLapDeleteOpen, setIsFastestLapDeleteOpen] = useState(false);
  const [fastestLapDeleting, setFastestLapDeleting] = useState(false);
  const [fastestLapDeleteError, setFastestLapDeleteError] = useState("");
  const [activeTab, setActiveTab] = useState(() =>
    resolveActiveEventTab(eventBase, location.pathname, location.search)
  );
  const [activeStandingSection, setActiveStandingSection] = useState("driver");
  const [activePracticeTab, setActivePracticeTab] = useState("fp1");
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionEditingId, setSessionEditingId] = useState(null);
  const [sessionForm, setSessionForm] = useState({
    type: "",
    date_time_start: "",
    date_time_end: "",
  });
  const [sessionTimeMode, setSessionTimeMode] = useState("local");
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionSaveError, setSessionSaveError] = useState("");
  const [sessionFetchLoading, setSessionFetchLoading] = useState(false);
  const [sessionFetchError, setSessionFetchError] = useState("");
  const [sessionFetchStatus, setSessionFetchStatus] = useState("");
  const [omFetchLoading, setOmFetchLoading] = useState(false);
  const [omFetchError, setOmFetchError] = useState("");
  const [omFetchStatus, setOmFetchStatus] = useState("");
  const [sessionDeleting, setSessionDeleting] = useState(false);
  const [sessionDeleteError, setSessionDeleteError] = useState("");
  const [isSessionDeleteOpen, setIsSessionDeleteOpen] = useState(false);
  const [isWeatherGraphModalOpen, setIsWeatherGraphModalOpen] = useState(false);
  const [weatherGraphLoadingId, setWeatherGraphLoadingId] = useState(null);
  const [weatherGraphError, setWeatherGraphError] = useState("");
  const [weatherGraphSessionLabel, setWeatherGraphSessionLabel] = useState("");
  const [weatherGraphSeries, setWeatherGraphSeries] = useState([]);
  const [openF1MeetingFetchLoading, setOpenF1MeetingFetchLoading] = useState(false);
  const [openF1MeetingFetchError, setOpenF1MeetingFetchError] = useState("");
  const [openF1MeetingSyncStatus, setOpenF1MeetingSyncStatus] = useState("");
  const [openF1SessionFetchLoadingId, setOpenF1SessionFetchLoadingId] = useState(null);
  const [openF1SessionFetchError, setOpenF1SessionFetchError] = useState("");
  const [openF1SessionPayload, setOpenF1SessionPayload] = useState(null);
  const [isOpenF1SessionModalOpen, setIsOpenF1SessionModalOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    event_name: "",
    event_official_name: "",
    event_date: "",
    round: "",
    circuit_id: "",
    regulatory_system_id: "",
    championship_ids: [],
    laps: "",
    scheduled_laps: "",
    distance: "",
    scheduled_distance: "",
  });
  const [eventSaving, setEventSaving] = useState(false);
  const [eventSaveError, setEventSaveError] = useState("");
  const [circuits, setCircuits] = useState([]);
  const [circuitsLoading, setCircuitsLoading] = useState(false);
  const [circuitsError, setCircuitsError] = useState("");
  const [regSystems, setRegSystems] = useState([]);
  const [regSystemsError, setRegSystemsError] = useState("");
  const [championships, setChampionships] = useState([]);
  const [championshipsError, setChampionshipsError] = useState("");
  const [circuitVersions, setCircuitVersions] = useState([]);
  const [circuitVersionsError, setCircuitVersionsError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(isAuthenticated());
  const { countryByCode, countryByName } = useCountries();

  useEffect(() => {
    return onAuthChanged(() => {
      setCanEdit(isAuthenticated());
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [
          eventData,
          sessionData,
          sessionCountData,
          entryCountData,
          standingsCountData,
          dotdCountData,
          qualifyingResults,
          raceResults,
        ] = await Promise.all([
          apiGet(`/events/${eventId}`),
          apiGet(`/sessions/by-event/${eventId}`),
          apiGet(`/session-results/counts/by-event/${eventId}`),
          apiGet(`/event-entries/count/by-event/${eventId}`),
          apiGet(`/standings/count/by-event/${eventId}`),
          apiGet(`/driver-of-the-day/count/by-event/${eventId}`),
          apiGet(`/session-results/by-event/${eventId}?session_type=QUALI`),
          apiGet(`/session-results/by-event/${eventId}?session_type=RACE`),
        ]);
        const seasonData = eventData?.season_id
          ? await apiGet(`/seasons/${eventData.season_id}`)
          : null;
        const resolvePositionOne = (items) =>
          items.find((item) => String(item.position) === "1") ||
          items.find((item) => Number.parseInt(item.position, 10) === 1) ||
          null;
        if (isActive) {
          setEvent(eventData);
          setSeasonYear(seasonData?.year ?? null);
          setEventForm({
            event_name: eventData?.event_name || "",
            event_official_name: eventData?.event_official_name || "",
            event_date: eventData?.event_date
              ? String(eventData.event_date).split("T")[0]
              : "",
            round: eventData?.round ?? "",
            circuit_id: eventData?.circuit_id ?? eventData?.circuit?.id ?? "",
            regulatory_system_id: eventData?.regulatory_system?.id ?? "",
            championship_ids: (eventData?.championships || [])
              .map((championship) => championship.id)
              .filter((id) => id !== undefined && id !== null),
            laps: eventData?.laps ?? "",
            scheduled_laps: eventData?.scheduled_laps ?? "",
            distance: eventData?.distance || "",
            scheduled_distance: eventData?.scheduled_distance || "",
          });
          setSessions(sessionData);
          setEventSessions(sessionData);
          setEntriesCount(entryCountData?.count ?? 0);
          setSessionCounts(sessionCountData?.by_session_type || {});
          setFastestLapCount(sessionCountData?.fastest_lap ?? 0);
          setStandingsCount(standingsCountData?.count ?? 0);
          setDriverOfTheDayCount(dotdCountData?.count || 0);
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
          setEntries([]);
          setFastestLapResults([]);
          setDriverStandings([]);
          setConstructorStandings([]);
          setFp1Results([]);
          setFp2Results([]);
          setFp3Results([]);
          setPracticeLoaded(false);
          setFastestLapLoaded(false);
          setStandingsLoaded(false);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load event data.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      isActive = false;
    };
  }, [eventId]);

  useEffect(() => {
    if (!event?.season_id) return;
    let isActive = true;
    async function loadNav() {
      try {
        const events = await apiGet(`/events/by-season/${event.season_id}`);
        const { prevEvent, nextEvent } = resolvePrevNextEvents(events, eventId);
        if (isActive) {
          setPrevEvent(prevEvent);
          setNextEvent(nextEvent);
        }
      } catch {
        if (isActive) {
          setPrevEvent(null);
          setNextEvent(null);
        }
      }
    }
    loadNav();
    return () => {
      isActive = false;
    };
  }, [event?.season_id, eventId]);

  useEffect(() => {
    if (!isEventModalOpen) return;
    let isActive = true;

    async function loadLookups() {
      setCircuitsLoading(true);
      try {
        const PAGE_SIZE = 100;
        let offset = 0;
        let items = [];
        while (true) {
          const batch = await apiGet(
            `/circuits?limit=${PAGE_SIZE}&offset=${offset}`
          );
          items = items.concat(batch);
          if (batch.length < PAGE_SIZE) {
            break;
          }
          offset += PAGE_SIZE;
        }
        if (!isActive) return;
        setCircuits(items);
        setCircuitsError("");
      } catch (err) {
        if (isActive) {
          setCircuits([]);
          setCircuitsError(err.message || "Failed to load circuits.");
        }
        return;
      } finally {
        if (isActive) {
          setCircuitsLoading(false);
        }
      }

      try {
        const regData = await apiGet("/regulatory-systems?limit=100");
        if (!isActive) return;
        setRegSystems(Array.isArray(regData) ? regData : []);
        setRegSystemsError("");
      } catch (err) {
        if (isActive) {
          setRegSystems([]);
          setRegSystemsError(err.message || "Failed to load regulatory systems.");
        }
      }

      try {
        const champData = await apiGet("/championships?limit=100");
        if (!isActive) return;
        setChampionships(Array.isArray(champData) ? champData : []);
        setChampionshipsError("");
      } catch (err) {
        if (isActive) {
          setChampionships([]);
          setChampionshipsError(err.message || "Failed to load championships.");
        }
      }
    }

    loadLookups();
    return () => {
      isActive = false;
    };
  }, [isEventModalOpen]);

  useEffect(() => {
    if (!event?.circuit?.id) return;
    let isActive = true;

    async function loadCircuitVersions() {
      try {
        const data = await apiGet(`/circuit-versions/by-circuit/${event.circuit.id}`);
        if (!isActive) return;
        setCircuitVersions(Array.isArray(data) ? data : []);
        setCircuitVersionsError("");
      } catch (err) {
        if (isActive) {
          setCircuitVersions([]);
          setCircuitVersionsError(
            err.message || "Failed to load circuit versions."
          );
        }
      }
    }

    loadCircuitVersions();
    return () => {
      isActive = false;
    };
  }, [event?.circuit?.id]);

  const formatDriver = (driver) => {
    if (!driver) return "—";
    const fullName = `${driver.first_name || ""} ${driver.last_name || ""}`.trim();
    if (fullName) return fullName;
    return driver.short_name || "—";
  };

  const formatTeam = (team) => {
    if (!team) return "—";
    return team.team_name || team.short_name;
  };

  const formatCar = (car) => {
    if (!car) return "—";
    return car.chassis_name || "—";
  };

  const formatTire = (tire) => {
    if (!tire) return "—";
    return tire.abbreviation || tire.short_name || tire.manufactor_name;
  };

  const formatEntryOption = (entry) => {
    const carNumber = entry.car_number ? `#${entry.car_number}` : "Car";
    const driverLabel = formatDriver(entry.driver);
    const teamLabel = formatTeam(entry.team);
    return `${carNumber} — ${driverLabel}${teamLabel ? ` (${teamLabel})` : ""}`;
  };

  const sortPosition = useCallback((value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? 9999 : parsed;
  }, []);

  const excludedSessionTypes = useMemo(
    () => new Set(["q1", "q2", "q3", "sq1", "sq2", "sq3"]),
    []
  );

  const filteredSessions = useMemo(() => {
    if (!sessions.length) return [];
    return sessions.filter((sessionItem) => {
      const type = String(sessionItem.type || "").toLowerCase();
      return !excludedSessionTypes.has(type);
    });
  }, [excludedSessionTypes, sessions]);

  const latestSessionUpdatedAt = useMemo(() => {
    const values = (filteredSessions || [])
      .map((sessionItem) => sessionItem.updated_at)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));
    if (!values.length) return null;
    return new Date(Math.max(...values)).toISOString();
  }, [filteredSessions]);

  useEffect(() => {
    setActiveTab(
      resolveActiveEventTab(eventBase, location.pathname, location.search)
    );
  }, [eventId, location.pathname, location.search]);

  useEffect(() => {
    if (!searchParams.has("edit")) return;
    if (!canEdit) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("edit");
      setSearchParams(nextParams, { replace: true });
      return;
    }
    setIsEventModalOpen(true);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("edit");
    setSearchParams(nextParams, { replace: true });
  }, [canEdit, searchParams, setSearchParams]);


  const tabs = useMemo(
    () =>
      buildEventTabs({
        basePath: eventBase,
        sessions,
        sessionCounts,
        entriesCount,
        fastestLapCount,
        standingsCount,
        driverOfTheDayCount,
      }),
    [
      entriesCount,
      eventId,
      fastestLapCount,
      sessions,
      sessionCounts,
      standingsCount,
      driverOfTheDayCount,
    ]
  );

  useEffect(() => {
    const tabIds = new Set(tabs.map((tab) => tab.id));
    if (!tabIds.has(activeTab)) {
      setActiveTab("sessions");
    }
  }, [tabs, activeTab]);

  useEffect(() => {
    let isActive = true;

    async function loadPractice() {
      try {
        const [fp1Data, fp2Data, fp3Data] = await Promise.all([
          apiGet(`/session-results/by-event/${eventId}?session_type=FP1`),
          apiGet(`/session-results/by-event/${eventId}?session_type=FP2`),
          apiGet(`/session-results/by-event/${eventId}?session_type=FP3`),
        ]);
        if (!isActive) return;
        setFp1Results(
          fp1Data
            .slice()
            .sort((a, b) => sortPosition(a.position) - sortPosition(b.position))
        );
        setFp2Results(
          fp2Data
            .slice()
            .sort((a, b) => sortPosition(a.position) - sortPosition(b.position))
        );
        setFp3Results(
          fp3Data
            .slice()
            .sort((a, b) => sortPosition(a.position) - sortPosition(b.position))
        );
        setPracticeLoaded(true);
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load practice results.");
        }
      }
    }

    async function loadFastestLaps() {
      try {
        const [fastestLapData, entryData] = await Promise.all([
          apiGet(`/session-results/fastest-laps/by-event/${eventId}`),
          apiGet(`/event-entries/by-event/${eventId}`),
        ]);
        if (!isActive) return;
        setFastestLapResults(fastestLapData);
        setEntries(
          entryData
            .slice()
            .sort((a, b) => (a.car_number ?? 999) - (b.car_number ?? 999))
        );
        setFastestLapLoaded(true);
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load fastest laps.");
        }
      }
    }

    async function loadStandings() {
      try {
        const [driverStandingData, constructorStandingData] = await Promise.all([
          apiGet(`/standings/by-event/${eventId}?standing_type=DRIVER`),
          apiGet(`/standings/by-event/${eventId}?standing_type=CONSTRUCTOR`),
        ]);
        if (!isActive) return;
        setDriverStandings(
          driverStandingData
            .slice()
            .sort((a, b) => sortPosition(a.position) - sortPosition(b.position))
        );
        setConstructorStandings(
          constructorStandingData
            .slice()
            .sort((a, b) => sortPosition(a.position) - sortPosition(b.position))
        );
        setStandingsLoaded(true);
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load driver standings.");
        }
      }
    }

    if (activeTab === "practice" && !practiceLoaded) {
      loadPractice();
    }
    if (activeTab === "fastest-lap" && !fastestLapLoaded) {
      loadFastestLaps();
    }
    if (activeTab === "standings" && !standingsLoaded) {
      loadStandings();
    }

    return () => {
      isActive = false;
    };
  }, [
    activeTab,
    eventId,
    fastestLapLoaded,
    practiceLoaded,
    standingsLoaded,
    sortPosition,
  ]);

  const renderEmptyState = (message) => (
    <div className="status-card">{message}</div>
  );

  const formatSessionLabel = (session) => {
    if (!session) return "Session";
    const type = String(session.type || "").toUpperCase();
    const labels = {
      FP1: "Practice 1",
      FP2: "Practice 2",
      FP3: "Practice 3",
      QUALI: "Qualifying",
      Q1: "Q1",
      Q2: "Q2",
      Q3: "Q3",
      SQ: "Sprint Qualifying",
      SQ1: "SQ1",
      SQ2: "SQ2",
      SQ3: "SQ3",
      SR: "Sprint",
      RACE: "Race",
    };
    return labels[type] || session.type || "Session";
  };

  const circuitTimezone = event?.circuit?.timezone || null;

  const openSessionModal = (sessionItem = null) => {
    if (!canEdit) return;
    const mode = circuitTimezone ? "local" : "gmt";
    setSessionTimeMode(mode);
    if (sessionItem) {
      setSessionEditingId(sessionItem.id);
      const convertDt = (v) =>
        mode === "local" && circuitTimezone
          ? gmtToLocal(v, circuitTimezone)
          : toDateTimeInput(v);
      setSessionForm({
        type: String(sessionItem.type || ""),
        date_time_start: convertDt(sessionItem.date_time_start),
        date_time_end: convertDt(sessionItem.date_time_end || sessionItem.date_time_start),
        is_cancelled: sessionItem.is_cancelled || false,
        cancel_reason: sessionItem.cancel_reason || "",
      });
    } else {
      setSessionEditingId(null);
      setSessionForm({
        type: "",
        date_time_start: "",
        date_time_end: "",
        is_cancelled: false,
        cancel_reason: "",
      });
    }
    setSessionSaveError("");
    setSessionFetchError("");
    setSessionDeleteError("");
    setIsSessionModalOpen(true);
  };

  const handleSessionFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setSessionForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSessionTimeModeChange = (newMode) => {
    if (newMode === sessionTimeMode || !circuitTimezone) return;
    setSessionForm((prev) => {
      const convert = (val) => {
        if (!val) return val;
        if (newMode === "gmt") {
          const gmt = localToGmt(val, circuitTimezone);
          return toDateTimeInput(gmt);
        }
        const gmt = fromDateTimeInput(val);
        return gmtToLocal(gmt, circuitTimezone);
      };
      return {
        ...prev,
        date_time_start: convert(prev.date_time_start),
        date_time_end: convert(prev.date_time_end),
      };
    });
    setSessionTimeMode(newMode);
  };

  const handleSessionSave = async (event) => {
    event.preventDefault();
    if (!eventId) return;
    setSessionSaving(true);
    setSessionSaveError("");

    try {
      const useLocal = sessionTimeMode === "local" && circuitTimezone;
      const payload = {
        event_id: Number(eventId),
        type: sessionForm.type || null,
        date_time_start: useLocal
          ? localToGmt(sessionForm.date_time_start, circuitTimezone)
          : fromDateTimeInput(sessionForm.date_time_start),
        date_time_end: sessionForm.date_time_end
          ? (useLocal ? localToGmt(sessionForm.date_time_end, circuitTimezone) : fromDateTimeInput(sessionForm.date_time_end))
          : null,
        is_cancelled: sessionForm.is_cancelled || false,
        cancel_reason: sessionForm.is_cancelled ? (sessionForm.cancel_reason || null) : null,
      };
      const response = await apiFetch(
        sessionEditingId ? `/sessions/${sessionEditingId}` : "/sessions",
        {
          method: sessionEditingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update session.");
      }
      const updated = await response.json();
      setSessions((prev) => {
        const exists = prev.find((item) => item.id === updated.id);
        if (exists) {
          return prev.map((item) => (item.id === updated.id ? updated : item));
        }
        return [...prev, updated];
      });
      setIsSessionModalOpen(false);
    } catch (err) {
      setSessionSaveError(err.message || "Failed to update session.");
    } finally {
      setSessionSaving(false);
    }
  };

  const handleSessionFetchWeather = async (sessionItem = null) => {
    const target =
      sessionItem ||
      sessions.find((item) => item.id === sessionEditingId) ||
      null;
    if (!target) return;
    setSessionFetchLoading(true);
    setSessionFetchError("");
    setSessionFetchStatus("");
    try {
      const response = await apiFetch(
        `/sessions/${target.id}/weather/fetch`,
        { method: "POST" }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to fetch weather.");
      }
      const payload = await response.json();
      clearApiCache(`/sessions/by-event/${eventId}`);
      const refreshedSessions = await apiGet(`/sessions/by-event/${eventId}`);
      setSessions(Array.isArray(refreshedSessions) ? refreshedSessions : []);
      setEventSessions(Array.isArray(refreshedSessions) ? refreshedSessions : []);
      setSessionFetchStatus(
        `Weather fetched: ${payload?.imported_count ?? 0} samples imported.`
      );
    } catch (err) {
      setSessionFetchError(err.message || "Failed to fetch weather.");
    } finally {
      setSessionFetchLoading(false);
    }
  };

  const handleOpenMeteoFetchWeather = async () => {
    const target = sessions.find((item) => item.id === sessionEditingId) || null;
    if (!target) return;
    setOmFetchLoading(true);
    setOmFetchError("");
    setOmFetchStatus("");
    try {
      const response = await apiFetch(
        `/sessions/${target.id}/openmeteo/weather/fetch?mode=weather_code_only`,
        { method: "POST" }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to fetch Open-Meteo weather.");
      }
      const payload = await response.json();
      clearApiCache(`/sessions/by-event/${eventId}`);
      const refreshedSessions = await apiGet(`/sessions/by-event/${eventId}`);
      setSessions(Array.isArray(refreshedSessions) ? refreshedSessions : []);
      setEventSessions(Array.isArray(refreshedSessions) ? refreshedSessions : []);
      setOmFetchStatus(
        `Open-Meteo: ${payload?.imported_count ?? 0} imported, ${payload?.updated_count ?? 0} updated.`
      );
    } catch (err) {
      setOmFetchError(err.message || "Failed to fetch Open-Meteo weather.");
    } finally {
      setOmFetchLoading(false);
    }
  };

  const handleOpenWeatherGraph = async (sessionItem) => {
    if (!sessionItem?.id) return;
    setWeatherGraphLoadingId(sessionItem.id);
    setWeatherGraphError("");
    setWeatherGraphSeries([]);
    try {
      const data = await apiGet(`/sessions/${sessionItem.id}/weather`);
      const points = Array.isArray(data?.points) ? data.points : [];
      const series = points.map((point) => {
        const dt = point?.recorded_at ? new Date(point.recorded_at) : null;
        const ms = dt && !Number.isNaN(dt.getTime()) ? dt.getTime() : null;
        return {
          timeMs: ms,
          air_temperature: point?.air_temperature ?? null,
          track_temperature: point?.track_temperature ?? null,
          rainfall: point?.rainfall ?? null,
        };
      });
      setWeatherGraphSessionLabel(formatSessionLabel(sessionItem));
      setWeatherGraphSeries(series);
      setIsWeatherGraphModalOpen(true);
    } catch (err) {
      setWeatherGraphError(err.message || "Failed to load weather graph data.");
    } finally {
      setWeatherGraphLoadingId(null);
    }
  };

  const handleSessionDelete = async () => {
    if (!sessionEditingId) return;
    setSessionDeleting(true);
    setSessionDeleteError("");
    try {
      const response = await apiFetch(`/sessions/${sessionEditingId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete session.");
      }
      setSessions((prev) =>
        prev.filter((item) => item.id !== sessionEditingId)
      );
      setIsSessionModalOpen(false);
      setIsSessionDeleteOpen(false);
      setSessionEditingId(null);
    } catch (err) {
      setSessionDeleteError(err.message || "Failed to delete session.");
    } finally {
      setSessionDeleting(false);
    }
  };

  const readResponseError = async (response, fallbackMessage) => {
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        if (typeof payload?.detail === "string") return payload.detail;
        if (payload?.detail) return JSON.stringify(payload.detail);
      }
    } catch {
      // Fall back to plain text.
    }
    try {
      const text = await response.text();
      return text || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  };

  const handleFetchOpenF1MeetingSessionsWeather = async () => {
    if (!eventId) return;
    setOpenF1MeetingFetchLoading(true);
    setOpenF1MeetingFetchError("");
    setOpenF1MeetingSyncStatus("");
    try {
      const response = await apiFetch(
        `/sessions/by-event/${eventId}/openf1/meeting-sessions-weather/fetch`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readResponseError(
            response,
            "Failed to fetch OpenF1 meeting sessions and weather."
          )
        );
      }
      const payload = await response.json();
      const syncedSessions = Array.isArray(payload?.local_sessions)
        ? payload.local_sessions
        : [];
      if (syncedSessions.length) {
        setSessions(syncedSessions);
        setEventSessions(syncedSessions);
      }
      const createdCount = payload?.meta?.created_session_ids?.length || 0;
      const updatedCount = payload?.meta?.updated_session_ids?.length || 0;
      const skippedCount = payload?.meta?.skipped_openf1_sessions?.length || 0;
      setOpenF1MeetingSyncStatus(
        `OpenF1 sync complete: ${updatedCount} updated, ${createdCount} created, ${skippedCount} skipped.`
      );
      clearApiCache(`/session-results/counts/by-event/${eventId}`);
      const countData = await apiGet(`/session-results/counts/by-event/${eventId}`);
      if (countData) {
        setSessionCounts(countData.by_session_type || {});
      }
    } catch (err) {
      setOpenF1MeetingFetchError(
        err.message || "Failed to fetch OpenF1 meeting sessions and weather."
      );
    } finally {
      setOpenF1MeetingFetchLoading(false);
    }
  };

  const handleFetchOpenF1SessionResults = async (sessionItem) => {
    if (!sessionItem?.id) return;
    setOpenF1SessionFetchLoadingId(sessionItem.id);
    setOpenF1SessionFetchError("");
    try {
      const response = await apiFetch(
        `/sessions/${sessionItem.id}/openf1/session-results/fetch`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readResponseError(response, "Failed to fetch OpenF1 session results.")
        );
      }
      const payload = await response.json();
      setOpenF1SessionPayload(payload);
      setIsOpenF1SessionModalOpen(true);
      clearApiCache(`/session-results/counts/by-event/${eventId}`);
      const countData = await apiGet(`/session-results/counts/by-event/${eventId}`);
      if (countData) {
        setSessionCounts(countData.by_session_type || {});
      }
    } catch (err) {
      setOpenF1SessionFetchError(
        err.message || "Failed to fetch OpenF1 session results."
      );
    } finally {
      setOpenF1SessionFetchLoadingId(null);
    }
  };

  const refreshFastestLaps = async () => {
    const data = await apiGet(
      `/session-results/fastest-laps/by-event/${eventId}`
    );
    setFastestLapResults(data);
  };

  const openFastestLapModal = (result) => {
    if (!canEdit) return;
    if (result) {
      setFastestLapEditingId(result.id);
      setFastestLapForm({
        entry_id: result.entry?.id ?? result.entry_id ?? "",
        laps: result.laps ?? "",
        time: result.time ?? "",
      });
    } else {
      setFastestLapEditingId(null);
      setFastestLapForm({ entry_id: "", laps: "", time: "" });
    }
    setFastestLapSaveError("");
    setIsFastestLapModalOpen(true);
  };

  const handleFastestLapChange = (event) => {
    const { name, value } = event.target;
    setFastestLapForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFastestLapSubmit = async (event) => {
    event.preventDefault();
    setFastestLapSaving(true);
    setFastestLapSaveError("");

    try {
      const entryId = fastestLapForm.entry_id ? Number(fastestLapForm.entry_id) : null;
      const laps = fastestLapForm.laps ? Number(fastestLapForm.laps) : null;
      const time = fastestLapForm.time || null;

      let response;
      if (fastestLapEditingId) {
        response = await apiFetch(
          `/session-results/fastest-laps/${fastestLapEditingId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entry_id: entryId, laps, time }),
          }
        );
      } else {
        response = await apiFetch("/session-results/fastest-laps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: Number(eventId), entry_id: entryId, laps, time }),
        });
      }

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save fastest lap.");
      }
      await refreshFastestLaps();
      setIsFastestLapModalOpen(false);
      setFastestLapEditingId(null);
    } catch (err) {
      setFastestLapSaveError(err.message || "Failed to save fastest lap.");
    } finally {
      setFastestLapSaving(false);
    }
  };

  const handleFastestLapDelete = async () => {
    if (!fastestLapEditingId) return;
    setFastestLapDeleting(true);
    setFastestLapDeleteError("");

    try {
      const response = await apiFetch(
        `/session-results/fastest-laps/${fastestLapEditingId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete fastest lap.");
      }
      await refreshFastestLaps();
      setIsFastestLapDeleteOpen(false);
      setIsFastestLapModalOpen(false);
      setFastestLapEditingId(null);
    } catch (err) {
      setFastestLapDeleteError(err.message || "Failed to delete fastest lap.");
    } finally {
      setFastestLapDeleting(false);
    }
  };

  const refreshDriverStandings = async () => {
    clearApiCache(`/standings/by-event/${eventId}`);
    clearApiCache(`/standings/count/by-event/${eventId}`);
    const [driverStandingData, constructorStandingData] = await Promise.all([
      apiGet(`/standings/by-event/${eventId}?standing_type=DRIVER`),
      apiGet(`/standings/by-event/${eventId}?standing_type=CONSTRUCTOR`),
    ]);
    setDriverStandings(
      driverStandingData
        .slice()
        .sort((a, b) => sortPosition(a.position) - sortPosition(b.position))
    );
    setConstructorStandings(
      constructorStandingData
        .slice()
        .sort((a, b) => sortPosition(a.position) - sortPosition(b.position))
    );
    setStandingsCount(driverStandingData.length);
    setStandingsLoaded(true);
  };

  const handleUpdateStandingsFromRace = async () => {
    if (!eventId) return;
    setStandingsUpdateLoading(true);
    setStandingsUpdateError("");
    setStandingsUpdateStatus("");
    try {
      const response = await apiFetch(
        `/standings/by-event/${eventId}/recalculate-driver-from-race`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readResponseError(
            response,
            "Failed to update standings from previous event and race points."
          )
        );
      }
      const payload = await response.json();
      await refreshDriverStandings();
      const updated = payload?.updated_count ?? 0;
      const created = payload?.created_count ?? 0;
      const total = payload?.total_count ?? 0;
      setStandingsUpdateStatus(
        `Standings updated: ${updated} updated, ${created} created (${total} total).`
      );
    } catch (err) {
      setStandingsUpdateError(
        err.message || "Failed to update standings from previous event and race points."
      );
    } finally {
      setStandingsUpdateLoading(false);
    }
  };

  const handleUpdateConstructorStandingsFromRace = async () => {
    if (!eventId) return;
    setStandingsUpdateLoading(true);
    setStandingsUpdateError("");
    setStandingsUpdateStatus("");
    try {
      const response = await apiFetch(
        `/standings/by-event/${eventId}/recalculate-constructor-from-race`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readResponseError(
            response,
            "Failed to update constructor standings from previous event and race points."
          )
        );
      }
      const payload = await response.json();
      await refreshDriverStandings();
      const updated = payload?.updated_count ?? 0;
      const created = payload?.created_count ?? 0;
      const total = payload?.total_count ?? 0;
      setStandingsUpdateStatus(
        `Constructor standings updated: ${updated} updated, ${created} created (${total} total).`
      );
    } catch (err) {
      setStandingsUpdateError(
        err.message ||
          "Failed to update constructor standings from previous event and race points."
      );
    } finally {
      setStandingsUpdateLoading(false);
    }
  };

  const handleEventFormChange = (eventTarget) => {
    const { name, value } = eventTarget.target;
    setEventForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleChampionshipChange = (eventTarget) => {
    const options = Array.from(eventTarget.target.selectedOptions || []);
    const ids = options
      .map((option) => Number(option.value))
      .filter((value) => !Number.isNaN(value));
    setEventForm((prev) => ({ ...prev, championship_ids: ids }));
  };

  const handleEventSave = async (eventTarget) => {
    eventTarget.preventDefault();
    if (!eventId) return;
    setEventSaving(true);
    setEventSaveError("");
    try {
      const payload = {
        event_name: eventForm.event_name || null,
        event_official_name: eventForm.event_official_name || null,
        event_date: eventForm.event_date || null,
        round: eventForm.round === "" ? null : Number(eventForm.round),
        circuit_id:
          eventForm.circuit_id === "" ? null : Number(eventForm.circuit_id),
        regulatory_system_id:
          eventForm.regulatory_system_id === ""
            ? null
            : Number(eventForm.regulatory_system_id),
        laps: eventForm.laps === "" ? null : Number(eventForm.laps),
        scheduled_laps:
          eventForm.scheduled_laps === ""
            ? null
            : Number(eventForm.scheduled_laps),
        distance: eventForm.distance || null,
        scheduled_distance: eventForm.scheduled_distance || null,
      };
      const response = await apiFetch(`/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update event.");
      }
      const updated = await response.json();
      const champResponse = await apiFetch(`/events/${eventId}/championships`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          championship_ids: eventForm.championship_ids || [],
        }),
      });
      if (!champResponse.ok) {
        const message = await champResponse.text();
        throw new Error(message || "Failed to update championships.");
      }
      clearApiCache(`/events/${eventId}`);
      const refreshed = await apiGet(`/events/${eventId}`);
      setEvent(refreshed || updated);
      setIsEventModalOpen(false);
    } catch (err) {
      setEventSaveError(err.message || "Failed to update event.");
    } finally {
      setEventSaving(false);
    }
  };

  return (
    <div className="page">
      <EventDetailHeader
        event={event}
        sessions={eventSessions}
        seasonYear={seasonParam}
        eventSlug={eventSlug}
        prevEvent={prevEvent}
        nextEvent={nextEvent}
        panel={
          <EventHighlights
            event={event}
            circuitVersions={circuitVersions}
            poleEntry={poleResult?.entry}
            raceWinnerEntry={raceWinnerResult?.entry}
            countryByCode={countryByCode}
            raceWeatherCode={
              eventSessions.find(
                (s) => String(s?.type || "").toUpperCase() === "RACE"
              )?.weather_code ?? null
            }
          />
        }
        tabs={tabs}
        activeTab={activeTab}
      >
      </EventDetailHeader>
      {tabs.length > 0 ? (
        <section className="section">
          <div className="detail-card event-tabs-card">
            <div className="event-tabs-row">
              {tabs.map((tab) => (
                <Link
                  key={tab.id}
                  className={`ghost link-pill event-tab-link${
                    activeTab === tab.id ? " is-active" : ""
                  }`}
                  to={tab.to}
                >
                  {tab.label}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}
      <section className="section">
        {loading ? (
          <div className="status-card">Loading event data…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <>
            <div className="tab-panel">
              {!activeTab && renderEmptyState("Select a tab to view results.")}
              {activeTab === "practice" && (
                <>
                  <div className="tabs">
                    {[
                      { id: "fp1", label: `Practice 1 (${fp1Results.length})` },
                      { id: "fp2", label: `Practice 2 (${fp2Results.length})` },
                      { id: "fp3", label: `Practice 3 (${fp3Results.length})` },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        className={`tab-button${
                          activePracticeTab === tab.id ? " is-active" : ""
                        }`}
                        onClick={() => setActivePracticeTab(tab.id)}
                        type="button"
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const practiceResults =
                      activePracticeTab === "fp2"
                        ? fp2Results
                        : activePracticeTab === "fp3"
                          ? fp3Results
                          : fp1Results;
                    const practiceSession = sessions.find(
                      (s) => s.type === activePracticeTab.toUpperCase()
                    );
                    if (!practiceLoaded) {
                      return renderEmptyState("Loading practice results…");
                    }
                    if (practiceSession?.is_cancelled) {
                      return renderEmptyState(
                        `Session cancelled: ${practiceSession.cancel_reason || "No reason provided"}`
                      );
                    }
                    return (
                      <>
                        {practiceResults.length === 0 ? (
                          renderEmptyState("No free practice results recorded yet.")
                        ) : (
                          <TableWrapper>
                            <DataTable>
                              <thead>
                                <tr>
                                  <th>Pos</th>
                                  <th>Driver</th>
                                  <th>Team</th>
                                  <th>Car</th>
                                  <th>Time</th>
                                  <th>Gap</th>
                                </tr>
                              </thead>
                              <tbody>
                                {practiceResults.map((result) => {
                                  const entry = result.entry;
                                  return (
                                    <tr key={result.id}>
                                      <td>{result.position ?? "—"}</td>
                                      <td>
                                        <DriverName
                                          driver={entry?.driver}
                                          countryByCode={countryByCode}
                                        />
                                      </td>
                                      <td>{formatTeam(entry?.team)}</td>
                                      <td>{formatCar(entry?.car)}</td>
                                      <td>{result.time ?? "—"}</td>
                                      <td>{result.gap ?? "—"}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </DataTable>
                          </TableWrapper>
                        )}
                        {canEdit ? (
                          <div className="tab-actions">
                            <button
                              type="button"
                              className="pill"
                              onClick={() => openSessionModal(null)}
                            >
                              Create session
                            </button>
                          </div>
                        ) : null}
                      </>
                    );
                  })()}
                </>
              )}

              {activeTab === "sessions" && (
                <>
                  {openF1MeetingFetchError ? (
                    <div className="status-card error">{openF1MeetingFetchError}</div>
                  ) : null}
                  {openF1MeetingSyncStatus ? (
                    <div className="status-card">{openF1MeetingSyncStatus}</div>
                  ) : null}
                  {openF1SessionFetchError ? (
                    <div className="status-card error">{openF1SessionFetchError}</div>
                  ) : null}
                  {sessionFetchStatus ? (
                    <div className="status-card">{sessionFetchStatus}</div>
                  ) : null}
                  {weatherGraphError ? (
                    <div className="status-card error">{weatherGraphError}</div>
                  ) : null}
                  {filteredSessions.length === 0 ? (
                    renderEmptyState("No sessions recorded for this event yet.")
                  ) : (
                    <TableWrapper>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Type</th>
                            <th>Start - End</th>
                            <th>Air Temp Min-Max (C)</th>
                            <th>Track Temp Min-Max (C)</th>
                            <th>Rainfall (mm)</th>
                            <th>Wind Min-Max (m/s)</th>
                            <th>Weather</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...filteredSessions]
                            .sort((a, b) => {
                              const aTime = a?.date_time_start
                                ? new Date(a.date_time_start).getTime()
                                : Number.POSITIVE_INFINITY;
                              const bTime = b?.date_time_start
                                ? new Date(b.date_time_start).getTime()
                                : Number.POSITIVE_INFINITY;
                              return aTime - bTime;
                            })
                            .map((sessionItem) => {
                            return (
                              <tr key={sessionItem.id} style={sessionItem.is_cancelled ? { opacity: 0.6 } : undefined}>
                                <td>
                                  {formatSessionLabel(sessionItem)}
                                  {sessionItem.is_cancelled && (
                                    <span style={{ marginLeft: "0.5em", color: "var(--color-danger, #e53935)", fontSize: "0.85em" }}>
                                      (Cancelled)
                                    </span>
                                  )}
                                </td>
                                <td>
                                  {formatSessionWindow(
                                    sessionItem.date_time_start,
                                    sessionItem.date_time_end,
                                    circuitTimezone
                                  )}
                                </td>
                                <td>
                                  {formatRange(
                                    sessionItem.air_temperature_min,
                                    sessionItem.air_temperature_max
                                  )}
                                </td>
                                <td>
                                  {formatRange(
                                    sessionItem.track_temperature_min,
                                    sessionItem.track_temperature_max
                                  )}
                                </td>
                                <td>{sessionItem.rainfall ?? "—"}</td>
                                <td>
                                  {formatRange(
                                    sessionItem.wind_speed_min,
                                    sessionItem.wind_speed_max
                                  )}
                                </td>
                                <td>
                                  <WeatherCodeCell value={sessionItem.weather_code} />
                                </td>
                                <td>
                                  <div className="modal-select-with-create">
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        className="ghost-button icon-action"
                                        aria-label="Update session"
                                        title="Update session"
                                        onClick={() => openSessionModal(sessionItem)}
                                      >
                                        {editIcon}
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className="ghost-button"
                                      onClick={() =>
                                        handleOpenWeatherGraph(sessionItem)
                                      }
                                      disabled={weatherGraphLoadingId === sessionItem.id}
                                    >
                                      {weatherGraphLoadingId === sessionItem.id
                                        ? "Loading…"
                                        : "Graph"}
                                    </button>
                                    {canEdit ? (
                                      <button
                                        type="button"
                                        className="ghost-button"
                                        onClick={() =>
                                          handleFetchOpenF1SessionResults(sessionItem)
                                        }
                                        disabled={openF1SessionFetchLoadingId === sessionItem.id}
                                      >
                                        {openF1SessionFetchLoadingId === sessionItem.id
                                          ? "Fetching…"
                                          : "OpenF1"}
                                      </button>
                                    ) : null}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </DataTable>
                    </TableWrapper>
                  )}
                  {canEdit ? (
                    <div className="tab-actions">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleFetchOpenF1MeetingSessionsWeather}
                        disabled={openF1MeetingFetchLoading}
                      >
                        {openF1MeetingFetchLoading
                          ? "Fetching OpenF1…"
                          : "Sync sessions from OpenF1"}
                      </button>
                      <button
                        type="button"
                        className="pill"
                        onClick={() => openSessionModal(null)}
                      >
                        Create session
                      </button>
                    </div>
                  ) : null}
                  <div className="table-footer">
                    Updated {formatUpdatedAt(latestSessionUpdatedAt)}
                  </div>
                </>
              )}

              {activeTab === "fastest-lap" &&
                (!fastestLapLoaded ? (
                  renderEmptyState("Loading fastest laps…")
                ) : (
                  <>
                    {fastestLapResults.length === 0 ? (
                      renderEmptyState("No fastest laps recorded yet.")
                    ) : (
                      <TableWrapper>
                        <DataTable>
                          <thead>
                            <tr>
                              <th>Driver</th>
                              <th>Team</th>
                              <th>Car</th>
                              <th>Lap</th>
                              <th>Time</th>
                              {canEdit ? <th>Action</th> : null}
                            </tr>
                          </thead>
                          <tbody>
                            {fastestLapResults.map((result) => {
                              const entry = result.entry;
                              return (
                                <tr key={result.id}>
                                  <td>
                                    <DriverName
                                      driver={entry?.driver}
                                      countryByCode={countryByCode}
                                    />
                                  </td>
                                  <td>{formatTeam(entry?.team)}</td>
                                  <td>{formatCar(entry?.car)}</td>
                                  <td>{result.laps ?? "—"}</td>
                                  <td>{result.time ?? "—"}</td>
                                  {canEdit ? (
                                    <td>
                                      <button
                                        type="button"
                                        className="ghost-button icon-action"
                                        aria-label="Update fastest lap"
                                        title="Update fastest lap"
                                        onClick={() => openFastestLapModal(result)}
                                      >
                                        {editIcon}
                                      </button>
                                    </td>
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </DataTable>
                      </TableWrapper>
                    )}
                    {canEdit ? (
                      <div className="tab-actions">
                        <button
                          type="button"
                          className="pill"
                          onClick={() => openFastestLapModal(null)}
                        >
                          Create fastest lap
                        </button>
                      </div>
                    ) : null}
                  </>
                ))}

              {activeTab === "standings" &&
                (!standingsLoaded ? (
                  renderEmptyState("Loading driver standings…")
                ) : driverStandings.length === 0 &&
                  constructorStandings.length === 0 ? (
                  <>
                    {standingsUpdateError ? (
                      <div className="status-card error">{standingsUpdateError}</div>
                    ) : null}
                    {standingsUpdateStatus ? (
                      <div className="status-card">{standingsUpdateStatus}</div>
                    ) : null}
                    {renderEmptyState("No driver standings recorded yet.")}
                    {canEdit ? (
                      <div className="tab-actions">
                        <button
                          type="button"
                          className="pill"
                          onClick={handleUpdateStandingsFromRace}
                          disabled={standingsUpdateLoading}
                        >
                          {standingsUpdateLoading
                            ? "Updating…"
                            : "Update standings from race"}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div className="tabs">
                      <button
                        type="button"
                        className={`tab-button${activeStandingSection === "driver" ? " is-active" : ""}`}
                        onClick={() => setActiveStandingSection("driver")}
                      >
                        Driver standings ({driverStandings.length})
                      </button>
                      <button
                        type="button"
                        className={`tab-button${activeStandingSection === "constructor" ? " is-active" : ""}`}
                        onClick={() => setActiveStandingSection("constructor")}
                      >
                        Constructor standings ({constructorStandings.length})
                      </button>
                    </div>
                    {standingsUpdateError ? (
                      <div className="status-card error">{standingsUpdateError}</div>
                    ) : null}
                    {standingsUpdateStatus ? (
                      <div className="status-card">{standingsUpdateStatus}</div>
                    ) : null}
                    {activeStandingSection === "driver" ? (
                      driverStandings.length === 0 ? (
                        <div className="status-card">No driver standings recorded yet.</div>
                      ) : (
                        <TableWrapper>
                          <DataTable>
                            <thead>
                              <tr>
                                <th>Pos</th>
                                <th>Driver</th>
                                <th>Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {driverStandings.map((standing) => (
                                <tr key={standing.id}>
                                  <td>{standing.position ?? "—"}</td>
                                  <td>
                                    <DriverName
                                      driver={standing.driver}
                                      countryByCode={countryByCode}
                                    />
                                  </td>
                                  <td>{standing.points ?? "—"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </DataTable>
                        </TableWrapper>
                      )
                    ) : constructorStandings.length === 0 ? (
                      <div className="status-card">No constructor standings recorded yet.</div>
                    ) : (
                      <TableWrapper>
                        <DataTable>
                          <thead>
                            <tr>
                              <th>Pos</th>
                              <th>Constructor</th>
                              <th>Points</th>
                            </tr>
                          </thead>
                          <tbody>
                            {constructorStandings.map((standing) => (
                              <tr key={standing.id}>
                                <td>{standing.position ?? "—"}</td>
                                <td>
                                  {standing.constructor?.name ||
                                    standing.constructor?.short_name ||
                                    "—"}
                                </td>
                                <td>{standing.points ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </DataTable>
                      </TableWrapper>
                    )}
                    {canEdit ? (
                      <div className="tab-actions">
                        <button
                          type="button"
                          className="pill"
                          onClick={
                            activeStandingSection === "driver"
                              ? handleUpdateStandingsFromRace
                              : handleUpdateConstructorStandingsFromRace
                          }
                          disabled={standingsUpdateLoading}
                        >
                          {standingsUpdateLoading
                            ? "Updating…"
                            : activeStandingSection === "driver"
                            ? "Update driver standings from race"
                            : "Update constructor standings from race"}
                        </button>
                        <button
                          type="button"
                          className="pill"
                          onClick={() => openSessionModal(null)}
                        >
                          Create session
                        </button>
                      </div>
                    ) : null}
                  </>
                ))}
            </div>
          </>
        )}
      </section>
      {canEdit && isFastestLapModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{fastestLapEditingId ? "Update fastest lap" : "Create fastest lap"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsFastestLapModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleFastestLapSubmit}>
              <div className="form-grid">
                <label className="form-span">
                  Entry
                  <select
                    name="entry_id"
                    value={fastestLapForm.entry_id}
                    onChange={handleFastestLapChange}
                  >
                    <option value="">Select entry</option>
                    {entries.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {formatEntryOption(entry)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Lap
                  <input
                    type="number"
                    name="laps"
                    value={fastestLapForm.laps}
                    onChange={handleFastestLapChange}
                  />
                </label>
                <label>
                  Time
                  <input
                    name="time"
                    value={fastestLapForm.time}
                    onChange={handleFastestLapChange}
                  />
                </label>
              </div>
              {fastestLapSaveError && (
                <div className="status-card error">{fastestLapSaveError}</div>
              )}
              <div className="modal-actions">
                {fastestLapEditingId ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setFastestLapDeleteError("");
                      setIsFastestLapDeleteOpen(true);
                    }}
                  >
                    Delete fastest lap
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsFastestLapModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pill"
                  disabled={fastestLapSaving}
                >
                  {fastestLapSaving ? "Saving…" : fastestLapEditingId ? "Save changes" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canEdit && isOpenF1SessionModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>OpenF1 session results</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsOpenF1SessionModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-form">
              <pre
                style={{
                  maxHeight: "60vh",
                  overflow: "auto",
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(openF1SessionPayload, null, 2)}
              </pre>
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsOpenF1SessionModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isWeatherGraphModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{weatherGraphSessionLabel || "Session"} weather graph</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsWeatherGraphModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-form">
              {weatherGraphSeries.length === 0 ? (
                <div className="status-card">No weather samples available.</div>
              ) : (
                <div style={{ width: "100%", height: 360 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weatherGraphSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="timeMs"
                        type="number"
                        scale="time"
                        domain={["dataMin", "dataMax"]}
                        ticks={weatherGraphSeries
                          .map((d) => d.timeMs)
                          .filter((ms) => {
                            if (!ms) return false;
                            const m = new Date(ms).getMinutes();
                            return m === 0 || m === 30;
                          })}
                        tickFormatter={(ms) => {
                          const d = new Date(ms);
                          return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                        }}
                      />
                      <YAxis yAxisId="left" />
                      <YAxis yAxisId="right" orientation="right" />
                      <Tooltip />
                      <Legend />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="air_temperature"
                        name="Air temp (C)"
                        stroke="#f97316"
                        dot={false}
                      />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="track_temperature"
                        name="Track temp (C)"
                        stroke="#2563eb"
                        dot={false}
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="rainfall"
                        name="Rainfall (mm)"
                        stroke="#16a34a"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsWeatherGraphModalOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {canEdit && isSessionModalOpen && (
        <div className="modal-backdrop">
            <div className="modal-card">
            <div className="modal-header">
              <h3>{sessionEditingId ? "Update session" : "Create session"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsSessionModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSessionSave}>
              <div className="form-grid">
                <label>
                  Session type
                  <select
                    name="type"
                    value={sessionForm.type}
                    onChange={handleSessionFormChange}
                    required
                  >
                    <option value="">Select type</option>
                    <option value="FP1">Practice 1</option>
                    <option value="FP2">Practice 2</option>
                    <option value="FP3">Practice 3</option>
                    <option value="QUALI">Qualifying</option>
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q3">Q3</option>
                    <option value="SQ">Sprint Qualifying</option>
                    <option value="SQ1">SQ1</option>
                    <option value="SQ2">SQ2</option>
                    <option value="SQ3">SQ3</option>
                    <option value="SR">Sprint</option>
                    <option value="RACE">Race</option>
                  </select>
                </label>
                {circuitTimezone && (
                  <div className="time-mode-toggle" style={{ gridColumn: "1 / -1" }}>
                    <button
                      type="button"
                      className={`time-mode-btn${sessionTimeMode === "local" ? " is-active" : ""}`}
                      onClick={() => handleSessionTimeModeChange("local")}
                    >
                      Local ({circuitTimezone})
                    </button>
                    <button
                      type="button"
                      className={`time-mode-btn${sessionTimeMode === "gmt" ? " is-active" : ""}`}
                      onClick={() => handleSessionTimeModeChange("gmt")}
                    >
                      GMT
                    </button>
                  </div>
                )}
                <label>
                  Start date/time{circuitTimezone ? ` (${sessionTimeMode === "local" ? "local" : "GMT"})` : ""}
                  <input
                    type="datetime-local"
                    name="date_time_start"
                    value={sessionForm.date_time_start}
                    onChange={handleSessionFormChange}
                    required
                  />
                </label>
                <label>
                  End date/time{circuitTimezone ? ` (${sessionTimeMode === "local" ? "local" : "GMT"})` : ""}
                  <input
                    type="datetime-local"
                    name="date_time_end"
                    value={sessionForm.date_time_end}
                    onChange={handleSessionFormChange}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    name="is_cancelled"
                    checked={sessionForm.is_cancelled}
                    onChange={handleSessionFormChange}
                  />
                  Session cancelled
                </label>
                {sessionForm.is_cancelled && (
                  <label>
                    Cancel reason
                    <input
                      type="text"
                      name="cancel_reason"
                      value={sessionForm.cancel_reason}
                      onChange={handleSessionFormChange}
                      placeholder="e.g. Weather conditions, safety concerns…"
                    />
                  </label>
                )}
              </div>
              {sessionSaveError && (
                <div className="status-card error">{sessionSaveError}</div>
              )}
              {sessionFetchError && (
                <div className="status-card error">{sessionFetchError}</div>
              )}
              {sessionFetchStatus && (
                <div className="status-card">{sessionFetchStatus}</div>
              )}
              {omFetchError && (
                <div className="status-card error">{omFetchError}</div>
              )}
              {omFetchStatus && (
                <div className="status-card">{omFetchStatus}</div>
              )}
              {sessionDeleteError && (
                <div className="status-card error">{sessionDeleteError}</div>
              )}
              <div className="modal-actions">
                {sessionEditingId ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setSessionDeleteError("");
                      setIsSessionDeleteOpen(true);
                    }}
                    disabled={sessionDeleting}
                  >
                    {sessionDeleting ? "Deleting…" : "Delete session"}
                  </button>
                ) : null}
                {sessionEditingId ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => handleSessionFetchWeather(null)}
                    disabled={sessionFetchLoading}
                  >
                    {sessionFetchLoading
                      ? "Fetching…"
                      : "Fetch OpenF1 weather to session_weather"}
                  </button>
                ) : null}
                {sessionEditingId ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={handleOpenMeteoFetchWeather}
                    disabled={omFetchLoading}
                  >
                    {omFetchLoading ? "Fetching…" : "Fetch Open-Meteo weather"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsSessionModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pill"
                  disabled={sessionSaving}
                >
                  {sessionSaving
                    ? "Saving…"
                    : sessionEditingId
                    ? "Save changes"
                    : "Create session"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canEdit && isEventModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update event</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsEventModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleEventSave}>
              <div className="form-grid">
                <label className="form-span">
                  Event name
                  <input
                    name="event_name"
                    value={eventForm.event_name}
                    onChange={handleEventFormChange}
                  />
                </label>
                <label className="form-span">
                  Official name
                  <input
                    name="event_official_name"
                    value={eventForm.event_official_name}
                    onChange={handleEventFormChange}
                  />
                </label>
                <label>
                  Event date
                  <input
                    type="date"
                    name="event_date"
                    value={eventForm.event_date}
                    onChange={handleEventFormChange}
                  />
                </label>
                <label>
                  Round
                  <input
                    type="number"
                    name="round"
                    value={eventForm.round}
                    onChange={handleEventFormChange}
                  />
                </label>
                <label className="form-span">
                  Circuit
                  <select
                    name="circuit_id"
                    value={eventForm.circuit_id}
                    onChange={handleEventFormChange}
                  >
                    <option value="">
                      {circuitsLoading ? "Loading circuits…" : "Select circuit"}
                    </option>
                    {circuits.map((circuit) => (
                      <option key={circuit.id} value={circuit.id}>
                        {circuit.name || circuit.short_name || `Circuit ${circuit.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-span">
                  Regulatory system
                  <select
                    name="regulatory_system_id"
                    value={eventForm.regulatory_system_id}
                    onChange={handleEventFormChange}
                  >
                    <option value="">
                      {circuitsLoading
                        ? "Loading regulatory systems…"
                        : "Select regulatory system"}
                    </option>
                    {regSystems.map((system) => (
                      <option key={system.id} value={system.id}>
                        {system.short_name ||
                          system.name ||
                          `Regulatory system ${system.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-span">
                  Championships
                  <select
                    multiple
                    name="championship_ids"
                    value={eventForm.championship_ids.map(String)}
                    onChange={handleChampionshipChange}
                  >
                    {championships.length === 0 ? (
                      <option value="">
                        {circuitsLoading
                          ? "Loading championships…"
                          : "No championships available"}
                      </option>
                    ) : (
                      championships.map((championship) => (
                        <option key={championship.id} value={championship.id}>
                          {championship.short_name ||
                            championship.championship_name ||
                            `Championship ${championship.id}`}
                        </option>
                      ))
                    )}
                  </select>
                </label>
                <label>
                  Laps
                  <input
                    type="number"
                    name="laps"
                    value={eventForm.laps}
                    onChange={handleEventFormChange}
                  />
                </label>
                <label>
                  Scheduled laps
                  <input
                    type="number"
                    name="scheduled_laps"
                    value={eventForm.scheduled_laps}
                    onChange={handleEventFormChange}
                  />
                </label>
                <label>
                  Distance (km)
                  <input
                    name="distance"
                    value={eventForm.distance}
                    onChange={handleEventFormChange}
                  />
                </label>
                <label>
                  Scheduled distance (km)
                  <input
                    name="scheduled_distance"
                    value={eventForm.scheduled_distance}
                    onChange={handleEventFormChange}
                  />
                </label>
              </div>
              {eventSaveError && (
                <div className="status-card error">{eventSaveError}</div>
              )}
              {circuitsError && (
                <div className="status-card error">{circuitsError}</div>
              )}
              {regSystemsError && (
                <div className="status-card error">{regSystemsError}</div>
              )}
              {championshipsError && (
                <div className="status-card error">{championshipsError}</div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsEventModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={eventSaving}>
                  {eventSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canEdit ? (
        <ConfirmModal
          isOpen={isSessionDeleteOpen}
          title="Delete session?"
          message="This will permanently remove the session record and cannot be undone."
          confirmLabel="Delete session"
          onConfirm={handleSessionDelete}
          onCancel={() => setIsSessionDeleteOpen(false)}
          isLoading={sessionDeleting}
          error={sessionDeleteError}
        />
      ) : null}

      {canEdit ? (
        <ConfirmModal
          isOpen={isFastestLapDeleteOpen}
          title="Delete fastest lap?"
          message="This will permanently remove the fastest lap record and cannot be undone."
          confirmLabel="Delete fastest lap"
          onConfirm={handleFastestLapDelete}
          onCancel={() => setIsFastestLapDeleteOpen(false)}
          isLoading={fastestLapDeleting}
          error={fastestLapDeleteError}
        />
      ) : null}
    </div>
  );
}
