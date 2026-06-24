import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import { apiFetch, apiGet, clearApiCache, readErrorMessage } from "../lib/api.js";
import { buildEventTabs, resolveActiveEventTab } from "../lib/eventTabs.js";
import { resolvePrevNextEvents } from "../lib/eventNavigation.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DataTable from "../components/DataTable.jsx";
import EventDetailHeader from "../components/EventDetailHeader.jsx";
import EventHighlights from "../components/EventHighlights.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import useCountries from "../hooks/useCountries.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import SessionBanner from "../components/SessionBanner.jsx";

const emptyForm = {
  entry_id: "",
  position: "",
  percentage: "",
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

export default function DriverOfTheDayDetail() {
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const location = useLocation();
  const canEdit = useAuthStatus();
  const [event, setEvent] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [prevEvent, setPrevEvent] = useState(null);
  const [nextEvent, setNextEvent] = useState(null);
  const [results, setResults] = useState([]);
  const [entries, setEntries] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionCounts, setSessionCounts] = useState({});
  const [entriesCount, setEntriesCount] = useState(0);
  const [fastestLapCount, setFastestLapCount] = useState(0);
  const [standingsCount, setStandingsCount] = useState(0);
  const [driverOfTheDayCount, setDriverOfTheDayCount] = useState(0);
  const [circuitVersions, setCircuitVersions] = useState([]);
  const [poleResult, setPoleResult] = useState(null);
  const [raceWinnerResult, setRaceWinnerResult] = useState(null);
  const [activeTab, setActiveTab] = useState("driver-of-the-day");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { countryByCode } = useCountries();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDotdId, setEditingDotdId] = useState(null);
  const [creatingDotd, setCreatingDotd] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [
          eventData,
          dotdData,
          entryData,
          sessionData,
          sessionCountData,
          standingsCountData,
          qualifyingResults,
          raceResults,
        ] = await Promise.all([
          apiGet(`/events/${eventId}`),
          apiGet(`/driver-of-the-day/by-event/${eventId}`),
          apiGet(`/event-entries/by-event/${eventId}`),
          apiGet(`/sessions/by-event/${eventId}`),
          apiGet(`/session-results/counts/by-event/${eventId}`),
          apiGet(`/standings/count/by-event/${eventId}`),
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
          setResults(dotdData || []);
          setEntries(
            (entryData || [])
              .slice()
              .sort((a, b) => (a.car_number ?? 999) - (b.car_number ?? 999))
          );
          setSessions(sessionData);
          setSessionCounts(sessionCountData?.by_session_type || {});
          setFastestLapCount(sessionCountData?.fastest_lap || 0);
          setEntriesCount(entryData.length);
          setStandingsCount(standingsCountData?.count || 0);
          setDriverOfTheDayCount((dotdData || []).length);
          setPoleResult(resolvePositionOne(qualifyingResults || []));
          setRaceWinnerResult(resolvePositionOne(raceResults || []));
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load Driver of the Day data.");
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
    if (!entry) return "Unknown entry";
    const driverName = formatDriver(entry.driver);
    const carNumber = entry.car_number ?? "—";
    const team = formatTeam(entry.team);
    const car = formatCar(entry.car);
    return `#${carNumber} ${driverName} (${team} · ${car})`;
  };

  const refreshDotd = async () => {
    clearApiCache(`/driver-of-the-day/by-event/${eventId}`);
    clearApiCache(`/driver-of-the-day/count/by-event/${eventId}`);
    const dotdData = await apiGet(`/driver-of-the-day/by-event/${eventId}`);
    setResults(dotdData || []);
    setDriverOfTheDayCount((dotdData || []).length);
  };

  const openEditModal = async (dotdId) => {
    if (!canEdit) return;
    try {
      clearApiCache(`/driver-of-the-day/${dotdId}`);
      const dotd = await apiGet(`/driver-of-the-day/${dotdId}`);
      setEditingDotdId(dotdId);
      setCreatingDotd(false);
      setFormValues({
        entry_id: dotd.entry_id ?? "",
        position: dotd.position ?? "",
        percentage: dotd.percentage ?? "",
      });
      setSaveError("");
      setDeleteError("");
      setIsModalOpen(true);
    } catch (err) {
      setError(err.message || "Failed to load Driver of the Day entry.");
    }
  };

  const openCreateModal = () => {
    if (!canEdit) return;
    setEditingDotdId(null);
    setCreatingDotd(true);
    setFormValues(emptyForm);
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
    if (!editingDotdId && !creatingDotd) return;
    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        event_id: Number(eventId),
        entry_id: formValues.entry_id ? Number(formValues.entry_id) : null,
        position: formValues.position ? Number(formValues.position) : null,
        percentage: formValues.percentage !== "" ? Number(formValues.percentage) : null,
      };
      const response = await apiFetch(
        creatingDotd
          ? "/driver-of-the-day"
          : `/driver-of-the-day/${editingDotdId}`,
        {
          method: creatingDotd ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        throw new Error(
          await readErrorMessage(
            response,
            creatingDotd
              ? "Failed to create Driver of the Day entry."
              : "Failed to update Driver of the Day entry."
          )
        );
      }
      await response.json();
      await refreshDotd();
      setIsModalOpen(false);
      setCreatingDotd(false);
    } catch (err) {
      setSaveError(err.message || "Failed to save Driver of the Day entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingDotdId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await apiFetch(`/driver-of-the-day/${editingDotdId}`, {
        method: "DELETE",
      });
      if (!response.ok && response.status !== 204) {
        throw new Error(
          await readErrorMessage(response, "Failed to delete entry.")
        );
      }
      await refreshDotd();
      setIsDeleteModalOpen(false);
      setIsModalOpen(false);
      setEditingDotdId(null);
      setCreatingDotd(false);
    } catch (err) {
      setDeleteError(err.message || "Failed to delete entry.");
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
        <SessionBanner title="Driver of the Day" />
        {loading ? (
          <div className="status-card">Loading Driver of the Day…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : results.length === 0 ? (
          <div className="tab-panel">
            <div className="status-card">No Driver of the Day data recorded yet.</div>
            {canEdit ? (
              <div className="tab-actions">
                <button type="button" className="pill" onClick={openCreateModal}>
                  Create driver of the day
                </button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="tab-panel">
            <TableWrapper>
              <DataTable>
                <thead>
                  <tr>
                    <th>Pos</th>
                    <th>Driver</th>
                    <th>Team</th>
                    <th>Vote %</th>
                    {canEdit ? <th>Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row) => (
                    <tr key={row.id}>
                      <td>{row.position}</td>
                      <td>
                        {row.driver ? (
                          <Link
                            to={`/drivers/${row.driver.slug}`}
                            className="table-link"
                          >
                            <DriverName
                              driver={row.driver}
                              countryByCode={countryByCode}
                            />
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {row.team ? (
                          <Link
                            to={`/teams/${row.team.slug}`}
                            className="table-link"
                          >
                            {row.team.team_name || row.team.short_name || "—"}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {row.percentage != null
                          ? `${row.percentage}%`
                          : "—"}
                      </td>
                      {canEdit ? (
                        <td>
                          <button
                            type="button"
                            className="ghost-button icon-action"
                            aria-label="Update driver of the day entry"
                            title="Update driver of the day entry"
                            onClick={() => openEditModal(row.id)}
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
            {canEdit ? (
              <div className="tab-actions">
                <button type="button" className="pill" onClick={openCreateModal}>
                  Create driver of the day
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                {creatingDotd
                  ? "Create driver of the day"
                  : "Update driver of the day"}
              </h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setIsModalOpen(false);
                  setCreatingDotd(false);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label className="form-span">
                  Entry
                  <select
                    name="entry_id"
                    value={formValues.entry_id}
                    onChange={handleFieldChange}
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
                  Position
                  <input
                    type="number"
                    name="position"
                    min="1"
                    value={formValues.position}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Vote %
                  <input
                    type="number"
                    name="percentage"
                    min="0"
                    max="100"
                    step="0.01"
                    value={formValues.percentage}
                    onChange={handleFieldChange}
                  />
                </label>
              </div>
              {saveError ? <div className="status-card error">{saveError}</div> : null}
              <div className="modal-actions">
                {!creatingDotd ? (
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
                ) : null}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setCreatingDotd(false);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving
                    ? creatingDotd
                      ? "Creating…"
                      : "Saving…"
                    : creatingDotd
                    ? "Create driver of the day"
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
          title="Delete driver of the day entry?"
          message="This will permanently remove the entry and cannot be undone."
          confirmLabel="Delete entry"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteModalOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}
    </div>
  );
}
