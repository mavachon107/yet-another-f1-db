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

export default function SpeedTrapDetail() {
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
  const [speedTrapResults, setSpeedTrapResults] = useState([]);
  const [activeTab, setActiveTab] = useState("speed-trap");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { countryByCode } = useCountries();

  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [fetchStatus, setFetchStatus] = useState("");

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
          setSpeedTrapResults(fastestLapData || []);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load speed trap data.");
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
        if (isActive) setCircuitVersions([]);
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

  const refreshSpeedTraps = async () => {
    clearApiCache(`/session-results/fastest-laps/by-event/${eventId}`);
    const data = await apiGet(`/session-results/fastest-laps/by-event/${eventId}`);
    setSpeedTrapResults(data || []);
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
      await refreshSpeedTraps();
      setFetchStatus(
        `OpenF1 sync complete: ${payload?.created ?? 0} created, ${payload?.updated ?? 0} updated (${payload?.total ?? 0} total).`
      );
    } catch (err) {
      setFetchError(err.message || "Failed to fetch from OpenF1.");
    } finally {
      setFetchLoading(false);
    }
  };

  const sortedSpeedTraps = useMemo(
    () =>
      speedTrapResults
        .filter((r) => r.speed_trap != null)
        .slice()
        .sort((a, b) => (b.speed_trap ?? 0) - (a.speed_trap ?? 0)),
    [speedTrapResults]
  );

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
          <div className="status-card">Loading speed trap data…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : sortedSpeedTraps.length === 0 ? (
          <div className="tab-panel">
            <div className="status-card">No speed trap data recorded yet.</div>
            {fetchError ? <div className="status-card error">{fetchError}</div> : null}
            {fetchStatus ? <div className="status-card">{fetchStatus}</div> : null}
            {canEdit ? (
              <div className="tab-actions">
                <button
                  type="button"
                  className="pill"
                  onClick={handleFetchFromOpenF1}
                  disabled={fetchLoading}
                >
                  {fetchLoading ? "Fetching…" : "Fetch from OpenF1"}
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
          <SessionBanner title="Speed Trap" />
          <div className="tab-panel">
            <TableWrapper>
              <DataTable>
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Driver</th>
                    <th>Lap</th>
                    <th>Max Speed</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedSpeedTraps.map((result, index) => {
                    const entry = result.entry;
                    return (
                      <tr key={result.id}>
                        <td>{index + 1}</td>
                        <td>
                          {entry?.driver ? (
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
                            "—"
                          )}
                        </td>
                        <td>{result.laps ?? "—"}</td>
                        <td>
                          {result.speed_trap != null
                            ? `${result.speed_trap} km/h`
                            : "—"}
                        </td>
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
                  className="pill"
                  onClick={handleFetchFromOpenF1}
                  disabled={fetchLoading}
                >
                  {fetchLoading ? "Fetching…" : "Fetch from OpenF1"}
                </button>
              </div>
            ) : null}
          </div>
          </>
        )}
      </section>
    </div>
  );
}
