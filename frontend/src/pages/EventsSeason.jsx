import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet } from "../lib/api.js";
import { apiFetch } from "../lib/api.js";
import { isAuthenticated, onAuthChanged } from "../lib/auth.js";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import useCountries from "../hooks/useCountries.js";

const parseEventDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const [datePart] = value.split("T");
    const [year, month, day] = datePart.split("-").map(Number);
    if (year && month && day) {
      return new Date(year, month - 1, day);
    }
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const formatDate = (value) => {
  const date = parseEventDate(value);
  if (!date) return "TBD";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

async function findSeasonByYear(year) {
  let offset = 0;
  const limit = 100;
  while (true) {
    const seasons = await apiGet(`/seasons?limit=${limit}&offset=${offset}`);
    const found = seasons.find((item) => item.year === year);
    if (found || seasons.length < limit) {
      return found || null;
    }
    offset += limit;
  }
}

export default function EventsSeason() {
  const { seasonYear } = useParams();
  const navigate = useNavigate();
  const yearValue = Number(seasonYear);
  const prevSeasonYear = Number.isNaN(yearValue) ? null : yearValue - 1;
  const nextSeasonYear = Number.isNaN(yearValue) ? null : yearValue + 1;
  const [events, setEvents] = useState([]);
  const [season, setSeason] = useState(null);
  const [sprintEventIds, setSprintEventIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("events");
  const { countryByCode, countryByName } = useCountries();
  const [standings, setStandings] = useState([]);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [standingsError, setStandingsError] = useState("");
  const [calculatedStandings, setCalculatedStandings] = useState([]);
  const [driverRoundResults, setDriverRoundResults] = useState([]);
  const [driverRoundResultsLoading, setDriverRoundResultsLoading] = useState(false);
  const [driverRoundResultsError, setDriverRoundResultsError] = useState("");
  const [constructorStandings, setConstructorStandings] = useState([]);
  const [constructorStandingsLoading, setConstructorStandingsLoading] = useState(false);
  const [constructorStandingsError, setConstructorStandingsError] = useState("");
  const [seasonStats, setSeasonStats] = useState(null);
  const [seasonStatsLoading, setSeasonStatsLoading] = useState(false);
  const [driverChampion, setDriverChampion] = useState(null);
  const [driverChampionConstructor, setDriverChampionConstructor] = useState("");
  const [constructorChampion, setConstructorChampion] = useState(null);
  const [entriesOverviewData, setEntriesOverviewData] = useState([]);
  const [entriesOverviewLoading, setEntriesOverviewLoading] = useState(false);
  const [entriesOverviewError, setEntriesOverviewError] = useState("");
  const [seasonEntriesByEvent, setSeasonEntriesByEvent] = useState([]);
  const [seasonEntriesLoading, setSeasonEntriesLoading] = useState(false);
  const [seasonEntriesError, setSeasonEntriesError] = useState("");
  const [openRoundsGroupKey, setOpenRoundsGroupKey] = useState(null);
  const [canEdit, setCanEdit] = useState(isAuthenticated());
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [eventForm, setEventForm] = useState({
    event_name: "",
    event_official_name: "",
    event_date: "",
    round: "",
    circuit_id: "",
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

  useEffect(() => {
    return onAuthChanged(() => {
      setCanEdit(isAuthenticated());
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const target = await findSeasonByYear(yearValue);
        if (!target) {
          throw new Error(`Season ${seasonYear} not found.`);
        }
        const seasonEvents = await apiGet(`/events/by-season/${target.id}`);
        if (isActive) {
          setSeason(target);
          setEvents(seasonEvents);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load events.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    if (!Number.isNaN(yearValue)) {
      load();
    } else {
      setError("Invalid season year.");
      setLoading(false);
    }

    return () => {
      isActive = false;
    };
  }, [seasonYear, yearValue]);

  useEffect(() => {
    setActiveTab("events");
    setStandings([]);
    setStandingsError("");
    setStandingsLoading(false);
    setCalculatedStandings([]);
    setDriverRoundResults([]);
    setDriverRoundResultsLoading(false);
    setDriverRoundResultsError("");
    setConstructorStandings([]);
    setConstructorStandingsError("");
    setConstructorStandingsLoading(false);
    setSprintEventIds(new Set());
    setSeasonStats(null);
    setSeasonStatsLoading(false);
    setDriverChampion(null);
    setDriverChampionConstructor("");
    setConstructorChampion(null);
    setEntriesOverviewData([]);
    setEntriesOverviewLoading(false);
    setEntriesOverviewError("");
    setSeasonEntriesByEvent([]);
    setSeasonEntriesLoading(false);
    setSeasonEntriesError("");
    setOpenRoundsGroupKey(null);
  }, [season?.id]);

  useEffect(() => {
    if (activeTab !== "entries_overview") {
      setOpenRoundsGroupKey(null);
    }
  }, [activeTab]);

  useEffect(() => {
    let isActive = true;

    async function loadSprintFlags() {
      if (!events.length) return;
      try {
        const sessionSets = await Promise.all(
          events.map((event) => apiGet(`/sessions/by-event/${event.id}`))
        );
        const sprintIds = new Set();
        sessionSets.forEach((sessions, index) => {
          const hasSprint = sessions.some(
            (session) => String(session.type || "").toUpperCase() === "SR"
          );
          if (hasSprint) {
            sprintIds.add(events[index].id);
          }
        });
        if (isActive) {
          setSprintEventIds(sprintIds);
        }
      } catch (err) {
        if (isActive) {
          setSprintEventIds(new Set());
        }
      }
    }

    loadSprintFlags();
    return () => {
      isActive = false;
    };
  }, [events]);

  useEffect(() => {
    let isActive = true;

    async function loadChampions() {
      if (!season?.id) return;
      try {
        const [driverData, constructorData] = await Promise.all([
          apiGet(`/standings/by-season/${season.id}`),
          apiGet(
            `/standings/by-season/${season.id}?standing_type=CONSTRUCTOR`
          ),
        ]);
        if (!isActive) return;
        const resolveChampion = (items) =>
          items.find((standing) => String(standing.position) === "1") || null;
        setDriverChampion(resolveChampion(driverData || []));
        setConstructorChampion(resolveChampion(constructorData || []));
      } catch (err) {
        if (isActive) {
          setDriverChampion(null);
          setConstructorChampion(null);
        }
      }
    }

    loadChampions();
    return () => {
      isActive = false;
    };
  }, [season?.id]);

  useEffect(() => {
    let isActive = true;

    async function loadSeasonStats() {
      if (!season?.id) return;
      try {
        setSeasonStatsLoading(true);
        const stats = await apiGet(`/seasons/${season.id}/stats`);
        if (!isActive) return;
        setSeasonStats(stats || null);
      } catch {
        if (isActive) {
          setSeasonStats(null);
        }
      } finally {
        if (isActive) {
          setSeasonStatsLoading(false);
        }
      }
    }

    loadSeasonStats();
    return () => {
      isActive = false;
    };
  }, [season?.id]);

  const formatConstructor = (constructor) => {
    if (!constructor) return "—";
    return constructor.name || constructor.short_name || "—";
  };

  useEffect(() => {
    let isActive = true;

    async function resolveDriverChampionConstructor() {
      if (!driverChampion?.driver?.id) {
        if (isActive) setDriverChampionConstructor("");
        return;
      }

      const standingConstructorLabel = formatConstructor(driverChampion.constructor);
      if (standingConstructorLabel !== "—") {
        if (isActive) setDriverChampionConstructor(standingConstructorLabel);
        return;
      }

      if (!events.length) {
        if (isActive) setDriverChampionConstructor("");
        return;
      }

      const sortedEvents = events
        .slice()
        .sort((a, b) => {
          const aRound = a?.round ?? -1;
          const bRound = b?.round ?? -1;
          if (aRound !== bRound) return bRound - aRound;
          const aDate = parseEventDate(a?.event_date)?.getTime() ?? 0;
          const bDate = parseEventDate(b?.event_date)?.getTime() ?? 0;
          return bDate - aDate;
        });

      for (const event of sortedEvents) {
        try {
          const entries = await apiGet(`/event-entries/by-event/${event.id}`);
          if (!isActive) return;
          const championEntry = entries.find(
            (entry) => entry?.driver?.id === driverChampion.driver.id
          );
          if (!championEntry) continue;

          const carConstructorLabel = formatConstructor(
            championEntry?.car?.constructor
          );
          if (carConstructorLabel !== "—") {
            setDriverChampionConstructor(carConstructorLabel);
            return;
          }
        } catch {
          // Try prior rounds if one event entries request fails.
        }
      }

      if (isActive) {
        setDriverChampionConstructor("");
      }
    }

    resolveDriverChampionConstructor();
    return () => {
      isActive = false;
    };
  }, [driverChampion, events]);

  const loadStandings = async () => {
    if (!season?.id) return;
    setStandingsLoading(true);
    setStandingsError("");
    try {
      const [data, calculated] = await Promise.all([
        apiGet(`/standings/by-season/${season.id}`),
        apiGet(
          `/standings/calculated/by-season/${season.id}?point_scoring_system=standard`
        ),
      ]);
      setStandings(
        data
          .slice()
          .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
      );
      setCalculatedStandings(calculated);
    } catch (err) {
      setStandingsError(err.message || "Failed to load driver standings.");
    } finally {
      setStandingsLoading(false);
    }
  };

  const calculatedByDriver = useMemo(() => {
    const map = new Map();
    calculatedStandings.forEach((standing) => {
      if (standing.driver?.id) {
        map.set(standing.driver.id, standing);
      }
    });
    return map;
  }, [calculatedStandings]);

  const driverResultsByEvent = useMemo(() => {
    const byEvent = new Map();
    driverRoundResults.forEach((eventResults) => {
      const raceByDriver = new Map();
      const sprintByDriver = new Map();
      (Array.isArray(eventResults?.raceResults) ? eventResults.raceResults : []).forEach(
        (item) => {
          if (!item?.driverId || raceByDriver.has(item.driverId)) return;
          raceByDriver.set(item.driverId, item);
        }
      );
      (
        Array.isArray(eventResults?.sprintResults)
          ? eventResults.sprintResults
          : []
      ).forEach((item) => {
        if (!item?.driverId || sprintByDriver.has(item.driverId)) return;
        sprintByDriver.set(item.driverId, item);
      });
      byEvent.set(eventResults.eventId, {
        raceByDriver,
        sprintByDriver,
      });
    });
    return byEvent;
  }, [driverRoundResults]);

  const loadConstructorStandings = async () => {
    if (!season?.id) return;
    setConstructorStandingsLoading(true);
    setConstructorStandingsError("");
    try {
      const data = await apiGet(
        `/standings/by-season/${season.id}?standing_type=CONSTRUCTOR`
      );
      setConstructorStandings(
        data
          .slice()
          .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
      );
    } catch (err) {
      setConstructorStandingsError(
        err.message || "Failed to load constructor standings."
      );
    } finally {
      setConstructorStandingsLoading(false);
    }
  };

  const loadDriverRoundResults = async () => {
    if (!season?.id || !sortedSeasonEvents.length) return;
    setDriverRoundResultsLoading(true);
    setDriverRoundResultsError("");
    try {
      const byEvent = await Promise.all(
        sortedSeasonEvents.map(async (eventItem) => {
          const [raceResults, sprintResults] = await Promise.all([
            apiGet(`/session-results/by-event/${eventItem.id}?session_type=RACE`),
            apiGet(`/session-results/by-event/${eventItem.id}?session_type=SR`),
          ]);
          const mapResults = (items) =>
            (Array.isArray(items) ? items : []).map((result) => ({
              driverId: result?.entry?.driver?.id ?? null,
              position: result?.position ?? null,
              points: result?.points ?? null,
            }));
          return {
            eventId: eventItem.id,
            raceResults: mapResults(raceResults),
            sprintResults: mapResults(sprintResults),
          };
        })
      );
      setDriverRoundResults(byEvent);
    } catch (err) {
      setDriverRoundResults([]);
      setDriverRoundResultsError(err.message || "Failed to load race results.");
    } finally {
      setDriverRoundResultsLoading(false);
    }
  };

  const sortedSeasonEvents = useMemo(() => {
    return events.slice().sort((a, b) => {
      const aDate = parseEventDate(a?.event_date)?.getTime() ?? 0;
      const bDate = parseEventDate(b?.event_date)?.getTime() ?? 0;
      return aDate - bDate;
    });
  }, [events]);

  const loadEntriesOverview = async () => {
    if (!season?.id) return;
    setEntriesOverviewLoading(true);
    setEntriesOverviewError("");
    try {
      const data = await apiGet(`/seasons/${season.id}/entries-overview`);
      setEntriesOverviewData(Array.isArray(data) ? data : []);
    } catch (err) {
      setEntriesOverviewData([]);
      setEntriesOverviewError(
        err.message || "Failed to load entries overview."
      );
    } finally {
      setEntriesOverviewLoading(false);
    }
  };

  const loadSeasonEntries = async () => {
    if (!season?.id || !sortedSeasonEvents.length) return;
    setSeasonEntriesLoading(true);
    setSeasonEntriesError("");
    try {
      const byEvent = await Promise.all(
        sortedSeasonEvents.map(async (eventItem) => {
          const entryData = await apiGet(`/event-entries/by-event/${eventItem.id}`);
          return {
            event: eventItem,
            entries: Array.isArray(entryData) ? entryData : [],
          };
        })
      );
      setSeasonEntriesByEvent(byEvent);
    } catch (err) {
      setSeasonEntriesByEvent([]);
      setSeasonEntriesError(err.message || "Failed to load season entries.");
    } finally {
      setSeasonEntriesLoading(false);
    }
  };

  const handleSeasonTabChange = (tabId) => {
    setActiveTab(tabId);
    if (
      (tabId === "driver_championship" || tabId === "events") &&
      season?.id &&
      standings.length === 0 &&
      !standingsLoading
    ) {
      loadStandings();
    }
    if (
      (tabId === "driver_championship" || tabId === "events") &&
      season?.id &&
      sortedSeasonEvents.length > 0 &&
      driverRoundResults.length === 0 &&
      !driverRoundResultsLoading
    ) {
      loadDriverRoundResults();
    }
    if (
      (tabId === "constructor_championship" || tabId === "events") &&
      season?.id &&
      constructorStandings.length === 0 &&
      !constructorStandingsLoading
    ) {
      loadConstructorStandings();
    }
    if (
      tabId === "entries_overview" &&
      season?.id &&
      entriesOverviewData.length === 0 &&
      !entriesOverviewLoading
    ) {
      loadEntriesOverview();
    }
    if (
      tabId === "season_change_log" &&
      season?.id &&
      sortedSeasonEvents.length > 0 &&
      seasonEntriesByEvent.length === 0 &&
      !seasonEntriesLoading
    ) {
      loadSeasonEntries();
    }
  };

  useEffect(() => {
    if (
      (activeTab === "driver_championship" || activeTab === "events") &&
      season?.id &&
      sortedSeasonEvents.length > 0 &&
      driverRoundResults.length === 0 &&
      !driverRoundResultsLoading &&
      !driverRoundResultsError
    ) {
      loadDriverRoundResults();
    }
    if (
      (activeTab === "driver_championship" || activeTab === "events") &&
      season?.id &&
      standings.length === 0 &&
      !standingsLoading
    ) {
      loadStandings();
    }
    if (
      (activeTab === "constructor_championship" || activeTab === "events") &&
      season?.id &&
      constructorStandings.length === 0 &&
      !constructorStandingsLoading
    ) {
      loadConstructorStandings();
    }
    if (
      activeTab === "entries_overview" &&
      season?.id &&
      entriesOverviewData.length === 0 &&
      !entriesOverviewLoading
    ) {
      loadEntriesOverview();
    }
    if (
      activeTab === "season_change_log" &&
      season?.id &&
      sortedSeasonEvents.length > 0 &&
      seasonEntriesByEvent.length === 0 &&
      !seasonEntriesLoading
    ) {
      loadSeasonEntries();
    }
  }, [
    activeTab,
    season?.id,
    sortedSeasonEvents,
    driverRoundResults.length,
    driverRoundResultsLoading,
    driverRoundResultsError,
    standings.length,
    standingsLoading,
    constructorStandings.length,
    constructorStandingsLoading,
    entriesOverviewData.length,
    entriesOverviewLoading,
    seasonEntriesByEvent.length,
    seasonEntriesLoading,
  ]);

  const getPositionNumber = (value) => {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) return null;
    return Number.parseInt(normalized, 10);
  };

  const getDriverRoundCellClassName = (result) => {
    if (!result) return "";
    const numericPosition = getPositionNumber(result.position);
    if (numericPosition === 1) return "season-result-p1";
    if (numericPosition === 2) return "season-result-p2";
    if (numericPosition === 3) return "season-result-p3";
    const pointsValue = Number(result.points ?? 0);
    if (Number.isFinite(pointsValue) && pointsValue > 0) return "season-result-points";
    if (result.position !== null && result.position !== undefined) {
      return "season-result-no-points";
    }
    return "";
  };

  const championshipRoundColumns = useMemo(() => {
    return sortedSeasonEvents.flatMap((eventItem) => {
      const columns = [];
      const eventResults = driverResultsByEvent.get(eventItem.id);
      const hasSprintResults = Boolean(
        eventResults?.sprintByDriver && eventResults.sprintByDriver.size > 0
      );
      if (hasSprintResults) {
        columns.push({
          key: `event-${eventItem.id}-sprint`,
          eventId: eventItem.id,
          eventSlug: eventItem.slug,
          round: eventItem.round,
          sessionKind: "sprint",
          label: `S${eventItem.round ?? "—"}`,
          title: `Sprint Round ${eventItem.round ?? "—"}`,
        });
      }
      columns.push({
        key: `event-${eventItem.id}-race`,
        eventId: eventItem.id,
        round: eventItem.round,
        sessionKind: "race",
        label: `R${eventItem.round ?? "—"}`,
        title: `Race Round ${eventItem.round ?? "—"}`,
      });
      return columns;
    });
  }, [driverResultsByEvent, sortedSeasonEvents]);

  const renderCircuitInfo = (event) => {
    if (!event?.circuit) return "Circuit TBD";
    const { name, country } = event.circuit;
    const key = country ? String(country).toLowerCase() : "";
    const resolved =
      key && (countryByCode.get(key) || countryByName.get(key));
    const alpha2 = resolved?.alpha2_code
      ? resolved.alpha2_code.toLowerCase()
      : null;
    const countryLabel = resolved?.name || country;
    return (
      <span>
        <span className="table-driver">
          {alpha2 ? (
            <img
              className="flag-icon"
              src={`https://flagcdn.com/24x18/${alpha2}.png`}
              alt={countryLabel ? `${countryLabel} flag` : "Country flag"}
              loading="lazy"
            />
          ) : null}
          <span>{name}</span>
        </span>
        {countryLabel ? <span>{`, ${countryLabel}`}</span> : null}
      </span>
    );
  };

  const formatStatValue = (value) => {
    if (value === null || value === undefined) {
      return seasonStatsLoading ? "…" : "--";
    }
    return Number(value).toLocaleString("en-US");
  };

  const formatDistanceValue = (value) => {
    if (value === null || value === undefined) {
      return seasonStatsLoading ? "…" : "--";
    }
    return `${Number(value).toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} km`;
  };

  const seasonTabs = [
    { id: "events", label: "Events" },
    { id: "entries_overview", label: "Entries" },
    { id: "driver_championship", label: "Driver championship" },
    { id: "constructor_championship", label: "Constructor championship" },
    { id: "season_change_log", label: "Season Change Log" },
  ];

  const formatTeamLabel = (team) => team?.team_name || team?.short_name || "—";
  const formatCarLabel = (car) => car?.chassis_name || "—";
  const formatEngineLabel = (engine) => {
    if (!engine) return "—";
    const constructorName =
      engine.constructor?.name || engine.constructor?.short_name || "";
    const model = engine.model_number || "";
    const layout =
      engine.layout_id && engine.cylinder_count
        ? `${engine.layout_id}${engine.cylinder_count}`
        : engine.layout_id || "";
    const displacement =
      typeof engine.displacement_cc === "number"
        ? (engine.displacement_cc / 1000).toFixed(1)
        : "";
    let aspiration = "";
    if (engine.aspiration_type_id === "supercharged") aspiration = "S";
    if (engine.aspiration_type_id === "turbocharged") aspiration = "T";
    if (engine.aspiration_type_id === "hybrid") aspiration = "HT";
    const parts = [
      constructorName,
      model,
      layout,
      displacement ? `${displacement}L` : "",
      aspiration,
    ].filter((value) => value);
    return parts.length ? parts.join(" ") : "—";
  };
  const formatDriverLabel = (driver) => {
    if (!driver) return "—";
    const fullName = [driver.first_name, driver.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return fullName || driver.driverCode || "—";
  };

  const entriesOverviewRows = useMemo(() => {
    return entriesOverviewData
      .map((row, index) => {
        const team = row?.team || null;
        const car = row?.car || null;
        const engine = row?.engine || null;
        const drivers = Array.isArray(row?.drivers) ? row.drivers : [];
        return {
          groupKey:
            `${team?.id ?? `team-${index}`}|${car?.id ?? `car-${index}`}`,
          team,
          car,
          teamLabel: formatTeamLabel(team),
          carLabel: formatCarLabel(car),
          engineRows: engine
            ? [
              {
                engine,
                label: formatEngineLabel(engine),
              },
            ]
            : [],
          driverSeats: drivers
            .map((item, driverIndex) => {
              const driver = item?.driver || null;
              const driverLabel = formatDriverLabel(driver);
              const carNumberLabel =
                item?.car_number === null || item?.car_number === undefined
                  ? ""
                  : String(item.car_number);
              const driverRounds = Array.isArray(item?.rounds) ? item.rounds : [];
              const seatRoundsMap = new Map();
              driverRounds.forEach((roundItem, roundIndex) => {
                const eventId =
                  roundItem?.event_id === null || roundItem?.event_id === undefined
                    ? null
                    : roundItem.event_id;
                const roundKey =
                  eventId === null
                    ? `unknown-${roundItem?.round ?? "none"}-${roundIndex}`
                    : `event-${eventId}`;
                if (seatRoundsMap.has(roundKey)) return;
                seatRoundsMap.set(roundKey, {
                  id: eventId,
                  slug: roundItem?.slug ?? null,
                  round: roundItem?.round ?? null,
                });
              });
              return {
                seatKey: `${team?.id ?? `team-${index}`}|${car?.id ?? `car-${index}`}|${driver?.id ?? driverLabel}|${carNumberLabel || "no"}|${driverIndex}`,
                driver,
                driverLabel,
                carNumberLabel,
                rounds: Array.from(seatRoundsMap.values()).sort((a, b) => {
                  const aRound = a?.round ?? Number.POSITIVE_INFINITY;
                  const bRound = b?.round ?? Number.POSITIVE_INFINITY;
                  if (aRound !== bRound) return aRound - bRound;
                  return (a?.id ?? 0) - (b?.id ?? 0);
                }),
              };
            })
            .sort((a, b) => {
              const aNum = Number(a.carNumberLabel);
              const bNum = Number(b.carNumberLabel);
              if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) {
                return aNum - bNum;
              }
              return a.driverLabel.localeCompare(b.driverLabel);
            }),
        };
      })
      .sort((a, b) => {
        const teamCompare = a.teamLabel.localeCompare(b.teamLabel);
        if (teamCompare !== 0) return teamCompare;
        return a.carLabel.localeCompare(b.carLabel);
      });
  }, [entriesOverviewData]);

  const seasonDriverChanges = useMemo(() => {
    if (seasonEntriesByEvent.length < 2) return [];
    const changes = [];

    const seatKey = (entry) => {
      const teamKey = entry?.team?.id ?? formatTeamLabel(entry?.team);
      const carKey = entry?.car?.id ?? formatCarLabel(entry?.car);
      const numberKey =
        entry?.car_number === null || entry?.car_number === undefined
          ? "—"
          : String(entry.car_number);
      return `${teamKey}|${carKey}|${numberKey}`;
    };

    for (let index = 1; index < seasonEntriesByEvent.length; index += 1) {
      const previous = seasonEntriesByEvent[index - 1];
      const current = seasonEntriesByEvent[index];
      const previousBySeat = new Map();
      previous.entries.forEach((entry) => {
        previousBySeat.set(seatKey(entry), entry);
      });
      const currentBySeat = new Map();
      current.entries.forEach((entry) => {
        currentBySeat.set(seatKey(entry), entry);
      });

      currentBySeat.forEach((currentEntry, key) => {
        const previousEntry = previousBySeat.get(key);
        if (!previousEntry) return;
        const previousDriverId = previousEntry?.driver?.id ?? null;
        const currentDriverId = currentEntry?.driver?.id ?? null;
        const previousDriverLabel = formatDriverLabel(previousEntry?.driver);
        const currentDriverLabel = formatDriverLabel(currentEntry?.driver);
        const changedById =
          previousDriverId !== null &&
          currentDriverId !== null &&
          previousDriverId !== currentDriverId;
        const changedByLabel =
          previousDriverId === null &&
          currentDriverId === null &&
          previousDriverLabel !== currentDriverLabel;
        if (!changedById && !changedByLabel) return;

        changes.push({
          fromEvent: previous.event,
          toEvent: current.event,
          team: currentEntry?.team || previousEntry?.team || null,
          car: currentEntry?.car || previousEntry?.car || null,
          carNumber:
            currentEntry?.car_number ??
            previousEntry?.car_number ??
            null,
          previousDriver: previousEntry?.driver || null,
          currentDriver: currentEntry?.driver || null,
        });
      });
    }

    return changes;
  }, [seasonEntriesByEvent]);

  useEffect(() => {
    if (!isEventModalOpen) return;
    let isActive = true;

    async function loadLookups() {
      try {
        setCircuitsLoading(true);
        const circuitsData = await apiGet("/circuits?limit=1000");
        if (!isActive) return;
        setCircuits(Array.isArray(circuitsData) ? circuitsData : []);
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

    }

    loadLookups();
    return () => {
      isActive = false;
    };
  }, [isEventModalOpen]);

  const handleEventFormChange = (eventTarget) => {
    const { name, value } = eventTarget.target;
    setEventForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateEvent = async (eventTarget) => {
    eventTarget.preventDefault();
    if (!season?.short_name) return;
    setEventSaving(true);
    setEventSaveError("");
    try {
      const payload = {
        season_short_name: season.short_name,
        event_name: eventForm.event_name || null,
        event_official_name: eventForm.event_official_name || null,
        event_date: eventForm.event_date || null,
        round: eventForm.round === "" ? null : Number(eventForm.round),
        circuit_id:
          eventForm.circuit_id === "" ? null : Number(eventForm.circuit_id),
        regulatory_system_id: null,
        laps: eventForm.laps === "" ? null : Number(eventForm.laps),
        scheduled_laps:
          eventForm.scheduled_laps === ""
            ? null
            : Number(eventForm.scheduled_laps),
        distance: eventForm.distance || null,
        scheduled_distance: eventForm.scheduled_distance || null,
      };
      const response = await apiFetch("/events/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create event.");
      }
      const created = await response.json();
      setEvents((prev) =>
        prev.concat(created).sort((a, b) => {
          const aDate = parseEventDate(a.event_date)?.getTime() ?? 0;
          const bDate = parseEventDate(b.event_date)?.getTime() ?? 0;
          return aDate - bDate;
        })
      );
      setIsEventModalOpen(false);
      setEventForm({
        event_name: "",
        event_official_name: "",
        event_date: "",
        round: "",
        circuit_id: "",
        laps: "",
        scheduled_laps: "",
        distance: "",
        scheduled_distance: "",
      });
    } catch (err) {
      setEventSaveError(err.message || "Failed to create event.");
    } finally {
      setEventSaving(false);
    }
  };

  const driversById = useMemo(() => {
    const map = new Map();
    standings.forEach((s) => {
      if (s.driver?.id) map.set(s.driver.id, s.driver);
    });
    return map;
  }, [standings]);

  const raceWinnerByEventId = useMemo(() => {
    const map = new Map();
    driverResultsByEvent.forEach((results, eventId) => {
      for (const [driverId, result] of results.raceByDriver) {
        if (Number(result.position) === 1) {
          const driver = driversById.get(driverId);
          if (driver) {
            const name = `${driver.first_name?.[0] || ""}. ${driver.last_name || ""}`.trim();
            map.set(eventId, name);
          }
          break;
        }
      }
    });
    return map;
  }, [driverResultsByEvent, driversById]);

  const testingEvents = useMemo(() =>
    sortedSeasonEvents.filter((e) => (e.championships || []).some((c) => c.short_name === "testing_event")),
    [sortedSeasonEvents]
  );

  const grandPrixEvents = useMemo(() =>
    sortedSeasonEvents.filter((e) => !(e.championships || []).some((c) => c.short_name === "testing_event")),
    [sortedSeasonEvents]
  );

  const getEventStatus = (event) => {
    const isCancelled = (event.championships || []).some((c) => c.short_name === "f1_cancelled_event");
    if (isCancelled) return { type: "cancelled", label: "Cancelled" };
    const winner = raceWinnerByEventId.get(event.id);
    if (winner) return { type: "winner", label: winner };
    const eventDate = parseEventDate(event.event_date);
    if (!eventDate) return { type: "scheduled", label: "Scheduled" };
    const now = new Date();
    if (eventDate < now) return { type: "completed", label: "Completed" };
    const diff = eventDate - now;
    if (diff < 14 * 24 * 60 * 60 * 1000) return { type: "upcoming", label: "Upcoming" };
    return { type: "scheduled", label: "Scheduled" };
  };

  const formatEventMonth = (value) => {
    const date = parseEventDate(value);
    if (!date) return "TBD";
    return date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
  };

  const formatEventDay = (value) => {
    const date = parseEventDate(value);
    if (!date) return "—";
    return date.getDate();
  };

  return (
    <div className="page">
      <SeoHead
        title={seasonYear ? `${seasonYear} F1 Season` : "F1 Season"}
        description={
          seasonYear
            ? `Formula 1 ${seasonYear} season: every event, results, and standings.`
            : undefined
        }
      />
      {/* ── Hero ── */}
      <section className="dashboard-hero">
        <div className="dashboard-hero-overlay">
          <p className="dashboard-hero-eyebrow">Season Overview</p>
          <h1 className="dashboard-hero-title">
            {season
              ? `${season.year} Formula One World Championship`
              : "Season overview"}
          </h1>
          <div className="dashboard-hero-actions">
            <Link to="/seasons" className="pill pill-dark">
              Back to Seasons
            </Link>
            {prevSeasonYear ? (
              <Link to={`/seasons/${prevSeasonYear}`} className="pill pill-dark">
                Previous Season
              </Link>
            ) : null}
            {nextSeasonYear ? (
              <Link to={`/seasons/${nextSeasonYear}`} className="pill pill-dark">
                Next Season
              </Link>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                className="pill"
                onClick={() => setIsEventModalOpen(true)}
                disabled={!season}
              >
                Create Event
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* ── Bento Stats ── */}
      <section className="bento-grid">
        <div className="bento-card bento-card--primary">
          <div className="bento-header">
            <span className="bento-label">Races</span>
            <span className="material-symbols-outlined bento-icon">flag</span>
          </div>
          <div className="bento-value">{events.filter((e) => (e.championships || []).some((c) => c.short_name === "f1_driver_world") && !(e.championships || []).some((c) => c.short_name === "f1_cancelled_event")).length || "—"}</div>
          <p className="bento-meta">
            {sprintEventIds.size ? `${sprintEventIds.size} Sprint Weekends` : "Global Destinations"}
          </p>
        </div>
        <div className="bento-card">
          <div className="bento-header">
            <span className="bento-label">Teams</span>
            <span className="material-symbols-outlined bento-icon">groups</span>
          </div>
          <div className="bento-value">{formatStatValue(seasonStats?.different_teams)}</div>
          <p className="bento-meta">Constructors Grid</p>
        </div>
        <div className="bento-card">
          <div className="bento-header">
            <span className="bento-label">Drivers</span>
            <span className="material-symbols-outlined bento-icon">sports_motorsports</span>
          </div>
          <div className="bento-value">{formatStatValue(seasonStats?.different_drivers)}</div>
          <p className="bento-meta">Full-time Entries</p>
        </div>
        <div className="bento-card">
          <div className="bento-header">
            <span className="bento-label">Distance</span>
            <span className="material-symbols-outlined bento-icon">route</span>
          </div>
          <div className="bento-value">{formatDistanceValue(seasonStats?.km_travelled)}</div>
          <p className="bento-meta">Total Km Travelled</p>
        </div>
      </section>

      {/* ── Action buttons + Tabs ── */}
      <section className="section">
        <div className="detail-card event-tabs-card">
          <div className="event-tabs-row">
            {seasonTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`ghost link-pill event-tab-link${activeTab === tab.id ? " is-active" : ""
                  }`}
                onClick={() => handleSeasonTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {activeTab === "driver_championship" ? (
        <section className="section">
           <div className="section-header">
            <div>
              <h2>Driver championship</h2>
            </div>
          </div>
          <div className="tab-panel">
            {standingsLoading ||
              (driverRoundResultsLoading && driverRoundResults.length === 0) ? (
              <div className="status-card">Loading driver standings…</div>
            ) : standingsError ? (
              <div className="status-card error">{standingsError}</div>
            ) : standings.length === 0 ? (
              <div className="status-card">No driver standings recorded yet.</div>
            ) : (
              <>
                {driverRoundResultsError ? (
                  <div className="status-card error">{driverRoundResultsError}</div>
                ) : null}
                <div className="season-results-legend">
                  <span className="season-results-legend-item">
                    <span className="season-results-legend-chip season-results-legend-chip-sprint">
                      S
                    </span>
                    Sprint
                  </span>
                  <span className="season-results-legend-item">
                    <span className="season-results-legend-chip season-results-legend-chip-race">
                      R
                    </span>
                    Race
                  </span>
                </div>
                <TableWrapper className="season-rounds-wrapper">
                  <DataTable className="season-tab-table">
                    <thead>
                      <tr>
                        <th>Pos</th>
                        <th>Driver</th>
                        {championshipRoundColumns.map((roundColumn) => (
                          <th
                            key={roundColumn.key}
                            className={`season-driver-round-heading${roundColumn.sessionKind === "sprint"
                                ? " season-driver-round-heading-sprint"
                                : " season-driver-round-heading-race"
                              }`}
                          >
                            <Link
                              to={`/seasons/${seasonYear}/events/${roundColumn.eventSlug}`}
                              className="table-link season-driver-round-link"
                              title={roundColumn.title}
                            >
                              {roundColumn.label}
                            </Link>
                          </th>
                        ))}
                        <th>Points</th>
                        <th>Calculated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((standing) => {
                        const driverId = standing.driver?.id ?? null;
                        return (
                          <tr key={standing.id}>
                            <td>{standing.position ?? "—"}</td>
                            <td>
                              <DriverName
                                driver={standing.driver}
                                countryByCode={countryByCode}
                              />
                            </td>
                            {championshipRoundColumns.map((roundColumn) => {
                              const eventResults = driverId
                                ? driverResultsByEvent.get(roundColumn.eventId)
                                : null;
                              const result = driverId
                                ? roundColumn.sessionKind === "sprint"
                                  ? eventResults?.sprintByDriver.get(driverId)
                                  : eventResults?.raceByDriver.get(driverId)
                                : null;
                              const className = getDriverRoundCellClassName(result);
                              return (
                                <td
                                  key={`${standing.id}-${roundColumn.key}`}
                                  className={`season-driver-round-cell${className ? ` ${className}` : ""
                                    }`}
                                >
                                  {result?.position ?? "—"}
                                </td>
                              );
                            })}
                            <td>{standing.points ?? "—"}</td>
                            <td>
                              {calculatedByDriver.get(standing.driver?.id)?.points ??
                                "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </DataTable>
                </TableWrapper>
              </>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "constructor_championship" ? (
        <section className="section">
           <div className="section-header">
            <div>
              <h2>Constructor championship</h2>
            </div>
          </div>
          <div className="tab-panel">
            {constructorStandingsLoading ? (
              <div className="status-card">Loading constructor standings…</div>
            ) : constructorStandingsError ? (
              <div className="status-card error">{constructorStandingsError}</div>
            ) : constructorStandings.length === 0 ? (
              <div className="status-card">No constructor standings recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable className="season-tab-table">
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
                        <td>{formatConstructor(standing.constructor)}</td>
                        <td>{standing.points ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrapper>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "entries_overview" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Entries overview</h2>
            </div>
          </div>
          <div className="tab-panel">
            {entriesOverviewLoading ? (
              <div className="status-card">Loading season entries…</div>
            ) : entriesOverviewError ? (
              <div className="status-card error">{entriesOverviewError}</div>
            ) : entriesOverviewRows.length === 0 ? (
              <div className="status-card">No entries recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable className="season-tab-table">
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Car</th>
                      <th>Engine</th>
                      <th>Drivers</th>
                      <th>Rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entriesOverviewRows.map((row) => (
                      <tr key={row.groupKey}>
                        <td>
                          {row.team?.id ? (
                            <Link
                              to={`/teams/${row.team.slug}`}
                              className="table-link"
                            >
                              {row.teamLabel}
                            </Link>
                          ) : (
                            row.teamLabel
                          )}
                        </td>
                        <td>
                          {row.car?.id ? (
                            <Link
                              to={`/cars/${row.car.slug}`}
                              className="table-link"
                            >
                              {row.carLabel}
                            </Link>
                          ) : (
                            row.carLabel
                          )}
                        </td>
                        <td>
                          {row.engineRows.length ? (
                            <div className="table-cell-stack">
                              {row.engineRows.map((engineRow) =>
                                engineRow.engine?.id ? (
                                  <Link
                                    key={`${row.groupKey}-engine-${engineRow.engine.id}`}
                                    to={`/engines/${engineRow.engine.slug}`}
                                    className="table-link"
                                  >
                                    {engineRow.label}
                                  </Link>
                                ) : (
                                  <div key={`${row.groupKey}-engine-${engineRow.label}`}>
                                    {engineRow.label}
                                  </div>
                                )
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {row.driverSeats.length ? (
                            <div className="table-cell-stack">
                              {row.driverSeats.map((seat) => (
                                <div key={seat.seatKey}>
                                  {seat.driver?.id ? (
                                    <Link
                                      to={`/drivers/${seat.driver.slug}`}
                                      className="table-link"
                                    >
                                      <DriverName
                                        driver={seat.driver}
                                        countryByCode={countryByCode}
                                      />
                                      {seat.carNumberLabel
                                        ? ` (${seat.carNumberLabel})`
                                        : ""}
                                    </Link>
                                  ) : (
                                    <>
                                      <DriverName
                                        driver={seat.driver}
                                        countryByCode={countryByCode}
                                      />
                                      {seat.carNumberLabel
                                        ? ` (${seat.carNumberLabel})`
                                        : ""}
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {row.driverSeats.length ? (
                            <div className="table-cell-stack">
                              {row.driverSeats.map((seat) => (
                                <div
                                  key={`${seat.seatKey}-rounds`}
                                  className="season-rounds-cell"
                                >
                                  {seat.rounds.length ? (
                                    <>
                                      <div className="season-rounds-preview">
                                        {seat.rounds.slice(0, 3).map((eventItem, index) =>
                                          eventItem.id ? (
                                            <Link
                                              key={`${seat.seatKey}-round-preview-${eventItem.id}-${index}`}
                                              to={`/seasons/${seasonYear}/events/${eventItem.slug}`}
                                              className="table-link season-round-pill"
                                            >
                                              {eventItem.round ?? "—"}
                                            </Link>
                                          ) : (
                                            <span
                                              key={`${seat.seatKey}-round-preview-unknown-${index}`}
                                              className="season-round-pill"
                                            >
                                              {eventItem.round ?? "—"}
                                            </span>
                                          )
                                        )}
                                        {seat.rounds.length > 3 ? (
                                          <button
                                            type="button"
                                            className="season-round-more"
                                            onClick={() =>
                                              setOpenRoundsGroupKey((prev) =>
                                                prev === seat.seatKey ? null : seat.seatKey
                                              )
                                            }
                                          >
                                            +{seat.rounds.length - 3}
                                          </button>
                                        ) : null}
                                      </div>
                                      {openRoundsGroupKey === seat.seatKey ? (
                                        <div className="season-rounds-popover">
                                          <div className="season-rounds-grid">
                                            {seat.rounds.map((eventItem, index) =>
                                              eventItem.id ? (
                                                <Link
                                                  key={`${seat.seatKey}-round-popover-${eventItem.id}-${index}`}
                                                  to={`/seasons/${seasonYear}/events/${eventItem.slug}`}
                                                  className="table-link season-round-pill"
                                                >
                                                  {eventItem.round ?? "—"}
                                                </Link>
                                              ) : (
                                                <span
                                                  key={`${seat.seatKey}-round-popover-unknown-${index}`}
                                                  className="season-round-pill"
                                                >
                                                  {eventItem.round ?? "—"}
                                                </span>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      ) : null}
                                    </>
                                  ) : (
                                    "—"
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrapper>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "season_change_log" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Season Change Log</h2>
            </div>
          </div>
          <div className="tab-panel">
            {seasonEntriesLoading ? (
              <div className="status-card">Loading season changes…</div>
            ) : seasonEntriesError ? (
              <div className="status-card error">{seasonEntriesError}</div>
            ) : seasonDriverChanges.length === 0 ? (
              <div className="status-card">No driver changes detected.</div>
            ) : (
              <TableWrapper>
                <DataTable className="season-tab-table">
                  <thead>
                    <tr>
                      <th>From event</th>
                      <th>To event</th>
                      <th>Team</th>
                      <th>Car</th>
                      <th>Car number</th>
                      <th>Previous driver</th>
                      <th>Current driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasonDriverChanges.map((change, index) => (
                      <tr
                        key={`${change.fromEvent?.id || "from"}-${change.toEvent?.id || "to"}-${change.team?.id || "team"}-${change.car?.id || "car"}-${change.carNumber || "no"}-${index}`}
                      >
                        <td>
                          {change.fromEvent?.id ? (
                            <Link
                              to={`/seasons/${seasonYear}/events/${change.fromEvent.slug}`}
                              className="table-link"
                            >
                              {change.fromEvent.event_name || "Event"}
                            </Link>
                          ) : (
                            change.fromEvent?.event_name || "—"
                          )}
                        </td>
                        <td>
                          {change.toEvent?.id ? (
                            <Link
                              to={`/seasons/${seasonYear}/events/${change.toEvent.slug}`}
                              className="table-link"
                            >
                              {change.toEvent.event_name || "Event"}
                            </Link>
                          ) : (
                            change.toEvent?.event_name || "—"
                          )}
                        </td>
                        <td>{formatTeamLabel(change.team)}</td>
                        <td>{formatCarLabel(change.car)}</td>
                        <td>{change.carNumber ?? "—"}</td>
                        <td>
                          <DriverName
                            driver={change.previousDriver}
                            countryByCode={countryByCode}
                          />
                        </td>
                        <td>
                          <DriverName
                            driver={change.currentDriver}
                            countryByCode={countryByCode}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrapper>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "events" ? (
        <section className="section" id="events">
          <div className="section-header">
            <div>
              <h2>Events</h2>
            </div>
          </div>
          {loading ? (
            <div className="status-card">Loading events…</div>
          ) : error ? (
            <div className="status-card error">{error}</div>
          ) : (
            <div className="season-schedule-grid">
              {/* ── Main Schedule ── */}
              <div className="season-schedule-main">
                {testingEvents.length > 0 && (
                  <>
                    <div className="category-divider">
                      <span>Pre-Season Testing</span>
                      <div className="category-divider-line"></div>
                    </div>
                    <div className="event-row-list">
                      {testingEvents.map((event) => {
                        const status = getEventStatus(event);
                        return (
                          <Link
                            to={`/seasons/${seasonYear}/events/${event.slug}`}
                            className="event-row event-row-non-world"
                            key={event.id}
                          >
                            <div className="event-date-stack">
                              <span className="event-date-month">{formatEventMonth(event.event_date)}</span>
                              <span className="event-date-day">{formatEventDay(event.event_date)}</span>
                            </div>
                            <div className="event-row-main">
                              <h3>{event.event_name || "Pre-Season Test"}</h3>
                              <p>{renderCircuitInfo(event)}</p>
                            </div>
                            <div className="event-row-status">
                              <span className="event-status-label">Status</span>
                              <span className={`event-status-badge event-status-badge--${status.type}`}>
                                {status.label}
                              </span>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </>
                )}

                <div className="category-divider" style={testingEvents.length > 0 ? { marginTop: "2rem" } : undefined}>
                  <span>Grand Prix Events</span>
                  <div className="category-divider-line"></div>
                </div>
                <div className="event-row-list">
                  {grandPrixEvents.map((event) => {
                    const championshipKeys = (event.championships || []).map(
                      (c) => c.short_name
                    );
                    const isWorld = championshipKeys.includes("f1_driver_world");
                    const isNonWorld = championshipKeys.includes("f1_non_world");
                    const isCancelled = championshipKeys.includes("f1_cancelled_event");
                    const isSprint = sprintEventIds.has(event.id);
                    const eventClassName = [
                      "event-row",
                      isWorld ? "event-row-world" : "",
                      !isWorld && isNonWorld ? "event-row-non-world" : "",
                      isSprint ? "event-row-sprint" : "",
                      isCancelled ? "event-row-cancelled" : "",
                    ].filter(Boolean).join(" ");
                    const status = getEventStatus(event);
                    const dateStyle = isCancelled ? { textDecoration: "line-through" } : undefined;
                    const rowContent = (
                      <>
                        <div className="event-date-stack" style={dateStyle}>
                          <span className="event-date-month">{formatEventMonth(event.event_date)}</span>
                          <span className="event-date-day">{formatEventDay(event.event_date)}</span>
                        </div>
                        <div className="event-row-main">
                          <h3>{event.event_name || `Round ${event.round}`}</h3>
                          <p>{renderCircuitInfo(event)}{event.laps ? ` · ${event.laps} Laps` : ""}</p>
                        </div>
                        <div className="event-row-status">
                          {status.type === "winner" ? (
                            <>
                              <span className="event-status-label">Winner</span>
                              <span className="event-status-winner">{status.label}</span>
                            </>
                          ) : (
                            <>
                              <span className="event-status-label">Status</span>
                              <span className={`event-status-badge event-status-badge--${status.type}`}>
                                {status.label}
                              </span>
                            </>
                          )}
                        </div>
                      </>
                    );
                    return isCancelled ? (
                      <div className={eventClassName} key={event.id}>
                        {rowContent}
                      </div>
                    ) : (
                      <Link
                        to={`/seasons/${seasonYear}/events/${event.slug}`}
                        className={eventClassName}
                        key={event.id}
                      >
                        {rowContent}
                      </Link>
                    );
                  })}
                </div>
              </div>

              {/* ── Standings Sidebar ── */}
              <div className="season-schedule-sidebar">
                {/* Driver Championship Card */}
                <div className="standings-card-dark">
                  <div className="standings-card-dark-header">
                    <h3>Drivers</h3>
                    <span className="material-symbols-outlined standings-card-dark-icon">sports_motorsports</span>
                  </div>
                  {standingsLoading ? (
                    <p className="standings-card-dark-empty">Loading…</p>
                  ) : standings.length === 0 ? (
                    <p className="standings-card-dark-empty">No standings yet</p>
                  ) : (
                    <div className="standings-card-dark-list">
                      {standings.slice(0, 5).map((s) => (
                        <div key={s.id} className="standings-card-dark-row">
                          <div className="standings-card-dark-left">
                            <span className="standings-card-dark-pos">{String(s.position ?? "—").padStart(2, "0")}</span>
                            <div className="standings-card-dark-bar"></div>
                            <div>
                              <p className="standings-card-dark-name">
                                {s.driver ? `${s.driver.first_name?.[0] || ""}. ${s.driver.last_name || ""}` : "—"}
                              </p>
                              <p className="standings-card-dark-team">
                                {formatConstructor(s.constructor)}
                              </p>
                            </div>
                          </div>
                          <span className="standings-card-dark-pts">{s.points ?? "—"} pts</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link to="#" className="standings-card-dark-btn" onClick={(e) => { e.preventDefault(); handleSeasonTabChange("driver_championship"); }}>
                    View All Drivers
                  </Link>
                </div>

                {/* Constructor Championship Card */}
                <div className="standings-card-dark">
                  <div className="standings-card-dark-header">
                    <h3>Constructors</h3>
                    <span className="material-symbols-outlined standings-card-dark-icon">leaderboard</span>
                  </div>
                  {constructorStandingsLoading ? (
                    <p className="standings-card-dark-empty">Loading…</p>
                  ) : constructorStandings.length === 0 ? (
                    <p className="standings-card-dark-empty">No standings yet</p>
                  ) : (
                    <div className="standings-card-dark-list">
                      {constructorStandings.slice(0, 5).map((s) => (
                        <div key={s.id} className="standings-card-dark-row">
                          <div className="standings-card-dark-left">
                            <span className="standings-card-dark-pos">{String(s.position ?? "—").padStart(2, "0")}</span>
                            <div className="standings-card-dark-bar"></div>
                            <div>
                              <p className="standings-card-dark-name">
                                {formatConstructor(s.constructor)}
                              </p>
                            </div>
                          </div>
                          <span className="standings-card-dark-pts">{s.points ?? "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <Link to="#" className="standings-card-dark-btn" onClick={(e) => { e.preventDefault(); handleSeasonTabChange("constructor_championship"); }}>
                    View All Teams
                  </Link>
                </div>
              </div>
            </div>
          )}
        </section>
      ) : null}

      {canEdit && isEventModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Create event</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsEventModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateEvent}>
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
                    required
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
                    required
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsEventModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={eventSaving}>
                  {eventSaving ? "Saving…" : "Create event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
