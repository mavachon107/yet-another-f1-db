import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router-dom";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";
import DataTable from "../components/DataTable.jsx";
import EventDetailHeader from "../components/EventDetailHeader.jsx";
import EventHighlights from "../components/EventHighlights.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import PenaltyEditor, { formatPenalty } from "../components/PenaltyEditor.jsx";
import useCountries from "../hooks/useCountries.js";
import { buildEventTabs, resolveActiveEventTab } from "../lib/eventTabs.js";
import { resolvePrevNextEvents } from "../lib/eventNavigation.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import SessionBanner from "../components/SessionBanner.jsx";

const emptyForm = {
  session_id: "",
  entry_id: "",
  shared_drive_entry_id: "",
  position: "",
  points: "",
  time: "",
  gap: "",
  interval: "",
  laps: "",
  time_penalty: "",
  grid_position: "",
  retired_reason: "",
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

export default function QualifyingDetails() {
  const canEdit = useAuthStatus();
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openedResultRef = useRef(null);
  const isSprintQualifying = location.pathname.includes("/sprint-qualifying");
  const sessionType = (
    searchParams.get("sessionType") ||
    (isSprintQualifying ? "SQ" : "QUALI")
  ).toUpperCase();
  const q1Type = (
    searchParams.get("q1Type") ||
    (isSprintQualifying ? "SQ1" : "Q1")
  ).toUpperCase();
  const q2Type = (
    searchParams.get("q2Type") ||
    (isSprintQualifying ? "SQ2" : "Q2")
  ).toUpperCase();
  const q3Type = (
    searchParams.get("q3Type") ||
    (isSprintQualifying ? "SQ3" : "Q3")
  ).toUpperCase();
  const label =
    searchParams.get("label") ||
    (isSprintQualifying ? "Sprint Qualifying" : "Qualifying");
  const [event, setEvent] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [prevEvent, setPrevEvent] = useState(null);
  const [nextEvent, setNextEvent] = useState(null);
  const [results, setResults] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionCounts, setSessionCounts] = useState({});
  const [entriesCount, setEntriesCount] = useState(0);
  const [fastestLapCount, setFastestLapCount] = useState(0);
  const [standingsCount, setStandingsCount] = useState(0);
  const [driverOfTheDayCount, setDriverOfTheDayCount] = useState(0);
  const [activeTab, setActiveTab] = useState("qualifying");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingResultId, setEditingResultId] = useState(null);
  const [creatingResult, setCreatingResult] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [entryOptions, setEntryOptions] = useState([]);
  const [qualSessionId, setQualSessionId] = useState(null);
  const [qualifyingSessionIds, setQualifyingSessionIds] = useState({
    quali: null,
    q1: null,
    q2: null,
    q3: null,
  });
  const [sprintSessionIds, setSprintSessionIds] = useState({
    sq1: null,
    sq2: null,
    sq3: null,
  });
  const [circuitVersions, setCircuitVersions] = useState([]);
  const [poleResult, setPoleResult] = useState(null);
  const [raceWinnerResult, setRaceWinnerResult] = useState(null);
  const [q1Results, setQ1Results] = useState([]);
  const [q2Results, setQ2Results] = useState([]);
  const [q3Results, setQ3Results] = useState([]);
  const { countryByCode } = useCountries();

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [
          eventData,
          resultData,
          entryData,
          sessionData,
          sessionCountData,
          standingsCountData,
          dotdCountData,
          qualifyingResults,
          raceResults,
          q1Data,
          q2Data,
          q3Data,
        ] = await Promise.all([
          apiGet(`/events/${eventId}`),
          apiGet(
            `/session-results/by-event/${eventId}?session_type=${sessionType}`
          ),
          apiGet(`/event-entries/by-event/${eventId}`),
          apiGet(`/sessions/by-event/${eventId}`),
          apiGet(`/session-results/counts/by-event/${eventId}`),
          apiGet(`/standings/count/by-event/${eventId}`),
          apiGet(`/driver-of-the-day/count/by-event/${eventId}`),
          apiGet(`/session-results/by-event/${eventId}?session_type=QUALI`),
          apiGet(`/session-results/by-event/${eventId}?session_type=RACE`),
          apiGet(`/session-results/by-event/${eventId}?session_type=${q1Type}`),
          apiGet(`/session-results/by-event/${eventId}?session_type=${q2Type}`),
          apiGet(`/session-results/by-event/${eventId}?session_type=${q3Type}`),
        ]);
        if (isActive) {
          setEvent(eventData);
          setSessions(sessionData);
          setSessionCounts(sessionCountData?.by_session_type || {});
          setFastestLapCount(sessionCountData?.fastest_lap || 0);
          setEntriesCount(entryData.length);
          setStandingsCount(standingsCountData?.count || 0);
          setDriverOfTheDayCount(dotdCountData?.count || 0);
          setResults(resultData);
          setEntryOptions(
            entryData
              .slice()
              .sort((a, b) => (a.car_number ?? 999) - (b.car_number ?? 999))
          );
          const qualiSession = sessionData.find(
            (sessionItem) =>
              String(sessionItem.type).toUpperCase() === sessionType
          );
          setQualSessionId(qualiSession?.id ?? null);
          setQualifyingSessionIds({
            quali:
              sessionData.find(
                (sessionItem) => String(sessionItem.type) === "QUALI"
              )?.id ?? null,
            q1:
              sessionData.find(
                (sessionItem) => String(sessionItem.type) === "Q1"
              )?.id ?? null,
            q2:
              sessionData.find(
                (sessionItem) => String(sessionItem.type) === "Q2"
              )?.id ?? null,
            q3:
              sessionData.find(
                (sessionItem) => String(sessionItem.type) === "Q3"
              )?.id ?? null,
          });
          setSprintSessionIds({
            sq1:
              sessionData.find(
                (sessionItem) => String(sessionItem.type) === "SQ1"
              )?.id ?? null,
            sq2:
              sessionData.find(
                (sessionItem) => String(sessionItem.type) === "SQ2"
              )?.id ?? null,
            sq3:
              sessionData.find(
                (sessionItem) => String(sessionItem.type) === "SQ3"
              )?.id ?? null,
          });
          const resolvePositionOne = (items) =>
            items.find((item) => String(item.position) === "1") ||
            items.find((item) => Number.parseInt(item.position, 10) === 1) ||
            null;
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
          setQ1Results(q1Data);
          setQ2Results(q2Data);
          setQ3Results(q3Data);
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
          setError(err.message || `Failed to load ${label.toLowerCase()} results.`);
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
  }, [eventId, sessionType, q1Type, q2Type, q3Type]);

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

  useEffect(() => {
    const resultId = searchParams.get("resultId");
    if (!resultId) return;
    if (openedResultRef.current === resultId) return;
    openedResultRef.current = resultId;
    openEditModal(Number(resultId));
  }, [searchParams]);

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

  const formatEntryOption = (entry) => {
    const driverLabel = formatDriver(entry.driver);
    const carLabel = formatCar(entry.car);
    const carNumber = entry.car_number ?? "—";
    return `#${carNumber} ${driverLabel} (${carLabel})`;
  };

  const toResultMap = (items) => {
    const map = new Map();
    items.forEach((result) => {
      const entryId = result.entry?.id ?? result.entry_id;
      if (entryId) {
        map.set(entryId, result);
      }
    });
    return map;
  };

  const q1ByEntry = useMemo(() => toResultMap(q1Results), [q1Results]);
  const q2ByEntry = useMemo(() => toResultMap(q2Results), [q2Results]);
  const q3ByEntry = useMemo(() => toResultMap(q3Results), [q3Results]);
  const hasQ1 = q1Results.length > 0;
  const hasQ2 = q2Results.length > 0;
  const hasQ3 = q3Results.length > 0;
  const showSplitSessions = hasQ1 || hasQ2 || hasQ3;

  const openCreateModal = () => {
    if (!canEdit) return;
    if (!qualSessionId) {
      setError(`No ${label.toLowerCase()} session found for this event.`);
    }
    setEditingResultId(null);
    setCreatingResult(true);
    setFormValues({
      ...emptyForm,
      session_id: qualSessionId ?? "",
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
        points: result.points ?? "",
        time: result.time ?? "",
        gap: result.gap ?? "",
        interval: result.interval ?? "",
        laps: result.laps ?? "",
        time_penalty: result.time_penalty ?? "",
        grid_position: result.grid_position ?? "",
        retired_reason: result.retired_reason ?? "",
      });
      setSaveError("");
      setIsModalOpen(true);
    } catch (err) {
      setError(err.message || "Failed to load session result.");
    }
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!editingResultId && !creatingResult) return;
    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        session_id: formValues.session_id ? Number(formValues.session_id) : null,
        entry_id: formValues.entry_id ? Number(formValues.entry_id) : null,
        shared_drive_entry_id: formValues.shared_drive_entry_id
          ? Number(formValues.shared_drive_entry_id)
          : null,
        position: formValues.position || null,
        points: formValues.points ? Number(formValues.points) : null,
        time: formValues.time || null,
        gap: formValues.gap || null,
        interval: formValues.interval || null,
        laps: formValues.laps ? Number(formValues.laps) : null,
        time_penalty: formValues.time_penalty || null,
        grid_position: formValues.grid_position || null,
        retired_reason: formValues.retired_reason || null,
      };
      const response = await apiFetch(
        creatingResult ? "/session-results" : `/session-results/${editingResultId}`,
        {
          method: creatingResult ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update result.");
      }
      await response.json();
      clearApiCache(`/session-results/by-event/${eventId}`);
      const refreshed = await apiGet(
        `/session-results/by-event/${eventId}?session_type=${sessionType}`
      );
      setResults(refreshed);
      setIsModalOpen(false);
      setCreatingResult(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update result.");
    } finally {
      setSaving(false);
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
          <div className="status-card">Loading {label.toLowerCase()} results…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <>
            <SessionBanner
              session={sessions.find((s) => s.type === sessionType)}
              sessionType={sessionType}
              canEdit={canEdit}
              eventId={eventId}
              circuitTimezone={event?.circuit?.timezone}
              onSessionUpdated={async () => {
                const data = await apiGet(`/sessions/by-event/${eventId}`);
                setSessions(data);
              }}
            />
            <div className="tab-panel">
            <TableWrapper>
              <DataTable>
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Driver</th>
                    <th>Team</th>
                    <th>Car</th>
                    {showSplitSessions ? (
                      <>
                        {hasQ1 && <th>Q1</th>}
                        {hasQ2 && <th>Q2</th>}
                        {hasQ3 && <th>Q3</th>}
                      </>
                    ) : (
                      <th>Time</th>
                    )}
                    <th>Gap</th>
                    <th>Laps</th>
                    <th>Grid</th>
                    {canEdit ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => {
                    const entryId = result.entry?.id ?? result.entry_id;
                    const q1Result = entryId ? q1ByEntry.get(entryId) : null;
                    const q2Result = entryId ? q2ByEntry.get(entryId) : null;
                    const q3Result = entryId ? q3ByEntry.get(entryId) : null;
                    const displayGap = hasQ3
                      ? q3Result?.gap ?? result.gap
                      : result.gap;
                    return (
                      <tr key={result.id}>
                        <td>
                          {result.penalties?.length || result.time_penalty ? (
                            <span
                              className="penalty-badge"
                              title={
                                result.penalties?.length
                                  ? result.penalties
                                      .map(
                                        (penalty) =>
                                          `${formatPenalty(penalty)}${
                                            penalty.reason
                                              ? ` (${penalty.reason})`
                                              : ""
                                          }`
                                      )
                                      .join("; ")
                                  : result.time_penalty
                              }
                            >
                              {result.position ?? "—"}
                            </span>
                          ) : (
                            result.position ?? "—"
                          )}
                        </td>

                        <td>
                          <DriverName
                            driver={result.entry?.driver}
                            countryByCode={countryByCode}
                          />
                        </td>
                        <td>{formatTeam(result.entry?.team)}</td>
                        <td>{formatCar(result.entry?.car)}</td>
                        {showSplitSessions ? (
                          <>
                            {hasQ1 && <td>{q1Result?.time ?? "—"}</td>}
                            {hasQ2 && <td>{q2Result?.time ?? "—"}</td>}
                            {hasQ3 && <td>{q3Result?.time ?? "—"}</td>}
                          </>
                        ) : (
                          <td>{result.time ?? "—"}</td>
                        )}
                        <td>{displayGap ?? "—"}</td>
                        <td>{result.laps ?? "—"}</td>
                        <td>{result.grid_position ?? "—"}</td>
                        {canEdit ? (
                          <td>
                            <button
                              type="button"
                              className="ghost-button icon-action"
                              aria-label={`Update ${label.toLowerCase()} result`}
                              title={`Update ${label.toLowerCase()} result`}
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
            {results.some((result) => result.time_penalty) ? (
              <div className="penalty-notes">
                {results
                  .filter((result) => result.time_penalty)
                  .map((result) => (
                    <div className="penalty-note" key={result.id}>
                      <span className="penalty-badge" aria-hidden="true">
                        {result.position ?? "—"}
                      </span>{" "}
                      <strong>
                        {[
                          result.entry?.driver?.first_name,
                          result.entry?.driver?.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </strong>{" "}
                      — {result.time_penalty}
                    </div>
                  ))}
              </div>
            ) : null}
            {results.some((result) => result.penalties?.length) ? (
              <div className="penalty-notes">
                {results
                  .filter((result) => result.penalties?.length)
                  .map((result) => (
                    <div className="penalty-note" key={`pen-${result.id}`}>
                      <span className="penalty-badge" aria-hidden="true">
                        {result.position ?? "—"}
                      </span>{" "}
                      <strong>
                        {[
                          result.entry?.driver?.first_name,
                          result.entry?.driver?.last_name,
                        ]
                          .filter(Boolean)
                          .join(" ") || "—"}
                      </strong>{" "}
                      —{" "}
                      {result.penalties
                        .map(
                          (penalty) =>
                            `${formatPenalty(penalty)}${
                              penalty.reason ? ` (${penalty.reason})` : ""
                            }`
                        )
                        .join("; ")}
                    </div>
                  ))}
              </div>
            ) : null}
            {canEdit ? (
              <div className="tab-actions">
                <button type="button" className="pill" onClick={openCreateModal}>
                  Create qualifying entry
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
              <h3>
                {creatingResult
                  ? `Create ${label.toLowerCase()} result`
                  : `Update ${label.toLowerCase()} result`}
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setIsModalOpen(false);
                  setCreatingResult(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>
                  Session ID
                  {isSprintQualifying ? (
                    <select
                      name="session_id"
                      value={formValues.session_id}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select session</option>
                      {sprintSessionIds.sq1 ? (
                        <option value={sprintSessionIds.sq1}>SQ1</option>
                      ) : null}
                      {sprintSessionIds.sq2 ? (
                        <option value={sprintSessionIds.sq2}>SQ2</option>
                      ) : null}
                      {sprintSessionIds.sq3 ? (
                        <option value={sprintSessionIds.sq3}>SQ3</option>
                      ) : null}
                    </select>
                  ) : (
                    <select
                      name="session_id"
                      value={formValues.session_id}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select session</option>
                      {qualifyingSessionIds.quali ? (
                        <option value={qualifyingSessionIds.quali}>
                          Qualification
                        </option>
                      ) : null}
                      {qualifyingSessionIds.q1 ? (
                        <option value={qualifyingSessionIds.q1}>Q1</option>
                      ) : null}
                      {qualifyingSessionIds.q2 ? (
                        <option value={qualifyingSessionIds.q2}>Q2</option>
                      ) : null}
                      {qualifyingSessionIds.q3 ? (
                        <option value={qualifyingSessionIds.q3}>Q3</option>
                      ) : null}
                    </select>
                  )}
                </label>
                <label>
                  Entry
                  <select
                    name="entry_id"
                    value={formValues.entry_id}
                    onChange={handleFieldChange}
                  >
                    <option value="">Select entry</option>
                    {entryOptions.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {formatEntryOption(entry)}
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
                          {formatEntryOption(entry)}
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
                  Points
                  <input
                    type="number"
                    step="0.1"
                    name="points"
                    value={formValues.points}
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
                <label>
                  Interval
                  <input
                    name="interval"
                    value={formValues.interval}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Laps
                  <input
                    type="number"
                    name="laps"
                    value={formValues.laps}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Time penalty
                  <input
                    name="time_penalty"
                    value={formValues.time_penalty}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Grid position
                  <input
                    name="grid_position"
                    value={formValues.grid_position}
                    onChange={handleFieldChange}
                  />
                </label>
                <label className="form-span">
                  Retired reason
                  <input
                    name="retired_reason"
                    value={formValues.retired_reason}
                    onChange={handleFieldChange}
                  />
                </label>
              </div>
              <PenaltyEditor
                sessionResultId={creatingResult ? null : editingResultId}
              />
              {saveError && <div className="status-card error">{saveError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setCreatingResult(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving
                    ? creatingResult
                      ? "Creating…"
                      : "Saving…"
                    : creatingResult
                    ? "Create result"
                    : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
