import React, { useEffect, useState } from "react";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";

const emptyPenalty = { type: "", amount: "", reason: "" };

export function formatPenalty(penalty) {
  const amount = penalty.amount ?? null;
  const type = (penalty.type || "").trim();
  // Legacy structured penalties stored as enum values.
  if (type === "TIME") {
    return amount != null ? `+${amount}s` : "Time penalty";
  }
  if (type === "GRID") {
    return amount != null ? `${amount} places` : "Grid penalty";
  }
  if (!type) {
    return amount != null ? String(amount) : "Penalty";
  }
  return amount != null ? `${type} (${amount})` : type;
}

export default function PenaltyEditor({ sessionResultId }) {
  const [penalties, setPenalties] = useState([]);
  const [form, setForm] = useState(emptyPenalty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const listPath = sessionResultId
    ? `/penalties/by-session-result/${sessionResultId}`
    : null;

  const refresh = async () => {
    if (!listPath) return;
    setLoading(true);
    try {
      clearApiCache(listPath);
      const data = await apiGet(listPath);
      setPenalties(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to load penalties.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionResultId) {
      refresh();
    } else {
      setPenalties([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionResultId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAdd = async () => {
    if (!sessionResultId) return;
    if (!form.type.trim()) {
      setError("Enter a penalty type.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch("/penalties", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_result_id: sessionResultId,
          type: form.type,
          amount: form.amount === "" ? null : Number(form.amount),
          reason: form.reason || null,
        }),
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "Failed to add penalty.");
      }
      setForm(emptyPenalty);
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to add penalty.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (penaltyId) => {
    setError("");
    try {
      const response = await apiFetch(`/penalties/${penaltyId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error((await response.text()) || "Failed to delete penalty.");
      }
      await refresh();
    } catch (err) {
      setError(err.message || "Failed to delete penalty.");
    }
  };

  return (
    <div className="penalty-editor">
      <h4>Penalties</h4>
      {!sessionResultId ? (
        <p className="muted">Save the result first to add penalties.</p>
      ) : (
        <>
          {error ? <div className="status-card error">{error}</div> : null}
          {loading ? (
            <p className="muted">Loading penalties…</p>
          ) : penalties.length === 0 ? (
            <p className="muted">No penalties recorded.</p>
          ) : (
            <ul className="penalty-list">
              {penalties.map((penalty) => (
                <li key={penalty.id} className="penalty-list-item">
                  <span className="penalty-badge" aria-hidden="true">
                    {(penalty.type || "P").charAt(0).toUpperCase()}
                  </span>{" "}
                  <span className="penalty-list-text">
                    {formatPenalty(penalty)}
                    {penalty.reason ? ` — ${penalty.reason}` : ""}
                  </span>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => handleDelete(penalty.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="penalty-add-row">
            <label className="modal-field">
              Penalty
              <input
                name="type"
                placeholder="e.g. Back of grid, Pit lane, Time, Grid"
                value={form.type}
                onChange={handleChange}
              />
            </label>
            <label className="modal-field">
              Amount
              <input
                type="number"
                step="0.1"
                name="amount"
                placeholder="Places / seconds (optional)"
                value={form.amount}
                onChange={handleChange}
              />
            </label>
            <label className="modal-field">
              Reason
              <input
                name="reason"
                placeholder="Reason (optional)"
                value={form.reason}
                onChange={handleChange}
              />
            </label>
            <button
              type="button"
              className="pill"
              onClick={handleAdd}
              disabled={saving}
            >
              {saving ? "Adding…" : "Add"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
