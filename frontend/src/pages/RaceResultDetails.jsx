import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useOutletContext, useSearchParams } from "react-router-dom";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
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

const formatRaceDuration = (value) => {
  if (value === null || value === undefined) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if ((raw.match(/:/g) || []).length !== 1) return raw;

  const [minutesPart, secondsPart] = raw.split(":");
  if (!/^\d+$/.test(minutesPart || "")) return raw;
  const minutes = Number.parseInt(minutesPart, 10);
  if (Number.isNaN(minutes) || minutes < 60) return raw;

  const secondsMatch = String(secondsPart || "").match(/^(\d{1,2})(\.\d{1,3})?$/);
  if (!secondsMatch) return raw;
  const seconds = Number.parseInt(secondsMatch[1], 10);
  if (Number.isNaN(seconds) || seconds < 0 || seconds > 59) return raw;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  const fraction = secondsMatch[2] || "";
  return `${hours}:${String(remainingMinutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${fraction}`;
};

export default function RaceResultDetails() {
  const canEdit = useAuthStatus();
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const openedResultRef = useRef(null);
  const sessionType = (searchParams.get("sessionType") || "RACE").toUpperCase();
  const label = searchParams.get("label") || "Race";
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
  const [activeTab, setActiveTab] = useState("race");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingResultId, setEditingResultId] = useState(null);
  const [creatingResult, setCreatingResult] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [entryOptions, setEntryOptions] = useState([]);
  const [raceSessionId, setRaceSessionId] = useState(null);
  const [circuitVersions, setCircuitVersions] = useState([]);
  const [poleResult, setPoleResult] = useState(null);
  const [raceWinnerResult, setRaceWinnerResult] = useState(null);
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
          const raceSession = sessionData.find(
            (sessionItem) =>
              String(sessionItem.type).toUpperCase() === sessionType
          );
          setRaceSessionId(raceSession?.id ?? null);
          const resolvePositionOne = (items) =>
            items.find((item) => String(item.position) === "1") ||
            items.find((item) => Number.parseInt(item.position, 10) === 1) ||
            null;
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
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
  }, [eventId, sessionType, label]);

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
    const resultId = searchParams.get("resultId");
    if (!resultId) return;
    if (openedResultRef.current === resultId) return;
    openedResultRef.current = resultId;
    openEditModal(Number(resultId));
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

  const formatEntryOption = (entry) => {
    const driverLabel = formatDriver(entry.driver);
    const carLabel = formatCar(entry.car);
    const carNumber = entry.car_number ?? "—";
    return `#${carNumber} ${driverLabel} (${carLabel})`;
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
    setDeleteError("");
    setIsModalOpen(true);
  } catch (err) {
      setError(err.message || "Failed to load session result.");
    }
  };

  const openCreateModal = () => {
    if (!canEdit) return;
    if (!raceSessionId) {
      setError(`No ${label.toLowerCase()} session found for this event.`);
    }
    setEditingResultId(null);
    setCreatingResult(true);
    setFormValues({
      ...emptyForm,
      session_id: raceSessionId ?? "",
    });
    setSaveError("");
    setDeleteError("");
    setIsModalOpen(true);
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

  const handleDelete = async () => {
    if (!editingResultId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await apiFetch(`/session-results/${editingResultId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete result.");
      }
      setResults((prev) => prev.filter((item) => item.id !== editingResultId));
      setIsModalOpen(false);
      setIsDeleteModalOpen(false);
      setEditingResultId(null);
      setCreatingResult(false);
    } catch (err) {
      setDeleteError(err.message || "Failed to delete result.");
    } finally {
      setDeleting(false);
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
                    <th>Laps</th>
                    <th>Status</th>
                    <th>Time</th>
                    <th>Gap</th>
                    <th>Points</th>
                    {canEdit ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
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
                        {result.shared_drive_entry_id ? (
                          <span
                            className="muted"
                            title={
                              result.shared_drive_entry?.driver
                                ? `Shared / substitute for ${
                                    result.shared_drive_entry.driver.first_name ?? ""
                                  } ${
                                    result.shared_drive_entry.driver.last_name ?? ""
                                  }`.trim()
                                : "Shared / substitute drive"
                            }
                          >
                            {" "}
                            (shared)
                          </span>
                        ) : null}
                      </td>
                      <td>{formatTeam(result.entry?.team)}</td>
                      <td>{formatCar(result.entry?.car)}</td>
                      <td>{result.laps ?? "—"}</td>
                      <td>{result.retired_reason ?? "Finished"}</td>
                      <td>{formatRaceDuration(result.time) ?? "—"}</td>
                      <td>{result.gap ?? "—"}</td>
                      <td>{result.points ?? "—"}</td>
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
                  ))}
                </tbody>
              </DataTable>
            </TableWrapper>
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
                  Create race entry
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
                  <input
                    type="number"
                    name="session_id"
                    value={formValues.session_id}
                    onChange={handleFieldChange}
                  />
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
                {!creatingResult ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setDeleteError("");
                      setIsDeleteModalOpen(true);
                    }}
                  >
                    Delete result
                  </button>
                ) : null}
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
                    ? `Create ${label.toLowerCase()} result`
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
          title={`Delete ${label.toLowerCase()} result?`}
          message="This will permanently remove the result and cannot be undone."
          confirmLabel="Delete result"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteModalOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}
    </div>
  );
}
