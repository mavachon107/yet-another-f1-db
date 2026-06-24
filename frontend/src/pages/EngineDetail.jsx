import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiFetch, apiGet } from "../lib/api.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import useAuthStatus from "../lib/useAuthStatus.js";

const emptyForm = {
  constructor_id: "",
  model_number: "",
  tagged_indicator: false,
  tagged_name: "",
  layout_id: "",
  cylinder_count: "",
  displacement_cc: "",
  aspiration_type_id: "",
};

const PAGE_SIZE = 100;

const aspirationOptions = [
  { value: "", label: "Select aspiration" },
  { value: "naturally_aspired", label: "Naturally aspired" },
  { value: "supercharged", label: "Supercharged" },
  { value: "turbocharged", label: "Turbocharged" },
  { value: "hybrid", label: "Hybrid" },
];

const layoutOptions = [
  { value: "", label: "Select layout" },
  { value: "L", label: "L" },
  { value: "V", label: "V" },
  { value: "F", label: "F" },
  { value: "W", label: "W" },
  { value: "H", label: "H" },
];

const formatAspiration = (value) => {
  if (!value) return "—";
  if (value === "naturally_aspired") return "Naturally aspired";
  if (value === "supercharged") return "Supercharged";
  if (value === "turbocharged") return "Turbocharged";
  if (value === "hybrid") return "Hybrid";
  return value;
};

