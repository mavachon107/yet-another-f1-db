import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { apiFetch, apiGet, clearApiCache, readErrorMessage } from "../lib/api.js";
import { buildEventTabs, resolveActiveEventTab } from "../lib/eventTabs.js";
import { resolvePrevNextEvents } from "../lib/eventNavigation.js";
import DataTable from "../components/DataTable.jsx";
import EventDetailHeader from "../components/EventDetailHeader.jsx";
import EventHighlights from "../components/EventHighlights.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import useCountries from "../hooks/useCountries.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import SessionBanner from "../components/SessionBanner.jsx";

export default function FastestLapsDetail() {
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const location = useLocation();
  const canEdit = useAuthStatus();
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
  const [circuitVersions, setCircuitVersions] = useState([]);
  const [poleResult, setPoleResult] = useState(null);
  const [raceWinnerResult, setRaceWinnerResult] = useState(null);
  const [fastestLapResults, setFastestLapResults] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("fastest-lap");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValues, setFormValues] = useState({ entry_id: "", laps: "", time: "", speed_trap: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchStatus, setFetchStatus] = useState("");
  const { countryByCode } = useCountries();

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
          fastestLapData,
          entryData,
        ] = await Promise.all([
          apiGet(`/events/${eventId}`),
          apiGet(`/sessions/by-event/${eventId}`),
          apiGet(`/session-results/counts/by-event/${eventId}`),
          apiGet(`/event-entries/count/by-event/${eventId}`),
          apiGet(`/standings/count/by-event/${eventId}`),
          apiGet(`/driver-of-the-day/count/by-event/${eventId}`),
          apiGet(`/session-results/by-event/${eventId}?session_type=QUALI`),
          apiGet(`/session-results/by-event/${eventId}?session_type=RACE`),
          apiGet(`/session-results/fastest-laps/by-event/${eventId}`),
          apiGet(`/event-entries/by-event/${eventId}`),
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
          setSessions(sessionData);
          setSessionCounts(sessionCountData?.by_session_type || {});
          setFastestLapCount(sessionCountData?.fastest_lap || 0);
          setEntriesCount(entryCountData?.count || 0);
          setStandingsCount(standingsCountData?.count || 0);
          setDriverOfTheDayCount(dotdCountData?.count || 0);
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
          setFastestLapResults(fastestLapData || []);
          setEntries(Array.isArray(entryData) ? entryData : []);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load fastest laps.");
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

  const formatTeam = (team) => {
    if (!team) return "—";
    return team.team_name || team.short_name;
  };

  const formatCar = (car) => {
    if (!car) return "—";
    return car.chassis_name || "—";
  };

  const formatEntryOption = (entry) => {
    if (!entry) return "Unknown entry";
    const driverName = [entry.driver?.first_name, entry.driver?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    const carNumber = entry.car_number ?? "—";
    const team = formatTeam(entry.team);
    const car = formatCar(entry.car);
    return `${carNumber} · ${driverName || "Unknown driver"} · ${team} · ${car}`;
  };

  const refreshFastestLaps = async () => {
    clearApiCache(`/session-results/fastest-laps/by-event/${eventId}`);
    const data = await apiGet(`/session-results/fastest-laps/by-event/${eventId}`);
    setFastestLapResults(Array.isArray(data) ? data : []);
  };

  const openCreateModal = () => {
    if (!canEdit) return;
    setFormValues({ entry_id: "", laps: "", time: "", speed_trap: "" });
    setSaveError("");
    setIsModalOpen(true);
  };

  const handleFormChange = (eventTarget) => {
    const { name, value } = eventTarget.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateFastestLap = async (eventTarget) => {
    eventTarget.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const entryId = formValues.entry_id ? Number(formValues.entry_id) : null;
      const laps = formValues.laps ? Number(formValues.laps) : null;
      const time = formValues.time || null;
      const speedTrap = formValues.speed_trap ? Number(formValues.speed_trap) : null;
      const response = await apiFetch("/session-results/fastest-laps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_id: Number(eventId),
          entry_id: entryId,
          laps,
          time,
          speed_trap: speedTrap,
        }),
      });
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Failed to create fastest lap.")
        );
      }
      await response.json();
      await refreshFastestLaps();
      setIsModalOpen(false);
    } catch (err) {
      setSaveError(err.message || "Failed to create fastest lap.");
    } finally {
      setSaving(false);
    }
  };

  const handleFetchFromOpenF1 = async () => {
    setFetchLoading(true);
    setFetchError("");
    setFetchStatus("");
    try {
      const response = await apiFetch(
        `/session-results/fastest-laps/by-event/${eventId}/openf1/fetch`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(response, "Failed to fetch from OpenF1.")
        );
      }
      const payload = await response.json();
      await refreshFastestLaps();
      setFetchStatus(
        `OpenF1 sync complete: ${payload?.created ?? 0} created, ${payload?.updated ?? 0} updated (${payload?.total ?? 0} total).`
      );
    } catch (err) {
      setFetchError(err.message || "Failed to fetch from OpenF1.");
    } finally {
      setFetchLoading(false);
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
          <div className="status-card">Loading fastest laps…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : fastestLapResults.length === 0 ? (
          <div className="tab-panel">
            <div className="status-card">No fastest laps recorded yet.</div>
            {fetchError ? <div className="status-card error">{fetchError}</div> : null}
            {fetchStatus ? <div className="status-card">{fetchStatus}</div> : null}
            {canEdit ? (
              <div className="tab-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleFetchFromOpenF1}
                  disabled={fetchLoading}
                >
                  {fetchLoading ? "Fetching…" : "Fetch from OpenF1"}
                </button>
                <button type="button" className="pill" onClick={openCreateModal}>
                  Create fastest lap
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
          <SessionBanner title="Fastest Laps" />
          <div className="tab-panel">
            <TableWrapper>
              <DataTable>
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Driver</th>
                    <th>Team</th>
                    <th>Car</th>
                    <th>Lap</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {fastestLapResults
                    .slice()
                    .sort((a, b) => {
                      if (a.time && b.time) return a.time.localeCompare(b.time);
                      if (a.time) return -1;
                      if (b.time) return 1;
                      return 0;
                    })
                    .map((result, index) => {
                    const entry = result.entry;
                    return (
                      <tr key={result.id}>
                        <td>{index + 1}</td>
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
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableWrapper>
            {fetchError ? <div className="status-card error">{fetchError}</div> : null}
            {fetchStatus ? <div className="status-card">{fetchStatus}</div> : null}
            {canEdit ? (
              <div className="tab-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={handleFetchFromOpenF1}
                  disabled={fetchLoading}
                >
                  {fetchLoading ? "Fetching…" : "Fetch from OpenF1"}
                </button>
                <button type="button" className="pill" onClick={openCreateModal}>
                  Create fastest lap
                </button>
              </div>
            ) : null}
          </div>
          </>
        )}
      </section>

      {canEdit && isModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Create fastest lap</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateFastestLap}>
              <div className="form-grid">
                <label className="form-span">
                  Entry
                  <select
                    name="entry_id"
                    value={formValues.entry_id}
                    onChange={handleFormChange}
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
                    value={formValues.laps}
                    onChange={handleFormChange}
                  />
                </label>
                <label>
                  Time
                  <input
                    name="time"
                    value={formValues.time}
                    onChange={handleFormChange}
                  />
                </label>
                <label>
                  Speed Trap (km/h)
                  <input
                    type="number"
                    step="0.1"
                    name="speed_trap"
                    value={formValues.speed_trap}
                    onChange={handleFormChange}
                  />
                </label>
              </div>
              {saveError ? <div className="status-card error">{saveError}</div> : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
