import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router-dom";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";
import { useCreateModal } from "../context/CreateModalContext.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DataTable from "../components/DataTable.jsx";
import EventDetailHeader from "../components/EventDetailHeader.jsx";
import EventHighlights from "../components/EventHighlights.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import useCountries from "../hooks/useCountries.js";
import { buildEventTabs, resolveActiveEventTab } from "../lib/eventTabs.js";
import { resolvePrevNextEvents } from "../lib/eventNavigation.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import SessionBanner from "../components/SessionBanner.jsx";
import { getAccessTokenRole, onAuthChanged } from "../lib/auth.js";

const emptyForm = {
  event_id: "",
  car_id: "",
  driver_id: "",
  team_id: "",
  tire_id: "",
  car_number: "",
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

const PAGE_SIZE = 100;

export default function EventEntryList() {
  const canEdit = useAuthStatus();
  const { openCreate } = useCreateModal();
  const [isAdmin, setIsAdmin] = useState(() => getAccessTokenRole() === "admin");
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openedEntryRef = useRef(null);
  const [event, setEvent] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [prevEvent, setPrevEvent] = useState(null);
  const [nextEvent, setNextEvent] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionCounts, setSessionCounts] = useState({});
  const [entriesCount, setEntriesCount] = useState(0);
  const [fastestLapCount, setFastestLapCount] = useState(0);
  const [standingsCount, setStandingsCount] = useState(0);
  const [driverOfTheDayCount, setDriverOfTheDayCount] = useState(0);
  const [activeTab, setActiveTab] = useState("entries");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copyPrevLoading, setCopyPrevLoading] = useState(false);
  const [copyPrevError, setCopyPrevError] = useState("");
  const [copyPrevStatus, setCopyPrevStatus] = useState("");
  const [isCopyPrevConfirmOpen, setIsCopyPrevConfirmOpen] = useState(false);
  const [seasonEvents, setSeasonEvents] = useState([]);
  const [copySourceEventId, setCopySourceEventId] = useState("");
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [driverOptions, setDriverOptions] = useState([]);
  const [carOptions, setCarOptions] = useState([]);
  const [teamOptions, setTeamOptions] = useState([]);
  const [tireOptions, setTireOptions] = useState([]);
  const [sortKey, setSortKey] = useState("team");
  const [sortDir, setSortDir] = useState("asc");
  const [circuitVersions, setCircuitVersions] = useState([]);
  const [poleResult, setPoleResult] = useState(null);
  const [raceWinnerResult, setRaceWinnerResult] = useState(null);
  const { countryByCode } = useCountries();

  useEffect(() => {
    return onAuthChanged(() => {
      setIsAdmin(getAccessTokenRole() === "admin");
    });
  }, []);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [
          eventData,
          entryData,
          sessionData,
          sessionCountData,
          standingsCountData,
          dotdCountData,
          qualifyingResults,
          raceResults,
        ] = await Promise.all([
          apiGet(`/events/${eventId}`),
          apiGet(`/event-entries/by-event/${eventId}`),
          apiGet(`/sessions/by-event/${eventId}`),
          apiGet(`/session-results/counts/by-event/${eventId}`),
          apiGet(`/standings/count/by-event/${eventId}`),
          apiGet(`/driver-of-the-day/count/by-event/${eventId}`),
          apiGet(`/session-results/by-event/${eventId}?session_type=QUALI`),
          apiGet(`/session-results/by-event/${eventId}?session_type=RACE`),
        ]);
        if (isActive) {
          setEvent(eventData);
          setSessions(sessionData);
          setSessionCounts(sessionCountData?.by_session_type || {});
          setFastestLapCount(sessionCountData?.fastest_lap || 0);
          setEntriesCount(entryData.length);
          setStandingsCount(standingsCountData?.count || 0);
          setDriverOfTheDayCount(dotdCountData?.count || 0);
          const resolvePositionOne = (items) =>
            items.find((item) => String(item.position) === "1") ||
            items.find((item) => Number.parseInt(item.position, 10) === 1) ||
            null;
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
          setEntries(
            entryData
              .slice()
              .sort((a, b) =>
                (a.team?.team_name || a.team?.short_name || "").localeCompare(
                  b.team?.team_name || b.team?.short_name || ""
                )
              )
          );
          setError("");
        }
        if (eventData?.season_id) {
          const seasonData = await apiGet(`/seasons/${eventData.season_id}`);
          if (isActive) {
            setSeasonYear(seasonData?.year ?? null);
          }
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load entries.");
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
          setSeasonEvents(Array.isArray(events) ? events : []);
        }
      } catch {
        if (isActive) {
          setPrevEvent(null);
          setNextEvent(null);
          setSeasonEvents([]);
        }
      }
    }
    loadNav();
    return () => {
      isActive = false;
    };
  }, [event?.season_id, eventId]);

  useEffect(() => {
    if (!event?.circuit?.id) return;
    let isActive = true;

    async function loadCircuitVersions() {
      try {
        const data = await apiGet(
          `/circuit-versions/by-circuit/${event.circuit.id}`
        );
        if (!isActive) return;
        setCircuitVersions(Array.isArray(data) ? data : []);
      } catch {
        if (isActive) {
          setCircuitVersions([]);
        }
      }
    }

    loadCircuitVersions();
    return () => {
      isActive = false;
    };
  }, [event?.circuit?.id]);

  useEffect(() => {
    const entryId = searchParams.get("entryId");
    if (!entryId) return;
    if (openedEntryRef.current === entryId) return;
    openedEntryRef.current = entryId;
    openEditModal(Number(entryId));
  }, [searchParams]);

  useEffect(() => {
    setActiveTab(
      resolveActiveEventTab(eventBase, location.pathname, location.search)
    );
  }, [eventId, location.pathname, location.search]);

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

  const formatEngine = (car) => {
    const engine = car?.engine;
    if (!engine) return "—";
    const constructorName =
      engine.tagged_indicator && engine.tagged_name
        ? engine.tagged_name
        : engine.constructor?.name || engine.constructor?.short_name || "";
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

  const formatTire = (tire) => {
    if (!tire) return "—";
    return tire.manufactor_name || tire.short_name || "—";
  };

  const formatDriverOption = (driver) => {
    const last = driver.last_name || "";
    const first = driver.first_name || "";
    const label = [last, first].filter((value) => value).join(", ");
    return label || driver.short_name || `Driver ${driver.id}`;
  };

  const formatCarOption = (car) => car.chassis_name || `Car ${car.id}`;

  const formatTeamOption = (team) =>
    team.team_name || team.short_name || `Team ${team.id}`;

  const formatTireOption = (tire) =>
    tire.manufactor_name || tire.short_name || `Tire ${tire.id}`;

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  };

  const sortArrow = (key) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? "↑" : "↓";
  };

  const sortedEntries = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const valueFor = (entry) => {
      if (sortKey === "team") return formatTeam(entry.team);
      if (sortKey === "engine") return formatEngine(entry.car);
      if (sortKey === "car") return formatCar(entry.car);
      if (sortKey === "tire") return formatTire(entry.tire);
      if (sortKey === "driver") return formatDriver(entry.driver);
      if (sortKey === "number") return entry.car_number ?? 0;
      return "";
    };
    return entries.slice().sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * dir;
      }
      return String(aValue).localeCompare(String(bValue)) * dir;
    });
  }, [entries, sortDir, sortKey]);

  // Events that occur before the current one in the same season, most recent
  // first. Used as copy sources so a cancelled previous event can be skipped.
  const previousEventOptions = useMemo(() => {
    const parsedCurrent = Number(eventId);
    const compare = (a, b) => {
      const dateA = a?.event_date ? new Date(a.event_date).getTime() : null;
      const dateB = b?.event_date ? new Date(b.event_date).getTime() : null;
      if (dateA !== null && dateB !== null && dateA !== dateB) {
        return dateA - dateB;
      }
      if (dateA !== null && dateB === null) return -1;
      if (dateA === null && dateB !== null) return 1;
      const roundA = a?.round ?? 0;
      const roundB = b?.round ?? 0;
      if (roundA !== roundB) return roundA - roundB;
      return (a?.id ?? 0) - (b?.id ?? 0);
    };
    const sorted = [...seasonEvents].sort(compare);
    const index = sorted.findIndex((evt) => evt.id === parsedCurrent);
    if (index <= 0) return [];
    return sorted.slice(0, index).reverse();
  }, [seasonEvents, eventId]);

  const openCopyPrevModal = () => {
    setCopyPrevError("");
    setCopySourceEventId(
      String(prevEvent?.id ?? previousEventOptions[0]?.id ?? "")
    );
    setIsCopyPrevConfirmOpen(true);
  };

  const fetchAll = async (path) => {
    let offset = 0;
    let items = [];
    while (true) {
      const batch = await apiGet(
        `${path}?limit=${PAGE_SIZE}&offset=${offset}`
      );
      items = items.concat(batch);
      if (batch.length < PAGE_SIZE) {
        break;
      }
      offset += PAGE_SIZE;
    }
    return items;
  };

  const sortDrivers = (items) =>
    items.slice().sort((a, b) => {
      const last = (a.last_name || "").localeCompare(b.last_name || "");
      if (last !== 0) return last;
      return (a.first_name || "").localeCompare(b.first_name || "");
    });

  const sortCars = (items) =>
    items.slice().sort((a, b) => {
      const aName = a.chassis_name || "";
      const bName = b.chassis_name || "";
      return aName.localeCompare(bName);
    });

  const sortTeams = (items) =>
    items.slice().sort((a, b) => {
      const aName = a.team_name || a.short_name || "";
      const bName = b.team_name || b.short_name || "";
      return aName.localeCompare(bName);
    });

  const sortTires = (items) =>
    items.slice().sort((a, b) => {
      const aName = a.abbreviation || a.short_name || "";
      const bName = b.abbreviation || b.short_name || "";
      return aName.localeCompare(bName);
    });

  const openEditModal = async (entryId) => {
    if (!canEdit) return;
    try {
      clearApiCache(`/event-entries/${entryId}`);
      const [entry, drivers, cars, teams, tires] = await Promise.all([
        apiGet(`/event-entries/${entryId}`),
        fetchAll("/drivers"),
        fetchAll("/cars"),
        fetchAll("/teams"),
        fetchAll("/tires"),
      ]);
      setEditingEntryId(entryId);
      setDriverOptions(sortDrivers(drivers));
      setCarOptions(sortCars(cars));
      setTeamOptions(sortTeams(teams));
      setTireOptions(sortTires(tires));
      setFormValues({
        event_id: entry.event_id ?? "",
        car_id: entry.car_id ?? "",
        driver_id: entry.driver_id ?? "",
        team_id: entry.team_id ?? "",
        tire_id: entry.tire_id ?? "",
        car_number: entry.car_number ?? "",
      });
      setSaveError("");
      setIsModalOpen(true);
    } catch (err) {
      setError(err.message || "Failed to load entry.");
    }
  };

  const openCreateModal = async () => {
    if (!canEdit) return;
    try {
      const [drivers, cars, teams, tires] = await Promise.all([
        fetchAll("/drivers"),
        fetchAll("/cars"),
        fetchAll("/teams"),
        fetchAll("/tires"),
      ]);
      setEditingEntryId(null);
      setCreatingEntry(true);
      setDriverOptions(sortDrivers(drivers));
      setCarOptions(sortCars(cars));
      setTeamOptions(sortTeams(teams));
      setTireOptions(sortTires(tires));
      setFormValues({
        event_id: event?.id ?? "",
        car_id: "",
        driver_id: "",
        team_id: "",
        tire_id: "",
        car_number: "",
      });
      setSaveError("");
      setIsModalOpen(true);
    } catch (err) {
      setError(err.message || "Failed to load entry options.");
    }
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const refreshOptionsAfterCreate = async (target) => {
    if (target === "drivers") {
      const drivers = await fetchAll("/drivers");
      setDriverOptions(sortDrivers(drivers));
      return;
    }
    if (target === "cars") {
      const cars = await fetchAll("/cars");
      setCarOptions(sortCars(cars));
      return;
    }
    if (target === "teams") {
      const teams = await fetchAll("/teams");
      setTeamOptions(sortTeams(teams));
      return;
    }
    if (target === "tires") {
      const tires = await fetchAll("/tires");
      setTireOptions(sortTires(tires));
    }
  };

  const openInlineCreateModal = (target, fieldName) => {
    openCreate({
      target,
      source: "event-entry-modal",
      field: fieldName,
      onCreated: async (createdEntity) => {
        await refreshOptionsAfterCreate(target);
        if (createdEntity?.id != null) {
          setFormValues((prev) => ({ ...prev, [fieldName]: String(createdEntity.id) }));
        }
      },
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!editingEntryId && !creatingEntry) return;
    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        event_id: formValues.event_id ? Number(formValues.event_id) : null,
        car_id: formValues.car_id ? Number(formValues.car_id) : null,
        driver_id: formValues.driver_id ? Number(formValues.driver_id) : null,
        team_id: formValues.team_id ? Number(formValues.team_id) : null,
        tire_id: formValues.tire_id ? Number(formValues.tire_id) : null,
        car_number: formValues.car_number ? Number(formValues.car_number) : null,
      };
      const response = await apiFetch(
        creatingEntry ? "/event-entries" : `/event-entries/${editingEntryId}`,
        {
          method: creatingEntry ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update entry.");
      }
      await response.json();
      clearApiCache(`/event-entries/by-event/${eventId}`);
      const refreshed = await apiGet(`/event-entries/by-event/${eventId}`);
      setEntries(
        refreshed
          .slice()
          .sort((a, b) =>
            (a.team?.team_name || a.team?.short_name || "").localeCompare(
              b.team?.team_name || b.team?.short_name || ""
            )
          )
      );
      setEntriesCount(Array.isArray(refreshed) ? refreshed.length : 0);
      setIsModalOpen(false);
      setCreatingEntry(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingEntryId) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const response = await apiFetch(`/event-entries/${editingEntryId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete entry.");
      }
      clearApiCache(`/event-entries/by-event/${eventId}`);
      const refreshed = await apiGet(`/event-entries/by-event/${eventId}`);
      setEntries(
        refreshed
          .slice()
          .sort((a, b) =>
            (a.team?.team_name || a.team?.short_name || "").localeCompare(
              b.team?.team_name || b.team?.short_name || ""
            )
          )
      );
      setEntriesCount(Array.isArray(refreshed) ? refreshed.length : 0);
      setIsDeleteModalOpen(false);
      setIsModalOpen(false);
      setCreatingEntry(false);
      setEditingEntryId(null);
    } catch (err) {
      setDeleteError(err.message || "Failed to delete entry.");
    } finally {
      setDeleting(false);
    }
  };

  const readErrorMessage = async (response, fallbackMessage) => {
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const payload = await response.json();
        if (typeof payload?.detail === "string") return payload.detail;
      }
    } catch {
      // Fall back to plain text response.
    }
    try {
      const message = await response.text();
      return message || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  };

  const handleCopyFromPreviousEvent = async () => {
    if (!eventId || !isAdmin) return;
    setCopyPrevLoading(true);
    setCopyPrevError("");
    setCopyPrevStatus("");
    try {
      const sourceQuery = copySourceEventId
        ? `?source_event_id=${copySourceEventId}`
        : "";
      const response = await apiFetch(
        `/event-entries/by-event/${eventId}/copy-from-previous${sourceQuery}`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            "Failed to copy entries from previous event."
          )
        );
      }
      const payload = await response.json();
      clearApiCache(`/event-entries/by-event/${eventId}`);
      const refreshed = await apiGet(`/event-entries/by-event/${eventId}`);
      setEntries(
        refreshed
          .slice()
          .sort((a, b) =>
            (a.team?.team_name || a.team?.short_name || "").localeCompare(
              b.team?.team_name || b.team?.short_name || ""
            )
          )
      );
      setEntriesCount(Array.isArray(refreshed) ? refreshed.length : 0);
      setCopyPrevStatus(
        `Copied ${payload?.copied_count || 0} entries from event ${payload?.previous_event_id || "?"}. Skipped ${payload?.skipped_count || 0}.`
      );
      setIsCopyPrevConfirmOpen(false);
    } catch (err) {
      setCopyPrevError(err.message || "Failed to copy entries from previous event.");
    } finally {
      setCopyPrevLoading(false);
    }
  };

  return (
    <div className="page">
      <EventDetailHeader
        event={event}
        sessions={sessions}
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
          />
        }
        tabs={tabs}
        activeTab={activeTab}
      />

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
          <div className="status-card">Loading entries…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <>
          <SessionBanner title="Entry List" />
          <div className="tab-panel">
            {copyPrevError ? (
              <div className="status-card error">{copyPrevError}</div>
            ) : null}
            {copyPrevStatus ? <div className="status-card">{copyPrevStatus}</div> : null}
            <TableWrapper>
              <DataTable className="data-table--plain">
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSort("team")}
                      >
                        Team {sortArrow("team")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSort("car")}
                      >
                        Car {sortArrow("car")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSort("engine")}
                      >
                        Engine {sortArrow("engine")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSort("tire")}
                      >
                        Tire {sortArrow("tire")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSort("number")}
                      >
                        Car Number {sortArrow("number")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSort("driver")}
                      >
                        Driver {sortArrow("driver")}
                      </button>
                    </th>
                    {canEdit ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {entry.team?.id ? (
                          <Link
                            to={`/teams/${entry.team.slug}`}
                            className="table-link"
                          >
                            {formatTeam(entry.team)}
                          </Link>
                        ) : (
                          formatTeam(entry.team)
                        )}
                      </td>
                      <td>
                        {entry.car?.id ? (
                          <Link
                            to={`/cars/${entry.car.slug}`}
                            className="table-link"
                          >
                            {formatCar(entry.car)}
                          </Link>
                        ) : (
                          formatCar(entry.car)
                        )}
                      </td>
                      <td>
                        {entry.car?.engine?.id ? (
                          <Link
                            to={`/engines/${entry.car.engine.slug}`}
                            className="table-link"
                          >
                            {formatEngine(entry.car)}
                          </Link>
                        ) : (
                          formatEngine(entry.car)
                        )}
                      </td>
                      <td>{formatTire(entry.tire)}</td>
                      <td>{entry.car_number ?? "—"}</td>
                      <td>
                        {entry.driver?.id ? (
                          <Link
                            to={`/drivers/${entry.driver.slug}`}
                            className="table-link"
                          >
                            <DriverName
                              driver={entry.driver}
                              countryByCode={countryByCode}
                            />
                          </Link>
                        ) : (
                          <DriverName
                            driver={entry.driver}
                            countryByCode={countryByCode}
                          />
                        )}
                      </td>
                      {canEdit ? (
                        <td>
                          <button
                            type="button"
                            className="ghost-button icon-action"
                            aria-label="Update entry"
                            title="Update entry"
                            onClick={() => openEditModal(entry.id)}
                          >
                            {editIcon}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </TableWrapper>
            <div className="tab-actions">
              {canEdit && isAdmin ? (
                <button
                  type="button"
                  className="ghost-button"
                  onClick={openCopyPrevModal}
                  disabled={copyPrevLoading}
                >
                  {copyPrevLoading
                    ? "Copying from previous…"
                    : "Copy from previous event"}
                </button>
              ) : null}
              {canEdit ? (
                <Link
                  to={`${eventBase}/entry-compare`}
                  className="ghost link-pill"
                >
                  Compare entries
                </Link>
              ) : null}
              {canEdit ? (
                <button type="button" className="pill" onClick={openCreateModal}>
                  Create entry
                </button>
              ) : null}
            </div>
          </div>
          </>
        )}
      </section>

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{creatingEntry ? "Create entry" : "Update entry"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setIsModalOpen(false);
                  setCreatingEntry(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid entry-modal-form-grid">
                <label>
                  Event
                  <select
                    name="event_id"
                    value={formValues.event_id}
                    onChange={handleFieldChange}
                  >
                    <option value="">Select event</option>
                    {event ? (
                      <option value={event.id}>
                        {event.event_name || `Event ${event.id}`}
                      </option>
                    ) : null}
                  </select>
                </label>
                <label>
                  Team
                  <div className="modal-select-with-create">
                    <select
                      name="team_id"
                      value={formValues.team_id}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select team</option>
                      {teamOptions.map((team) => (
                        <option key={team.id} value={team.id}>
                          {formatTeamOption(team)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost-button inline-create-button"
                      title="Create team"
                      aria-label="Create team"
                      onClick={() => openInlineCreateModal("teams", "team_id")}
                    >
                      +
                    </button>
                  </div>
                </label>
                <label>
                  Car
                  <div className="modal-select-with-create">
                    <select
                      name="car_id"
                      value={formValues.car_id}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select car</option>
                      {carOptions.map((car) => (
                        <option key={car.id} value={car.id}>
                          {formatCarOption(car)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost-button inline-create-button"
                      title="Create car"
                      aria-label="Create car"
                      onClick={() => openInlineCreateModal("cars", "car_id")}
                    >
                      +
                    </button>
                  </div>
                </label>
                <label>
                  Tire
                  <div className="modal-select-with-create">
                    <select
                      name="tire_id"
                      value={formValues.tire_id}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select tire</option>
                      {tireOptions.map((tire) => (
                        <option key={tire.id} value={tire.id}>
                          {formatTireOption(tire)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost-button inline-create-button"
                      title="Create tire"
                      aria-label="Create tire"
                      onClick={() => openInlineCreateModal("tires", "tire_id")}
                    >
                      +
                    </button>
                  </div>
                </label>
                <label>
                  Car number
                  <input
                    type="number"
                    name="car_number"
                    value={formValues.car_number}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Driver
                  <div className="modal-select-with-create">
                    <select
                      name="driver_id"
                      value={formValues.driver_id}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select driver</option>
                      {driverOptions.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {formatDriverOption(driver)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost-button inline-create-button"
                      title="Create driver"
                      aria-label="Create driver"
                      onClick={() =>
                        openInlineCreateModal("drivers", "driver_id")
                      }
                    >
                      +
                    </button>
                  </div>
                </label>
              </div>
              {saveError && <div className="status-card error">{saveError}</div>}
              <div className="modal-actions">
                {!creatingEntry && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setDeleteError("");
                      setIsDeleteModalOpen(true);
                    }}
                  >
                    Delete entry
                  </button>
                )}
                {!creatingEntry && (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => {
                      setCreatingEntry(true);
                      setEditingEntryId(null);
                    }}
                  >
                    Duplicate
                  </button>
                )}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setCreatingEntry(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving
                    ? creatingEntry
                      ? "Creating…"
                      : "Saving…"
                    : creatingEntry
                    ? "Create entry"
                    : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canEdit ? (
        <ConfirmModal
          isOpen={isDeleteModalOpen}
          title="Delete entry?"
          message="This will permanently remove the entry from this event and cannot be undone."
          confirmLabel="Delete entry"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteModalOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}

      {canEdit && isAdmin ? (
        <ConfirmModal
          isOpen={isCopyPrevConfirmOpen}
          title="Copy entries from a previous event?"
          message="This copies missing entries (drivers not already entered) from the selected event into this one. Pick a different source if the immediately preceding event was cancelled."
          confirmLabel="Copy entries"
          loadingLabel="Copying…"
          confirmClassName="pill"
          onConfirm={handleCopyFromPreviousEvent}
          onCancel={() => setIsCopyPrevConfirmOpen(false)}
          isLoading={copyPrevLoading}
          confirmDisabled={!copySourceEventId}
          error={copyPrevError}
        >
          <label className="modal-field">
            Copy from
            {previousEventOptions.length ? (
              <select
                value={copySourceEventId}
                onChange={(e) => setCopySourceEventId(e.target.value)}
              >
                {previousEventOptions.map((evt) => (
                  <option key={evt.id} value={evt.id}>
                    {evt.round != null ? `Round ${evt.round} — ` : ""}
                    {evt.event_name || `Event ${evt.id}`}
                  </option>
                ))}
              </select>
            ) : (
              <span className="status-card">
                No earlier event in this season to copy from.
              </span>
            )}
          </label>
        </ConfirmModal>
      ) : null}
    </div>
  );
}
