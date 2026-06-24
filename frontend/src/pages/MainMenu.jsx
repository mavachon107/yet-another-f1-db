import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiUrl } from "../lib/api.js";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import CountdownTimer from "../components/CountdownTimer.jsx";
import StandingsSnapshot from "../components/StandingsSnapshot.jsx";
import LastRaceResult from "../components/LastRaceResult.jsx";
import useCountries from "../hooks/useCountries.js";

const sections = [
  { id: "seasons", label: "Seasons" },
  { id: "drivers", label: "Drivers" },
  { id: "circuits", label: "Circuits" },
  { id: "teams", label: "Teams" },
  { id: "cars", label: "Constructors" },
  { id: "car-list", label: "Cars" },
];

const SEASONS_PAGE_SIZE = 25;
const DRIVERS_PAGE_SIZE = 25;
const DRIVER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CAR_LETTERS = DRIVER_LETTERS;
const CIRCUIT_LETTERS = DRIVER_LETTERS;
const TEAM_LETTERS = DRIVER_LETTERS;

export default function MainMenu() {
  const [activeSection, setActiveSection] = useState("seasons");
  const [seasons, setSeasons] = useState([]);
  const [seasonPageIndex, setSeasonPageIndex] = useState(0);
  const [seasonLoading, setSeasonLoading] = useState(true);
  const [seasonError, setSeasonError] = useState("");
  const [drivers, setDrivers] = useState([]);
  const [driverLetter, setDriverLetter] = useState("A");
  const [driverPageIndex, setDriverPageIndex] = useState(0);
  const [driverHasNextPage, setDriverHasNextPage] = useState(false);
  const [driverFilterInput, setDriverFilterInput] = useState("");
  const [driverFilterQuery, setDriverFilterQuery] = useState("");
  const [driverLoading, setDriverLoading] = useState(false);
  const [driverError, setDriverError] = useState("");
  const [driverReload, setDriverReload] = useState(0);
  const [constructors, setConstructors] = useState([]);
  const [constructorLetter, setConstructorLetter] = useState("A");
  const [constructorPageIndex, setConstructorPageIndex] = useState(0);
  const [constructorHasNextPage, setConstructorHasNextPage] = useState(false);
  const [constructorLoading, setConstructorLoading] = useState(false);
  const [constructorError, setConstructorError] = useState("");
  const [carList, setCarList] = useState([]);
  const [carListLetter, setCarListLetter] = useState("A");
  const [carListPageIndex, setCarListPageIndex] = useState(0);
  const [carListHasNextPage, setCarListHasNextPage] = useState(false);
  const [carListFilterInput, setCarListFilterInput] = useState("");
  const [carListFilterQuery, setCarListFilterQuery] = useState("");
  const [carListLoading, setCarListLoading] = useState(false);
  const [carListError, setCarListError] = useState("");
  const [circuits, setCircuits] = useState([]);
  const [circuitLetter, setCircuitLetter] = useState("A");
  const [circuitLoading, setCircuitLoading] = useState(false);
  const [circuitError, setCircuitError] = useState("");
  const [teams, setTeams] = useState([]);
  const [teamLetter, setTeamLetter] = useState("A");
  const [teamLoading, setTeamLoading] = useState(false);
  const [teamError, setTeamError] = useState("");
  const [teamReload, setTeamReload] = useState(0);
  const [teamPageIndex, setTeamPageIndex] = useState(0);
  const [teamHasNextPage, setTeamHasNextPage] = useState(false);
  const [teamFilterInput, setTeamFilterInput] = useState("");
  const [teamFilterQuery, setTeamFilterQuery] = useState("");
  const [competitionMap, setCompetitionMap] = useState(new Map());
  const [championsMap, setChampionsMap] = useState(new Map());
  const [constructorMap, setConstructorMap] = useState(new Map());
  const [seasonSortKey, setSeasonSortKey] = useState("year");
  const [seasonSortDir, setSeasonSortDir] = useState("asc");
  const { countryByCode, countryByName } = useCountries();
  const [nextEvent, setNextEvent] = useState(null);
  const [nextEventLoading, setNextEventLoading] = useState(false);
  const [nextEventError, setNextEventError] = useState("");
  const [nextEventDateRange, setNextEventDateRange] = useState("");
  const [nextEventSessions, setNextEventSessions] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const [driverStandings, setDriverStandings] = useState([]);
  const [constructorStandings, setConstructorStandings] = useState([]);
  const [lastRaceResults, setLastRaceResults] = useState([]);
  const [latestSeasonYear, setLatestSeasonYear] = useState(null);

  const resolveCountry = useCallback(
    (value) => {
      if (!value) return null;
      const key = String(value).toLowerCase();
      return countryByCode.get(key) || countryByName.get(key) || null;
    },
    [countryByCode, countryByName]
  );

  const renderCountryCell = useCallback(
    (value) => {
      const country = resolveCountry(value);
      if (!country) return value || "—";
      const alpha2 = country.alpha2_code
        ? country.alpha2_code.toLowerCase()
        : null;
      return (
        <span className="table-driver">
          {alpha2 ? (
            <img
              className="flag-icon"
              src={`https://flagcdn.com/24x18/${alpha2}.png`}
              alt={country.name ? `${country.name} flag` : "Country flag"}
              loading="lazy"
            />
          ) : null}
          <span>{country.name}</span>
        </span>
      );
    },
    [resolveCountry]
  );

  const resolveImageUrl = useCallback((url) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return apiUrl(url);
  }, []);

  const formatDate = (value) => {
    if (!value) return "TBD";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "TBD";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const buildEventDateRange = (sessions) => {
    if (!sessions?.length) return "";
    const dates = sessions
      .flatMap((sessionItem) => [
        sessionItem.date_time_start,
        sessionItem.date_time_end,
      ])
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));
    if (!dates.length) return "";
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const start = formatDate(min);
    const end = formatDate(max);
    return start === end ? start : `${start} — ${end}`;
  };

  const formatCircuitLabel = useCallback(
    (event) => {
      if (!event?.circuit) return "Circuit TBD";
      const { name, country } = event.circuit;
      const resolved = resolveCountry(country);
      const alpha2 = resolved?.alpha2_code
        ? resolved.alpha2_code.toLowerCase()
        : null;
      const label = resolved?.name || country;
      return (
        <span className="table-driver">
          {alpha2 ? (
            <img
              className="flag-icon"
              src={`https://flagcdn.com/24x18/${alpha2}.png`}
              alt={label ? `${label} flag` : "Country flag"}
              loading="lazy"
            />
          ) : null}
          <span>{name}</span>
          {label ? <span>{`, ${label}`}</span> : null}
        </span>
      );
    },
    [resolveCountry]
  );

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        let offset = 0;
        let items = [];
        while (true) {
          const batch = await apiGet(
            `/seasons?limit=${SEASONS_PAGE_SIZE}&offset=${offset}`
          );
          items = items.concat(batch);
          if (batch.length < SEASONS_PAGE_SIZE) {
            break;
          }
          offset += SEASONS_PAGE_SIZE;
        }
        if (isActive) {
          setSeasons(items);
          setSeasonError("");
        }
      } catch (err) {
        if (isActive) {
          setSeasonError(err.message || "Failed to load seasons.");
        }
      } finally {
        if (isActive) {
          setSeasonLoading(false);
        }
      }
    }

    load();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!seasons.length) return;
    let isActive = true;

    async function loadSeasonHighlights() {
      setNextEventLoading(true);
      setNextEventError("");
      try {
        const latestSeason = seasons.reduce((best, s) =>
          (!best || Number(s.year) > Number(best.year)) ? s : best, null);
        if (!latestSeason) {
          throw new Error("No season found.");
        }
        if (isActive) setLatestSeasonYear(latestSeason.year);
        const events = await apiGet(`/events/by-season/${latestSeason.id}`);
        const now = new Date();
        const upcomingEvent = events.find(
          (event) =>
            event.event_date && new Date(event.event_date).getTime() >= now.getTime()
        );
        const resolvedNextEvent =
          upcomingEvent || (events.length ? events[events.length - 1] : null);
        if (isActive) {
          setNextEvent(resolvedNextEvent || null);
          setNextEventDateRange("");
        }
        if (resolvedNextEvent?.id) {
          const sessionData = await apiGet(
            `/sessions/by-event/${resolvedNextEvent.id}`
          );
          if (isActive) {
            setNextEventDateRange(buildEventDateRange(sessionData));
            setNextEventSessions(sessionData || []);
          }
        }

        // Derive last completed event for standings and results
        const pastEvents = events.filter(
          (e) => e.event_date && new Date(e.event_date).getTime() < now.getTime()
        );
        const lastCompletedEvent = pastEvents.length
          ? pastEvents[pastEvents.length - 1]
          : null;
        if (isActive) setLastEvent(lastCompletedEvent);

        // Fetch standings and race results (use allSettled so failures are isolated)
        if (lastCompletedEvent?.id) {
          const [driverRes, constructorRes, raceRes] = await Promise.allSettled([
            apiGet(`/standings/by-event/${lastCompletedEvent.id}?standing_type=DRIVER`),
            apiGet(`/standings/by-event/${lastCompletedEvent.id}?standing_type=CONSTRUCTOR`),
            apiGet(`/session-results/by-event/${lastCompletedEvent.id}?session_type=RACE`),
          ]);
          if (isActive) {
            const parsePos = (p) => {
              const n = Number(p);
              return Number.isFinite(n) ? n : 9999;
            };
            if (driverRes.status === "fulfilled") {
              setDriverStandings(
                (driverRes.value || [])
                  .sort((a, b) => parsePos(a.position) - parsePos(b.position))
                  .slice(0, 10)
              );
            }
            if (constructorRes.status === "fulfilled") {
              setConstructorStandings(
                (constructorRes.value || [])
                  .sort((a, b) => parsePos(a.position) - parsePos(b.position))
                  .slice(0, 10)
              );
            }
            if (raceRes.status === "fulfilled") {
              setLastRaceResults(
                (raceRes.value || [])
                  .filter((r) => r.position && r.position !== "FL")
                  .sort((a, b) => parsePos(a.position) - parsePos(b.position))
                  .slice(0, 10)
              );
            }
          }
        }

      } catch (err) {
        if (isActive) {
          setNextEventError(err.message || "Failed to load next event.");
          setNextEventDateRange("");
        }
      } finally {
        if (isActive) {
          setNextEventLoading(false);
        }
      }
    }

    loadSeasonHighlights();
    return () => {
      isActive = false;
    };
  }, [seasons]);


  useEffect(() => {
    let isActive = true;

    async function fetchAllCompetitions() {
      const PAGE_SIZE = 100;
      let offset = 0;
      let items = [];
      while (true) {
        const batch = await apiGet(
          `/competitions?limit=${PAGE_SIZE}&offset=${offset}`
        );
        items = items.concat(batch);
        if (batch.length < PAGE_SIZE) {
          break;
        }
        offset += PAGE_SIZE;
      }
      return items;
    }

    async function fetchAllConstructors() {
      const PAGE_SIZE = 100;
      let offset = 0;
      let items = [];
      while (true) {
        const batch = await apiGet(
          `/constructors?limit=${PAGE_SIZE}&offset=${offset}`
        );
        items = items.concat(batch);
        if (batch.length < PAGE_SIZE) {
          break;
        }
        offset += PAGE_SIZE;
      }
      return items;
    }

    async function loadLookups() {
      try {
        const [competitions, champions, constructors] = await Promise.all([
          fetchAllCompetitions(),
          apiGet("/stats/season_champions"),
          fetchAllConstructors(),
        ]);
        if (!isActive) return;
        const nextCompetitionMap = new Map();
        competitions.forEach((competition) => {
          nextCompetitionMap.set(competition.id, competition);
        });
        const nextChampionsMap = new Map();
        (champions || []).forEach((item) => {
          nextChampionsMap.set(item.season_id, item);
        });
        const nextConstructorMap = new Map();
        constructors.forEach((constructor) => {
          nextConstructorMap.set(constructor.id, constructor);
        });
        setCompetitionMap(nextCompetitionMap);
        setChampionsMap(nextChampionsMap);
        setConstructorMap(nextConstructorMap);
      } catch (err) {
        if (isActive) {
          setCompetitionMap(new Map());
          setChampionsMap(new Map());
          setConstructorMap(new Map());
        }
      }
    }

    loadLookups();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (activeSection !== "drivers") {
      return;
    }
    let isActive = true;

    async function loadDrivers() {
      try {
        setDriverLoading(true);
        const offset = driverPageIndex * DRIVERS_PAGE_SIZE;
        const trimmedFilter = driverFilterQuery.trim();
        const driverData = await apiGet(
          trimmedFilter
            ? `/drivers/search?q=${encodeURIComponent(
                trimmedFilter
              )}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
            : `/drivers/by-last-name?starts_with=${driverLetter}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setDrivers(driverData);
          setDriverHasNextPage(driverData.length === DRIVERS_PAGE_SIZE);
          setDriverError("");
        }
      } catch (err) {
        if (isActive) {
          setDriverError(err.message || "Failed to load drivers.");
        }
      } finally {
        if (isActive) {
          setDriverLoading(false);
        }
      }
    }

    loadDrivers();
    return () => {
      isActive = false;
    };
  }, [
    activeSection,
    driverLetter,
    driverFilterQuery,
    driverPageIndex,
    driverReload,
  ]);

  useEffect(() => {
    if (activeSection !== "cars") {
      return;
    }
    let isActive = true;

    async function loadConstructors() {
      try {
        setConstructorLoading(true);
        const offset = constructorPageIndex * DRIVERS_PAGE_SIZE;
        const constructorData = await apiGet(
          `/constructors/by-name?starts_with=${constructorLetter}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setConstructors(constructorData);
          setConstructorHasNextPage(
            constructorData.length === DRIVERS_PAGE_SIZE
          );
          setConstructorError("");
        }
      } catch (err) {
        if (isActive) {
          setConstructorError(err.message || "Failed to load constructors.");
        }
      } finally {
        if (isActive) {
          setConstructorLoading(false);
        }
      }
    }

    loadConstructors();
    return () => {
      isActive = false;
    };
  }, [activeSection, constructorLetter, constructorPageIndex]);

  useEffect(() => {
    if (activeSection !== "car-list") {
      return;
    }
    let isActive = true;

    async function loadCars() {
      try {
        setCarListLoading(true);
        const offset = carListPageIndex * DRIVERS_PAGE_SIZE;
        const trimmedFilter = carListFilterQuery.trim();
        const carData = await apiGet(
          trimmedFilter
            ? `/cars/search?q=${encodeURIComponent(
                trimmedFilter
              )}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
            : `/cars/by-name?starts_with=${carListLetter}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setCarList(carData);
          setCarListHasNextPage(carData.length === DRIVERS_PAGE_SIZE);
          setCarListError("");
        }
      } catch (err) {
        if (isActive) {
          setCarListError(err.message || "Failed to load cars.");
        }
      } finally {
        if (isActive) {
          setCarListLoading(false);
        }
      }
    }

    loadCars();
    return () => {
      isActive = false;
    };
  }, [activeSection, carListLetter, carListFilterQuery, carListPageIndex]);


  useEffect(() => {
    if (activeSection !== "circuits") {
      return;
    }
    let isActive = true;

    async function loadCircuits() {
      try {
        setCircuitLoading(true);
        const offset = 0;
        const circuitData = await apiGet(
          `/circuits/by-name?starts_with=${circuitLetter}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setCircuits(circuitData);
          setCircuitError("");
        }
      } catch (err) {
        if (isActive) {
          setCircuitError(err.message || "Failed to load circuits.");
        }
      } finally {
        if (isActive) {
          setCircuitLoading(false);
        }
      }
    }

    loadCircuits();
    return () => {
      isActive = false;
    };
  }, [activeSection, circuitLetter]);

  useEffect(() => {
    if (activeSection !== "teams") {
      return;
    }
    let isActive = true;

    async function loadTeams() {
      try {
        setTeamLoading(true);
        const offset = teamPageIndex * DRIVERS_PAGE_SIZE;
        const trimmedFilter = teamFilterQuery.trim();
        const teamData = await apiGet(
          trimmedFilter
            ? `/teams/search?q=${encodeURIComponent(
                trimmedFilter
              )}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
            : `/teams/by-name?starts_with=${teamLetter}&limit=${DRIVERS_PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setTeams(teamData);
          setTeamHasNextPage(teamData.length === DRIVERS_PAGE_SIZE);
          setTeamError("");
        }
      } catch (err) {
        if (isActive) {
          setTeamError(err.message || "Failed to load teams.");
        }
      } finally {
        if (isActive) {
          setTeamLoading(false);
        }
      }
    }

    loadTeams();
    return () => {
      isActive = false;
    };
  }, [activeSection, teamLetter, teamFilterQuery, teamPageIndex, teamReload]);

  const sortedSeasons = useMemo(() => {
    const dir = seasonSortDir === "asc" ? 1 : -1;
    const valueFor = (season) => {
      if (seasonSortKey === "competition") {
        const competition = competitionMap.get(season.competition_id);
        return competition?.name || "";
      }
      if (seasonSortKey === "driver") {
        const champions = championsMap.get(season.id);
        return formatDriverName(champions?.driver) || "";
      }
      if (seasonSortKey === "constructor") {
        const champions = championsMap.get(season.id);
        return formatConstructorName(champions?.constructor) || "";
      }
      return season.year ?? 0;
    };
    return [...seasons].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * dir;
      }
      return String(aValue).localeCompare(String(bValue)) * dir;
    });
  }, [
    seasons,
    seasonSortDir,
    seasonSortKey,
    competitionMap,
    championsMap,
  ]);

  const pagedSeasons = useMemo(() => {
    const start = seasonPageIndex * SEASONS_PAGE_SIZE;
    return sortedSeasons.slice(start, start + SEASONS_PAGE_SIZE);
  }, [sortedSeasons, seasonPageIndex]);

  const seasonHasNextPage =
    (seasonPageIndex + 1) * SEASONS_PAGE_SIZE < sortedSeasons.length;

  const handleSeasonSort = (key) => {
    if (seasonSortKey === key) {
      setSeasonSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSeasonSortKey(key);
    setSeasonSortDir("asc");
    setSeasonPageIndex(0);
  };

  const sortArrow = (key) => {
    if (seasonSortKey !== key) return "";
    return seasonSortDir === "asc" ? "↑" : "↓";
  };

  const formatDriverName = (driver) => {
    if (!driver) return "—";
    const fullName = `${driver.first_name || ""} ${driver.last_name || ""}`.trim();
    if (fullName) return fullName;
    return driver.short_name || "—";
  };

  const formatConstructorName = (constructor) => {
    if (!constructor) return "—";
    return constructor.name || constructor.short_name || "—";
  };

  useEffect(() => {
    const handle = setTimeout(() => {
      setDriverFilterQuery(driverFilterInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [driverFilterInput]);

  useEffect(() => {
    setDriverLetter("A");
    setDriverPageIndex(0);
    setDriverFilterInput("");
    setDriverFilterQuery("");
    setConstructorLetter("A");
    setConstructorPageIndex(0);
    setCarListLetter("A");
    setCarListPageIndex(0);
    setCarListFilterInput("");
    setCarListFilterQuery("");
    setCircuitLetter("A");
    setTeamLetter("A");
    setTeamPageIndex(0);
    setTeamFilterInput("");
    setTeamFilterQuery("");
  }, [activeSection]);

  useEffect(() => {
    setDriverPageIndex(0);
  }, [driverLetter]);

  useEffect(() => {
    setDriverPageIndex(0);
  }, [driverFilterQuery]);

  useEffect(() => {
    setConstructorPageIndex(0);
  }, [constructorLetter]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setCarListFilterQuery(carListFilterInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [carListFilterInput]);

  useEffect(() => {
    setCarListPageIndex(0);
  }, [carListLetter]);

  useEffect(() => {
    setCarListPageIndex(0);
  }, [carListFilterQuery]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setTeamFilterQuery(teamFilterInput.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [teamFilterInput]);

  useEffect(() => {
    setTeamPageIndex(0);
  }, [teamLetter]);

  useEffect(() => {
    setTeamPageIndex(0);
  }, [teamFilterQuery]);

  useEffect(() => {
    const handler = (event) => {
      const target = event.detail?.target;
      if (target === "drivers") {
        setDriverReload((value) => value + 1);
      } else if (target === "teams") {
        setTeamReload((value) => value + 1);
      } else if (target === "cars") {
        setCarReload((value) => value + 1);
      }
    };
    window.addEventListener("refresh:lists", handler);
    return () => {
      window.removeEventListener("refresh:lists", handler);
    };
  }, []);

  return (
    <div className="page">
      {/* ── Hero ── */}
      <section className="dashboard-hero">
        <div className="dashboard-hero-overlay">
          {latestSeasonYear ? (
            <p className="dashboard-hero-eyebrow">
              {latestSeasonYear} FIA Formula One World Championship
            </p>
          ) : null}
          {nextEventLoading ? (
            <h1 className="dashboard-hero-title">Loading…</h1>
          ) : nextEvent ? (
            <>
              <h1 className="dashboard-hero-title">
                {nextEvent.event_name || "Formula 1"}
              </h1>
              <p className="dashboard-hero-subtitle">
                {formatCircuitLabel(nextEvent)}
                {nextEventDateRange ? ` — ${nextEventDateRange}` : ""}
              </p>
              <div className="dashboard-hero-actions">
                <Link className="pill" to={`/seasons/${nextEvent.season_year}/events/${nextEvent.slug}/sessions`}>
                  View Event
                </Link>
                {latestSeasonYear ? (
                  <Link className="pill pill-dark" to={`/seasons/${latestSeasonYear}`}>
                    Full Season
                  </Link>
                ) : null}
              </div>
            </>
          ) : (
            <h1 className="dashboard-hero-title">F1 Archive</h1>
          )}
          <CountdownTimer sessions={nextEventSessions} />
        </div>
      </section>

      {/* ── Bento Stats ── */}
      <section className="bento-grid">
        <div className="bento-card bento-card--primary">
          <div className="bento-header">
            <span className="bento-label">Seasons</span>
            <span className="material-symbols-outlined bento-icon">calendar_month</span>
          </div>
          <div className="bento-value">{seasons.length || "—"}</div>
          <p className="bento-meta">Historical Archive</p>
        </div>
        <div className="bento-card">
          <div className="bento-header">
            <span className="bento-label">Next Round</span>
            <span className="material-symbols-outlined bento-icon">flag</span>
          </div>
          <div className="bento-value">{nextEvent?.round || "—"}</div>
          <p className="bento-meta">{nextEvent?.event_name || "TBD"}</p>
        </div>
        <div className="bento-card">
          <div className="bento-header">
            <span className="bento-label">Drivers</span>
            <span className="material-symbols-outlined bento-icon">sports_motorsports</span>
          </div>
          <div className="bento-value">{driverStandings.length || "—"}</div>
          <p className="bento-meta">Championship Contenders</p>
        </div>
        <div className="bento-card">
          <div className="bento-header">
            <span className="bento-label">Constructors</span>
            <span className="material-symbols-outlined bento-icon">groups</span>
          </div>
          <div className="bento-value">{constructorStandings.length || "—"}</div>
          <p className="bento-meta">Teams Entered</p>
        </div>
      </section>

      {/* ── Standings + Last Race ── */}
      {(driverStandings.length > 0 || lastRaceResults.length > 0) ? (
        <section className="dashboard-grid">
          <StandingsSnapshot
            driverStandings={driverStandings}
            constructorStandings={constructorStandings}
            countryByCode={countryByCode}
            eventName={lastEvent?.event_name}
            event={lastEvent}
          />
          <LastRaceResult
            results={lastRaceResults}
            event={lastEvent}
            countryByCode={countryByCode}
          />
        </section>
      ) : null}
    </div>
  );
}
