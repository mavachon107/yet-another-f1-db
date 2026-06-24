import React, { useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";
import DataTable from "../components/DataTable.jsx";
import EventDetailHeader from "../components/EventDetailHeader.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import useCountries from "../hooks/useCountries.js";
import { resolvePrevNextEvents } from "../lib/eventNavigation.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import SessionBanner from "../components/SessionBanner.jsx";

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatEngine = (car) => {
  const engine = car?.engine;
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

export default function EventEntryCompare() {
  const canEdit = useAuthStatus();
  const { eventId, eventSlug, seasonYear: seasonParam } = useOutletContext();
  const eventBase = `/seasons/${seasonParam}/events/${eventSlug}`;
  const [event, setEvent] = useState(null);
  const [seasonYear, setSeasonYear] = useState(null);
  const [prevEvent, setPrevEvent] = useState(null);
  const [nextEvent, setNextEvent] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [previousEvent, setPreviousEvent] = useState(null);
  const [leftEntries, setLeftEntries] = useState([]);
  const [rightEntries, setRightEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyError, setCopyError] = useState("");
  const [copySuccess, setCopySuccess] = useState("");
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateLeftEntry, setUpdateLeftEntry] = useState(null);
  const [updateRightEntry, setUpdateRightEntry] = useState(null);
  const [updateSelections, setUpdateSelections] = useState({
    driver: true,
    team: true,
    car: true,
    tire: true,
    car_number: true,
  });
  const [updateError, setUpdateError] = useState("");
  const [updating, setUpdating] = useState(false);
  const { countryByCode } = useCountries();

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [eventData, sessionData, currentEntries, prevEventData] =
          await Promise.all([
            apiGet(`/events/${eventId}`),
            apiGet(`/sessions/by-event/${eventId}`),
            apiGet(`/event-entries/by-event/${eventId}`),
            apiGet(`/events/${eventId}/previous`),
          ]);
        if (!isActive) return;
        setEvent(eventData);
        setSessions(sessionData);
        setRightEntries(currentEntries);
        setPreviousEvent(prevEventData || null);
        if (prevEventData?.id) {
          const prevEntries = await apiGet(
            `/event-entries/by-event/${prevEventData.id}`
          );
          if (isActive) {
            setLeftEntries(prevEntries);
          }
        } else {
          setLeftEntries([]);
        }
        if (eventData?.season_id) {
          const seasonData = await apiGet(`/seasons/${eventData.season_id}`);
          if (isActive) {
            setSeasonYear(seasonData?.year ?? null);
          }
        }
        setError("");
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load event entries.");
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
      } catch (err) {
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

  const leftTitle = useMemo(() => {
    if (!previousEvent) return "Previous event";
    return `${previousEvent.event_name || "Previous event"} (${formatDate(
      previousEvent.event_date
    )})`;
  }, [previousEvent]);

  const rightTitle = useMemo(() => {
    if (!event) return "Current event";
    return `${event.event_name || "Current event"} (${formatDate(
      event.event_date
    )})`;
  }, [event]);

  const formatTeam = (team) =>
    team?.team_name || team?.short_name || "—";

  const formatCar = (car) => car?.chassis_name || "—";

  const formatTire = (tire) =>
    tire?.manufactor_name || tire?.short_name || "—";

  const matchKey = (entry) => {
    if (entry?.car_number != null) return `car:${entry.car_number}`;
    return `entry:${entry?.id ?? ""}`;
  };

  const sortedMatches = useMemo(() => {
    const leftMap = new Map();
    leftEntries.forEach((entry) => {
      leftMap.set(matchKey(entry), entry);
    });
    const rightMap = new Map();
    rightEntries.forEach((entry) => {
      rightMap.set(matchKey(entry), entry);
    });
    const keys = new Set([...leftMap.keys(), ...rightMap.keys()]);
    const rows = Array.from(keys).map((key) => ({
      key,
      left: leftMap.get(key) || null,
      right: rightMap.get(key) || null,
    }));
    return rows.sort((a, b) => {
      const aNumber = a.left?.car_number ?? a.right?.car_number;
      const bNumber = b.left?.car_number ?? b.right?.car_number;
      if (aNumber != null && bNumber != null) {
        return Number(aNumber) - Number(bNumber);
      }
      if (aNumber != null) return -1;
      if (bNumber != null) return 1;
      return String(a.key).localeCompare(String(b.key));
    });
  }, [leftEntries, rightEntries]);

  const rightByCarNumber = useMemo(() => {
    const map = new Map();
    rightEntries.forEach((entry) => {
      if (entry.car_number != null) {
        map.set(entry.car_number, entry);
      }
    });
    return map;
  }, [rightEntries]);

  const refreshRightEntries = async () => {
    clearApiCache(`/event-entries/by-event/${eventId}`);
    const refreshed = await apiGet(`/event-entries/by-event/${eventId}`);
    setRightEntries(refreshed);
  };

  const handleCreateFromLeft = async (entry) => {
    if (!canEdit) return;
    setCopyError("");
    setCopySuccess("");
    try {
      const payload = {
        event_id: Number(eventId),
        driver_id: entry.driver?.id ?? null,
        car_id: entry.car?.id ?? null,
        team_id: entry.team?.id ?? null,
        tire_id: entry.tire?.id ?? null,
        car_number: entry.car_number ?? null,
      };
      const response = await apiFetch("/event-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create entry.");
      }
      await refreshRightEntries();
      setCopySuccess("Entry created on current event.");
    } catch (err) {
      setCopyError(err.message || "Failed to create entry.");
    }
  };

  const handleUpdateFromLeft = async (entry) => {
    if (!canEdit) return;
    setCopyError("");
    setCopySuccess("");
    const match =
      entry?.car_number != null ? rightByCarNumber.get(entry.car_number) : null;
    if (!match) {
      setCopyError("No matching driver found to update.");
      return;
    }
    try {
      const payload = {
        event_id: Number(eventId),
        driver_id: entry.driver?.id ?? null,
        car_id: entry.car?.id ?? null,
        team_id: entry.team?.id ?? null,
        tire_id: entry.tire?.id ?? null,
        car_number: entry.car_number ?? null,
      };
      const response = await apiFetch(`/event-entries/${match.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update entry.");
      }
      await refreshRightEntries();
      setCopySuccess("Entry updated on current event.");
    } catch (err) {
      setCopyError(err.message || "Failed to update entry.");
    }
  };

  const openUpdateModal = (left, right) => {
    if (!canEdit) return;
    setUpdateError("");
    setUpdateLeftEntry(left);
    setUpdateRightEntry(right);
    setUpdateSelections({
      driver: true,
      team: true,
      car: true,
      tire: true,
      car_number: true,
    });
    setIsUpdateModalOpen(true);
  };

  const applyUpdateFromModal = async () => {
    if (!canEdit) return;
    if (!updateLeftEntry || !updateRightEntry) return;
    setUpdating(true);
    setUpdateError("");
    try {
      const payload = {};
      if (updateSelections.driver) {
        payload.driver_id = updateLeftEntry.driver?.id ?? null;
      }
      if (updateSelections.team) {
        payload.team_id = updateLeftEntry.team?.id ?? null;
      }
      if (updateSelections.car) {
        payload.car_id = updateLeftEntry.car?.id ?? null;
      }
      if (updateSelections.tire) {
        payload.tire_id = updateLeftEntry.tire?.id ?? null;
      }
      if (updateSelections.car_number) {
        payload.car_number = updateLeftEntry.car_number ?? null;
      }
      const response = await apiFetch(`/event-entries/${updateRightEntry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update entry.");
      }
      await refreshRightEntries();
      setCopySuccess("Entry updated on current event.");
      setIsUpdateModalOpen(false);
    } catch (err) {
      setUpdateError(err.message || "Failed to update entry.");
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="page">
        <section className="section">
          <div className="status-card">Loading entries…</div>
        </section>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <section className="section">
          <div className="status-card error">{error}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <EventDetailHeader
        event={event}
        sessions={sessions}
        seasonYear={seasonParam}
        eventSlug={eventSlug}
        prevEvent={prevEvent}
        nextEvent={nextEvent}
      >
        <Link
          to={`${eventBase}/entry-list`}
          className="ghost link-pill"
        >
          Back to entries
        </Link>
      </EventDetailHeader>

      <section className="section">
        <SessionBanner title="Entry Comparison" />
        {copyError ? <div className="status-card error">{copyError}</div> : null}
        {copySuccess ? (
          <div className="status-card success">{copySuccess}</div>
        ) : null}
        <div className="detail-card">
          <div className="detail-card-header">
            <div>
              <h2>Compare entries</h2>
              <p>
                {leftTitle} vs {rightTitle}
              </p>
            </div>
          </div>
          {sortedMatches.length === 0 ? (
            <div className="status-card">No entries to compare.</div>
          ) : (
            <TableWrapper>
              <DataTable>
                <thead>
                  <tr>
                    <th>{leftTitle}</th>
                    <th>{rightTitle}</th>
                    {canEdit ? <th>Copy</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {sortedMatches.map((row) => {
                    const missing = isMissingByDriverTeam(row.left, row.right);
                    const differs =
                      row.left && row.right && !isSameEntry(row.left, row.right);
                    const canUpdate = Boolean(row.left && row.right);
                    return (
                      <tr
                        key={row.key}
                        className={
                          missing
                            ? "compare-missing"
                            : differs
                            ? "compare-diff"
                            : ""
                        }
                      >
                      <td>
                        {row.left ? (
                          <div className="compare-entry">
                            <div className="compare-driver">
                              <DriverName
                                driver={row.left.driver}
                                countryByCode={countryByCode}
                              />
                            </div>
                            <div className="compare-meta">
                              <span>{formatTeam(row.left.team)}</span>
                              <span>{formatCar(row.left.car)}</span>
                              <span>{formatEngine(row.left.car)}</span>
                              <span>{formatTire(row.left.tire)}</span>
                              <span>{row.left.car_number ?? "—"}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {row.right ? (
                          <div className="compare-entry">
                            <div className="compare-driver">
                              <DriverName
                                driver={row.right.driver}
                                countryByCode={countryByCode}
                              />
                            </div>
                            <div className="compare-meta">
                              <span>{formatTeam(row.right.team)}</span>
                              <span>{formatCar(row.right.car)}</span>
                              <span>{formatEngine(row.right.car)}</span>
                              <span>{formatTire(row.right.tire)}</span>
                              <span>{row.right.car_number ?? "—"}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {canEdit ? (
                        <td>
                          {row.left ? (
                            <div className="table-actions">
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => handleCreateFromLeft(row.left)}
                              >
                                Create
                              </button>
                              <button
                                type="button"
                                className="ghost-button"
                                onClick={() => openUpdateModal(row.left, row.right)}
                                disabled={!canUpdate}
                              >
                                Update
                              </button>
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableWrapper>
          )}
        </div>
      </section>

      {canEdit && isUpdateModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update entry fields</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsUpdateModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="modal-form">
              <div className="form-grid">
                <label className="form-span">
                  Driver
                  <div className="compare-row">
                    <input
                      type="checkbox"
                      checked={updateSelections.driver}
                      onChange={(event) =>
                        setUpdateSelections((prev) => ({
                          ...prev,
                          driver: event.target.checked,
                        }))
                      }
                    />
                    <span className="compare-current">
                      {updateRightEntry ? (
                        <DriverName
                          driver={updateRightEntry.driver}
                          countryByCode={countryByCode}
                        />
                      ) : (
                        "—"
                      )}
                    </span>
                    <span className="compare-next">
                      {updateLeftEntry ? (
                        <DriverName
                          driver={updateLeftEntry.driver}
                          countryByCode={countryByCode}
                        />
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                </label>
                <label className="form-span">
                  Team
                  <div className="compare-row">
                    <input
                      type="checkbox"
                      checked={updateSelections.team}
                      onChange={(event) =>
                        setUpdateSelections((prev) => ({
                          ...prev,
                          team: event.target.checked,
                        }))
                      }
                    />
                    <span className="compare-current">
                      {formatTeam(updateRightEntry?.team)}
                    </span>
                    <span className="compare-next">
                      {formatTeam(updateLeftEntry?.team)}
                    </span>
                  </div>
                </label>
                <label className="form-span">
                  Car
                  <div className="compare-row">
                    <input
                      type="checkbox"
                      checked={updateSelections.car}
                      onChange={(event) =>
                        setUpdateSelections((prev) => ({
                          ...prev,
                          car: event.target.checked,
                        }))
                      }
                    />
                    <span className="compare-current">
                      {formatCar(updateRightEntry?.car)}
                    </span>
                    <span className="compare-next">
                      {formatCar(updateLeftEntry?.car)}
                    </span>
                  </div>
                </label>
                <label className="form-span">
                  Tire
                  <div className="compare-row">
                    <input
                      type="checkbox"
                      checked={updateSelections.tire}
                      onChange={(event) =>
                        setUpdateSelections((prev) => ({
                          ...prev,
                          tire: event.target.checked,
                        }))
                      }
                    />
                    <span className="compare-current">
                      {formatTire(updateRightEntry?.tire)}
                    </span>
                    <span className="compare-next">
                      {formatTire(updateLeftEntry?.tire)}
                    </span>
                  </div>
                </label>
                <label className="form-span">
                  Car number
                  <div className="compare-row">
                    <input
                      type="checkbox"
                      checked={updateSelections.car_number}
                      onChange={(event) =>
                        setUpdateSelections((prev) => ({
                          ...prev,
                          car_number: event.target.checked,
                        }))
                      }
                    />
                    <span className="compare-current">
                      {updateRightEntry?.car_number ?? "—"}
                    </span>
                    <span className="compare-next">
                      {updateLeftEntry?.car_number ?? "—"}
                    </span>
                  </div>
                </label>
              </div>
              {updateError ? (
                <div className="status-card error">{updateError}</div>
              ) : null}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsUpdateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={applyUpdateFromModal}
                  disabled={updating}
                >
                  {updating ? "Updating…" : "Apply update"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
  const isSameEntry = (left, right) => {
    if (!left || !right) return false;
    const driverMatch = left.driver?.id === right.driver?.id;
    const teamMatch = left.team?.id === right.team?.id;
    const carMatch = left.car?.id === right.car?.id;
    const tireMatch = left.tire?.id === right.tire?.id;
    const numberMatch = left.car_number === right.car_number;
    return driverMatch && teamMatch && carMatch && tireMatch && numberMatch;
  };

  const isMissingByDriverTeam = (left, right) => {
    if (!left || right) return false;
    return Boolean(left.driver?.id) && Boolean(left.team?.id);
  };