const formatUpdatedAt = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export default function EngineDetail() {
  const canEdit = useAuthStatus();
  const { engineId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [engine, setEngine] = useState(null);
  const [constructorOptions, setConstructorOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [activeTab, setActiveTab] = useState("details");

  const fetchAllConstructors = async () => {
    let offset = 0;
    let items = [];
    while (true) {
      const batch = await apiGet(
        `/constructors?limit=${PAGE_SIZE}&offset=${offset}`
      );
      items = items.concat(batch);
      if (batch.length < PAGE_SIZE) {
        break;
      }
      offset += PAGE_SIZE;
    }
    return items;
  };

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [engineData, constructors] = await Promise.all([
          apiGet(`/engines/${engineId}`),
          fetchAllConstructors(),
        ]);
        if (isActive) {
          setEngine(engineData);
          setConstructorOptions(
            constructors
              .slice()
              .sort((a, b) =>
                (a.name || a.short_name || "").localeCompare(
                  b.name || b.short_name || ""
                )
              )
          );
          setFormValues({
            constructor_id: engineData.constructor_id ?? "",
            model_number: engineData.model_number || "",
            tagged_indicator: engineData.tagged_indicator ?? false,
            tagged_name: engineData.tagged_name || "",
            layout_id: engineData.layout_id || "",
            cylinder_count:
              engineData.cylinder_count !== null &&
              engineData.cylinder_count !== undefined
                ? String(engineData.cylinder_count)
                : "",
            displacement_cc:
              engineData.displacement_cc !== null &&
              engineData.displacement_cc !== undefined
                ? String(engineData.displacement_cc)
                : "",
            aspiration_type_id: engineData.aspiration_type_id || "",
          });
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load engine.");
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
  }, [engineId]);

  const heroTitle = useMemo(() => {
    if (!engine) return "Engine profile";
    const displayName =
      engine.tagged_indicator && engine.tagged_name
        ? engine.tagged_name
        : engine.constructor?.name || engine.constructor?.short_name || "";
    const model = engine.model_number || "";
    const title = [displayName, model].filter((value) => value).join(" ");
    return title || "Engine profile";
  }, [engine]);

  const constructorLabel = useMemo(() => {
    const constructor = engine?.constructor;
    return constructor?.name || constructor?.short_name || "—";
  }, [engine]);

  const handleFieldChange = (event) => {
    const { name, value, type, checked } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        constructor_id: formValues.constructor_id
          ? Number(formValues.constructor_id)
          : null,
        model_number: formValues.model_number || null,
        tagged_indicator: formValues.tagged_indicator,
        tagged_name: formValues.tagged_name || null,
        layout_id: formValues.layout_id || null,
        cylinder_count: formValues.cylinder_count
          ? Number(formValues.cylinder_count)
          : null,
        displacement_cc: formValues.displacement_cc
          ? Number(formValues.displacement_cc)
          : null,
        aspiration_type_id: formValues.aspiration_type_id || null,
      };
      const response = await apiFetch(`/engines/${engineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update engine.");
      }
      const updated = await response.json();
      setEngine(updated);
      setIsModalOpen(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update engine.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!engineId) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const response = await apiFetch(`/engines/${engineId}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete engine.");
      }
      setIsDeleteModalOpen(false);
      setIsModalOpen(false);
      navigate(location.state?.returnTo || "/engines");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete engine.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page">
      <SeoHead
        title={engine ? heroTitle : "Engine"}
        description={
          engine
            ? `Formula 1 engine specifications for ${heroTitle}.`
            : undefined
        }
        ogType="profile"
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Engine profile</p>
          <h1>{heroTitle}</h1>
          <p className="hero-subtitle">
            Review engine specifications and keep metadata consistent.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                navigate(location.state?.returnTo || "/engines");
              }}
            >
              Back to engines
            </button>
            {canEdit ? (
              <button
                type="button"
                className="pill"
                onClick={() => setIsModalOpen(true)}
                disabled={!engine}
              >
                Update engine
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="tabs">
          <button
            type="button"
            className={`tab-button${activeTab === "details" ? " is-active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={`tab-button${activeTab === "wins" ? " is-active" : ""}`}
            onClick={() => setActiveTab("wins")}
          >
            Wins
          </button>
        </div>
        {loading ? (
          <div className="status-card">Loading engine…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : activeTab === "details" ? (
          <div className="detail-card">
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">Model</span>
                <span className="detail-value">{engine?.model_number || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Constructor</span>
                <span className="detail-value">{constructorLabel}</span>
              </div>
              {engine?.tagged_indicator && (
                <div className="detail-item">
                  <span className="detail-label">Tagged name</span>
                  <span className="detail-value">{engine.tagged_name || "—"}</span>
                </div>
              )}
              <div className="detail-item">
                <span className="detail-label">Layout</span>
                <span className="detail-value">{engine?.layout_id || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Cylinders</span>
                <span className="detail-value">
                  {engine?.cylinder_count ?? "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Displacement (cc)</span>
                <span className="detail-value">
                  {engine?.displacement_cc ?? "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Aspiration</span>
                <span className="detail-value">
                  {formatAspiration(engine?.aspiration_type_id)}
                </span>
              </div>
            </div>
            <div className="detail-updated-corner">
              Updated {formatUpdatedAt(engine?.updated_at) || "—"}
            </div>
          </div>
        ) : (
          <div className="detail-card">
            <div className="status-card">No wins recorded yet.</div>
          </div>
        )}
      </section>

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update engine</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="form-grid">
                <label>
                  Model number
                  <input
                    name="model_number"
                    value={formValues.model_number}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Constructor
                  <select
                    name="constructor_id"
                    value={formValues.constructor_id}
                    onChange={handleFieldChange}
                  >
                    <option value="">Select constructor</option>
                    {constructorOptions.map((constructor) => (
                      <option key={constructor.id} value={constructor.id}>
                        {constructor.name || constructor.short_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="checkbox"
                    name="tagged_indicator"
                    checked={formValues.tagged_indicator}
                    onChange={handleFieldChange}
                  />
                  Tagged engine
                </label>
                <label>
                  Tagged name
                  <input
                    name="tagged_name"
                    value={formValues.tagged_name}
                    onChange={handleFieldChange}
                    disabled={!formValues.tagged_indicator}
                    placeholder="e.g. Ford Cosworth"
                  />
                </label>
                <label>
                  Layout
                  <select
                    name="layout_id"
                    value={formValues.layout_id}
                    onChange={handleFieldChange}
                  >
                    {layoutOptions.map((option) => (
                      <option key={option.value || "none"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Cylinders
                  <input
                    type="number"
                    name="cylinder_count"
                    value={formValues.cylinder_count}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Displacement (cc)
                  <input
                    type="number"
                    name="displacement_cc"
                    value={formValues.displacement_cc}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Aspiration
                  <select
                    name="aspiration_type_id"
                    value={formValues.aspiration_type_id}
                    onChange={handleFieldChange}
                  >
                    {aspirationOptions.map((option) => (
                      <option key={option.value || "none"} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {saveError && <div className="status-card error">{saveError}</div>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    setDeleteError("");
                    setIsDeleteModalOpen(true);
                  }}
                >
                  Delete engine
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canEdit ? (
        <ConfirmModal
          isOpen={isDeleteModalOpen}
          title="Delete engine?"
          message="This will permanently remove the engine record and cannot be undone."
          confirmLabel="Delete engine"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteModalOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}
    </div>
  );
}
