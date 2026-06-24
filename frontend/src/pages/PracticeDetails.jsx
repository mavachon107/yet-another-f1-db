import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";
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

export default function PracticeDetails() {
  const canEdit = useAuthStatus();
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const location = useLocation();
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
  const [entryOptions, setEntryOptions] = useState([]);
  const [practiceSessionIds, setPracticeSessionIds] = useState({
    fp1: null,
    fp2: null,
    fp3: null,
  });
  const [circuitVersions, setCircuitVersions] = useState([]);
  const [poleResult, setPoleResult] = useState(null);
  const [raceWinnerResult, setRaceWinnerResult] = useState(null);
  const [fp1Results, setFp1Results] = useState([]);
  const [fp2Results, setFp2Results] = useState([]);
  const [fp3Results, setFp3Results] = useState([]);
  const [practiceLoaded, setPracticeLoaded] = useState(false);
  const [activePracticeTab, setActivePracticeTab] = useState("fp1");
  const [activeTab, setActiveTab] = useState("practice");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [creatingResult, setCreatingResult] = useState(false);
  const [editingResultId, setEditingResultId] = useState(null);
  const [formValues, setFormValues] = useState({
    session_id: "",
    entry_id: "",
    shared_drive_entry_id: "",
    position: "",
    time: "",
    gap: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { countryByCode } = useCountries();

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [
          eventData,
          sessionData,
          sessionCountData,
          entryData,
          entryCountData,
          standingsCountData,
          dotdCountData,
          qualifyingResults,
          raceResults,
          fp1Data,
          fp2Data,
          fp3Data,
        ] = await Promise.all([
          apiGet(`/events/${eventId}`),
          apiGet(`/sessions/by-event/${eventId}`),
          apiGet(`/session-results/counts/by-event/${eventId}`),
          apiGet(`/event-entries/by-event/${eventId}`),
          apiGet(`/event-entries/count/by-event/${eventId}`),
          apiGet(`/standings/count/by-event/${eventId}`),
          apiGet(`/driver-of-the-day/count/by-event/${eventId}`),
          apiGet(`/session-results/by-event/${eventId}?session_type=QUALI`),
          apiGet(`/session-results/by-event/${eventId}?session_type=RACE`),
          apiGet(`/session-results/by-event/${eventId}?session_type=FP1`),
          apiGet(`/session-results/by-event/${eventId}?session_type=FP2`),
          apiGet(`/session-results/by-event/${eventId}?session_type=FP3`),
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
          setEntryOptions(
            entryData
              .slice()
              .sort((a, b) => (a.car_number ?? 999) - (b.car_number ?? 999))
          );
          setPracticeSessionIds({
            fp1:
              sessionData.find(
                (sessionItem) => String(sessionItem.type).toUpperCase() === "FP1"
              )?.id ?? null,
            fp2:
              sessionData.find(
                (sessionItem) => String(sessionItem.type).toUpperCase() === "FP2"
              )?.id ?? null,
            fp3:
              sessionData.find(
                (sessionItem) => String(sessionItem.type).toUpperCase() === "FP3"
              )?.id ?? null,
          });
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
          setFp1Results(fp1Data);
          setFp2Results(fp2Data);
          setFp3Results(fp3Data);
          setPracticeLoaded(true);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load practice results.");
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

  const refreshPracticeResults = async () => {
    try {
      clearApiCache(`/session-results/by-event/${eventId}`);
      clearApiCache(`/session-results/counts/by-event/${eventId}`);
      const [fp1Data, fp2Data, fp3Data, sessionCountData] = await Promise.all([
        apiGet(`/session-results/by-event/${eventId}?session_type=FP1`),
        apiGet(`/session-results/by-event/${eventId}?session_type=FP2`),
        apiGet(`/session-results/by-event/${eventId}?session_type=FP3`),
        apiGet(`/session-results/counts/by-event/${eventId}`),
      ]);
      setFp1Results(fp1Data);
      setFp2Results(fp2Data);
      setFp3Results(fp3Data);
      setSessionCounts(sessionCountData?.by_session_type || {});
    } catch (err) {
      setError(err.message || "Failed to refresh practice results.");
    }
  };

  const openCreateModal = () => {
    if (!canEdit) return;
    const sessionId = practiceSessionIds[activePracticeTab];
    setCreatingResult(true);
    setEditingResultId(null);
    setFormValues({
      session_id: sessionId ? String(sessionId) : "",
      entry_id: "",
      shared_drive_entry_id: "",
      position: "",
      time: "",
      gap: "",
    });
    setSaveError("");
    setIsModalOpen(true);
  };

  const openEditModal = async (resultId) => {
    if (!canEdit) return;
    try {
      clearApiCache(`/session-results/${resultId}`);
      const result = await apiGet(`/session-results/${resultId}`);
      setEditingResultId(resultId);
      setCreatingResult(false);
      setFormValues({
        session_id: result.session_id ?? "",
        entry_id: result.entry_id ?? "",
        shared_drive_entry_id: result.shared_drive_entry_id ?? "",
        position: result.position ?? "",
        time: result.time ?? "",
        gap: result.gap ?? "",
      });
      setSaveError("");
      setIsModalOpen(true);
    } catch (err) {
      setError(err.message || "Failed to load practice result.");
    }
  };

  const handleFieldChange = (eventTarget) => {
    const { name, value } = eventTarget.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (eventTarget) => {
    eventTarget.preventDefault();
    if (creatingResult && (!formValues.session_id || !formValues.entry_id)) {
      setSaveError("Session and entry are required.");
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        session_id: Number(formValues.session_id),
        entry_id: Number(formValues.entry_id),
        shared_drive_entry_id: formValues.shared_drive_entry_id
          ? Number(formValues.shared_drive_entry_id)
          : null,
        position: formValues.position || null,
        time: formValues.time || null,
        gap: formValues.gap || null,
      };
      const url = creatingResult
        ? "/session-results"
        : `/session-results/${editingResultId}`;
      const response = await apiFetch(url, {
        method: creatingResult ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save practice entry.");
      }
      await response.json();
      await refreshPracticeResults();
      setIsModalOpen(false);
      setCreatingResult(false);
      setEditingResultId(null);
    } catch (err) {
      setSaveError(err.message || "Failed to save practice entry.");
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="page">
      <SeoHead
        title={event?.event_name || "Event"}
        description="Formula 1 event results, sessions, and details."
      />
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
          <div className="status-card">Loading practice results…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <>
          <SessionBanner
            session={sessions.find((s) => s.type === activePracticeTab.toUpperCase())}
            sessionType={activePracticeTab.toUpperCase()}
            canEdit={canEdit}
            eventId={eventId}
            circuitTimezone={event?.circuit?.timezone}
            onSessionUpdated={async () => {
              const data = await apiGet(`/sessions/by-event/${eventId}`);
              setSessions(data);
            }}
          />
          <div className="tab-panel">
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
                return <div className="status-card">Loading practice results…</div>;
              }
              if (practiceSession?.is_cancelled) {
                return (
                  <div className="status-card">
                    Session cancelled: {practiceSession.cancel_reason || "No reason provided"}
                  </div>
                );
              }
              return practiceResults.length === 0 ? (
                <div className="status-card">No free practice results recorded yet.</div>
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
                                  <th>Laps</th>
                                  {canEdit ? <th>Action</th> : null}
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
                                      <td>{result.laps ?? "—"}</td>
                                      {canEdit ? (
                                        <td>
                                          <button
                                            type="button"
                                            className="ghost-button icon-action"
                                            aria-label="Update practice result"
                                            title="Update practice result"
                                            onClick={() => openEditModal(result.id)}
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
              );
            })()}
            {canEdit ? (
              <div className="tab-actions">
                <button type="button" className="pill" onClick={openCreateModal}>
                  Create practice entry
                </button>
              </div>
            ) : null}
          </div>
          </>
        )}
      </section>

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{creatingResult ? "Create practice entry" : "Update entry"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setIsModalOpen(false);
                  setCreatingResult(false);
                  setEditingResultId(null);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>
                  Session
                  <select
                    name="session_id"
                    value={formValues.session_id}
                    onChange={handleFieldChange}
                    required
                  >
                    <option value="">Select session</option>
                    {practiceSessionIds.fp1 ? (
                      <option value={practiceSessionIds.fp1}>Practice 1</option>
                    ) : null}
                    {practiceSessionIds.fp2 ? (
                      <option value={practiceSessionIds.fp2}>Practice 2</option>
                    ) : null}
                    {practiceSessionIds.fp3 ? (
                      <option value={practiceSessionIds.fp3}>Practice 3</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  Entry
                  <select
                    name="entry_id"
                    value={formValues.entry_id}
                    onChange={handleFieldChange}
                    required
                  >
                    <option value="">Select entry</option>
                    {entryOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.car_number ? `#${entry.car_number} ` : ""}
                        {entry.driver?.first_name || ""}{" "}
                        {entry.driver?.last_name || ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Shared / sub for
                  <select
                    name="shared_drive_entry_id"
                    value={formValues.shared_drive_entry_id}
                    onChange={handleFieldChange}
                  >
                    <option value="">— none —</option>
                    {entryOptions
                      .filter(
                        (entry) =>
                          String(entry.id) !== String(formValues.entry_id)
                      )
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.car_number ? `#${entry.car_number} ` : ""}
                          {entry.driver?.first_name || ""}{" "}
                          {entry.driver?.last_name || ""}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Position
                  <input
                    name="position"
                    value={formValues.position}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Time
                  <input
                    name="time"
                    value={formValues.time}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Gap
                  <input
                    name="gap"
                    value={formValues.gap}
                    onChange={handleFieldChange}
                  />
                </label>
              </div>
              {saveError && <div className="status-card error">{saveError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setCreatingResult(false);
                    setEditingResultId(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving ? "Saving…" : creatingResult ? "Create entry" : "Update entry"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
