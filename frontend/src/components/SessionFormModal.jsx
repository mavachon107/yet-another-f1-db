import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api.js";
import {
  gmtToLocal,
  localToGmt,
  toDateTimeInput,
  fromDateTimeInput,
} from "../lib/timezone.js";

const EMPTY_FORM = {
  type: "",
  date_time_start: "",
  date_time_end: "",
  is_cancelled: false,
  cancel_reason: "",
};

/**
 * Create / update an EventSession (FP/Quali/Race timeslot).
 *
 * Pass `editingSession` (a session object) to edit, or leave it null to create.
 * `onSaved(updatedSession)` receives the persisted session on success.
 */
export default function SessionFormModal({
  isOpen,
  onClose,
  eventId,
  circuitTimezone = null,
  editingSession = null,
  onSaved,
}) {
  const [sessionForm, setSessionForm] = useState(EMPTY_FORM);
  const [sessionTimeMode, setSessionTimeMode] = useState("gmt");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const mode = circuitTimezone ? "local" : "gmt";
    setSessionTimeMode(mode);
    setSaveError("");
    if (editingSession) {
      const convertDt = (v) =>
        mode === "local" && circuitTimezone
          ? gmtToLocal(v, circuitTimezone)
          : toDateTimeInput(v);
      setSessionForm({
        type: String(editingSession.type || ""),
        date_time_start: convertDt(editingSession.date_time_start),
        date_time_end: convertDt(
          editingSession.date_time_end || editingSession.date_time_start
        ),
        is_cancelled: editingSession.is_cancelled || false,
        cancel_reason: editingSession.cancel_reason || "",
      });
    } else {
      setSessionForm(EMPTY_FORM);
    }
  }, [isOpen, editingSession, circuitTimezone]);

  const handleSessionFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setSessionForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSessionTimeModeChange = (newMode) => {
    if (newMode === sessionTimeMode || !circuitTimezone) return;
    setSessionForm((prev) => {
      const convert = (val) => {
        if (!val) return val;
        if (newMode === "gmt") {
          const gmt = localToGmt(val, circuitTimezone);
          return toDateTimeInput(gmt);
        }
        const gmt = fromDateTimeInput(val);
        return gmtToLocal(gmt, circuitTimezone);
      };
      return {
        ...prev,
        date_time_start: convert(prev.date_time_start),
        date_time_end: convert(prev.date_time_end),
      };
    });
    setSessionTimeMode(newMode);
  };

  const handleSessionSave = async (event) => {
    event.preventDefault();
    if (!eventId) return;
    setSaving(true);
    setSaveError("");

    try {
      const useLocal = sessionTimeMode === "local" && circuitTimezone;
      const payload = {
        event_id: Number(eventId),
        type: sessionForm.type || null,
        date_time_start: useLocal
          ? localToGmt(sessionForm.date_time_start, circuitTimezone)
          : fromDateTimeInput(sessionForm.date_time_start),
        date_time_end: sessionForm.date_time_end
          ? useLocal
            ? localToGmt(sessionForm.date_time_end, circuitTimezone)
            : fromDateTimeInput(sessionForm.date_time_end)
          : null,
        is_cancelled: sessionForm.is_cancelled || false,
        cancel_reason: sessionForm.is_cancelled
          ? sessionForm.cancel_reason || null
          : null,
      };
      const response = await apiFetch(
        editingSession ? `/sessions/${editingSession.id}` : "/sessions",
        {
          method: editingSession ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save session.");
      }
      const updated = await response.json();
      if (onSaved) onSaved(updated);
      onClose();
    } catch (err) {
      setSaveError(err.message || "Failed to save session.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const timeSuffix = circuitTimezone
    ? ` (${sessionTimeMode === "local" ? "local" : "GMT"})`
    : "";

  return (
    <div className="modal-backdrop">
      <div className="modal-card">
        <div className="modal-header">
          <h3>{editingSession ? "Update session" : "Create session"}</h3>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <form className="modal-form" onSubmit={handleSessionSave}>
          <div className="form-grid">
            <label>
              Session type
              <select
                name="type"
                value={sessionForm.type}
                onChange={handleSessionFormChange}
                required
              >
                <option value="">Select type</option>
                <option value="FP1">Practice 1</option>
                <option value="FP2">Practice 2</option>
                <option value="FP3">Practice 3</option>
                <option value="QUALI">Qualifying</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="SQ">Sprint Qualifying</option>
                <option value="SQ1">SQ1</option>
                <option value="SQ2">SQ2</option>
                <option value="SQ3">SQ3</option>
                <option value="SR">Sprint</option>
                <option value="RACE">Race</option>
              </select>
            </label>
            {circuitTimezone && (
              <div
                className="time-mode-toggle"
                style={{ gridColumn: "1 / -1" }}
              >
                <button
                  type="button"
                  className={`time-mode-btn${
                    sessionTimeMode === "local" ? " is-active" : ""
                  }`}
                  onClick={() => handleSessionTimeModeChange("local")}
                >
                  Local ({circuitTimezone})
                </button>
                <button
                  type="button"
                  className={`time-mode-btn${
                    sessionTimeMode === "gmt" ? " is-active" : ""
                  }`}
                  onClick={() => handleSessionTimeModeChange("gmt")}
                >
                  GMT
                </button>
              </div>
            )}
            <label>
              Start date/time{timeSuffix}
              <input
                type="datetime-local"
                name="date_time_start"
                value={sessionForm.date_time_start}
                onChange={handleSessionFormChange}
                required
              />
            </label>
            <label>
              End date/time{timeSuffix}
              <input
                type="datetime-local"
                name="date_time_end"
                value={sessionForm.date_time_end}
                onChange={handleSessionFormChange}
              />
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                name="is_cancelled"
                checked={sessionForm.is_cancelled}
                onChange={handleSessionFormChange}
              />
              Session cancelled
            </label>
            {sessionForm.is_cancelled && (
              <label>
                Cancel reason
                <input
                  type="text"
                  name="cancel_reason"
                  value={sessionForm.cancel_reason}
                  onChange={handleSessionFormChange}
                  placeholder="e.g. Weather conditions, safety concerns…"
                />
              </label>
            )}
          </div>
          {saveError && <div className="status-card error">{saveError}</div>}
          <div className="modal-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="pill" disabled={saving}>
              {saving
                ? "Saving…"
                : editingSession
                ? "Save changes"
                : "Create session"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
