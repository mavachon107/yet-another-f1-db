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

export default function StandingDetail() {
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
  const [driverStandings, setDriverStandings] = useState([]);
  const [constructorStandings, setConstructorStandings] = useState([]);
  const [dotdStandings, setDotdStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [activeTab, setActiveTab] = useState("standings");
  const [activeStandingSection, setActiveStandingSection] = useState("driver");
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
          driverStandingsData,
          constructorStandingsData,
          dotdStandingsData,
          qualifyingResults,
          raceResults,
        ] = await Promise.all([
          apiGet(`/events/${eventId}`),
          apiGet(`/sessions/by-event/${eventId}`),
          apiGet(`/session-results/counts/by-event/${eventId}`),
          apiGet(`/event-entries/count/by-event/${eventId}`),
          apiGet(`/standings/count/by-event/${eventId}`),
          apiGet(`/driver-of-the-day/count/by-event/${eventId}`),
          apiGet(`/standings/by-event/${eventId}?standing_type=DRIVER`),
          apiGet(`/standings/by-event/${eventId}?standing_type=CONSTRUCTOR`),
          apiGet(`/driver-of-the-day/standings/by-event/${eventId}`),
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
          setSessions(sessionData);
          setSessionCounts(sessionCountData?.by_session_type || {});
          setFastestLapCount(sessionCountData?.fastest_lap || 0);
          setEntriesCount(entryCountData?.count || 0);
          setStandingsCount(standingsCountData?.count || 0);
          setDriverOfTheDayCount(dotdCountData?.count || 0);
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
          setDriverStandings(
            (driverStandingsData || [])
              .slice()
              .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
          );
          setConstructorStandings(
            (constructorStandingsData || [])
              .slice()
              .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
          );
          setDotdStandings(
            (dotdStandingsData || [])
              .slice()
              .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
          );
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load standings.");
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

  const refreshStandings = async () => {
    clearApiCache(`/standings/by-event/${eventId}`);
    clearApiCache(`/standings/count/by-event/${eventId}`);
    clearApiCache(`/driver-of-the-day/standings/by-event/${eventId}`);
    const [standingsCountData, driverStandingsData, constructorStandingsData, dotdStandingsData] = await Promise.all([
      apiGet(`/standings/count/by-event/${eventId}`),
      apiGet(`/standings/by-event/${eventId}?standing_type=DRIVER`),
      apiGet(`/standings/by-event/${eventId}?standing_type=CONSTRUCTOR`),
      apiGet(`/driver-of-the-day/standings/by-event/${eventId}`),
    ]);
    setStandingsCount(standingsCountData?.count || 0);
    setDriverStandings(
      (driverStandingsData || [])
        .slice()
        .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
    );
    setConstructorStandings(
      (constructorStandingsData || [])
        .slice()
        .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
    );
    setDotdStandings(
      (dotdStandingsData || [])
        .slice()
        .sort((a, b) => (a.position ?? 9999) - (b.position ?? 9999))
    );
  };

  const handleUpdateStandings = async () => {
    if (!eventId) return;
    setUpdateLoading(true);
    setUpdateError("");
    setUpdateStatus("");
    try {
      const response = await apiFetch(
        `/standings/by-event/${eventId}/recalculate-driver-from-race`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            "Failed to update standings from previous event and race points."
          )
        );
      }
      const payload = await response.json();
      await refreshStandings();
      setUpdateStatus(
        `Standings updated: ${payload?.updated_count ?? 0} updated, ${
          payload?.created_count ?? 0
        } created (${payload?.total_count ?? 0} total).`
      );
    } catch (err) {
      setUpdateError(
        err.message || "Failed to update standings from previous event and race points."
      );
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleUpdateConstructorStandings = async () => {
    if (!eventId) return;
    setUpdateLoading(true);
    setUpdateError("");
    setUpdateStatus("");
    try {
      const response = await apiFetch(
        `/standings/by-event/${eventId}/recalculate-constructor-from-race`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            "Failed to update constructor standings from previous event and race points."
          )
        );
      }
      const payload = await response.json();
      await refreshStandings();
      setUpdateStatus(
        `Constructor standings updated: ${payload?.updated_count ?? 0} updated, ${
          payload?.created_count ?? 0
        } created (${payload?.total_count ?? 0} total).`
      );
    } catch (err) {
      setUpdateError(
        err.message ||
          "Failed to update constructor standings from previous event and race points."
      );
    } finally {
      setUpdateLoading(false);
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
        <SessionBanner title="Standings" />
        {loading ? (
          <div className="status-card">Loading driver standings…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <div className="tab-panel">
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
              <button
                type="button"
                className={`tab-button${activeStandingSection === "dotd" ? " is-active" : ""}`}
                onClick={() => setActiveStandingSection("dotd")}
              >
                Driver of the Day ({dotdStandings.length})
              </button>
            </div>
            {updateError ? <div className="status-card error">{updateError}</div> : null}
            {updateStatus ? <div className="status-card">{updateStatus}</div> : null}
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
            ) : activeStandingSection === "constructor" ? (
              constructorStandings.length === 0 ? (
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
                          <td>{standing.constructor?.name || standing.constructor?.short_name || "—"}</td>
                          <td>{standing.points ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrapper>
              )
            ) : dotdStandings.length === 0 ? (
              <div className="status-card">No Driver of the Day standings recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Pos</th>
                      <th>Driver</th>
                      <th>Wins</th>
                      <th>Avg %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dotdStandings.map((standing, index) => (
                      <tr key={standing.driver?.id ?? index}>
                        <td>{standing.position ?? "—"}</td>
                        <td>
                          <DriverName
                            driver={standing.driver}
                            countryByCode={countryByCode}
                          />
                        </td>
                        <td>{standing.wins ?? "—"}</td>
                        <td>
                          {standing.average_percentage != null
                            ? `${standing.average_percentage.toFixed(2)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrapper>
            )}
            {canEdit && activeStandingSection !== "dotd" ? (
              <div className="tab-actions">
                <button
                  type="button"
                  className="pill"
                  onClick={
                    activeStandingSection === "driver"
                      ? handleUpdateStandings
                      : handleUpdateConstructorStandings
                  }
                  disabled={updateLoading}
                >
                  {updateLoading
                    ? "Updating…"
                    : activeStandingSection === "driver"
                    ? "Update driver standings from race"
                    : "Update constructor standings from race"}
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
