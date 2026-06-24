import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiFetch, apiGet } from "../lib/api.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import ReferencesSection from "../components/ReferencesSection.jsx";
import useAuthStatus from "../lib/useAuthStatus.js";

const emptyForm = {
  team_name: "",
  short_name: "",
  country: "",
  url: "",
  constructor_id: "",
};

export default function TeamDetail() {
  const canEdit = useAuthStatus();
  const { teamId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [constructorOptions, setConstructorOptions] = useState([]);
  const [activeTab, setActiveTab] = useState("details");

  useEffect(() => {
    let isActive = true;

    async function fetchAllConstructors() {
      const PAGE_SIZE = 100;
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
    }

    async function load() {
      try {
        const [teamData, constructorData] = await Promise.all([
          apiGet(`/teams/${teamId}`),
          fetchAllConstructors(),
        ]);
        if (isActive) {
          setTeam(teamData);
          setConstructorOptions(
            constructorData
              .slice()
              .sort((a, b) =>
                (a.name || a.short_name || "").localeCompare(
                  b.name || b.short_name || ""
                )
              )
          );
          setFormValues({
            team_name: teamData.team_name || "",
            short_name: teamData.short_name || "",
            country: teamData.country || "",
            url: teamData.url || "",
            constructor_id: teamData.constructor_id ?? "",
          });
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load team.");
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
  }, [teamId]);

  const heroTitle = useMemo(() => {
    if (!team) return "Team profile";
    return team.team_name || "Team profile";
  }, [team]);

  const constructorMap = useMemo(() => {
    const map = new Map();
    constructorOptions.forEach((constructor) => {
      map.set(constructor.id, constructor);
    });
    return map;
  }, [constructorOptions]);

  const formatConstructor = (constructor) => {
    if (!constructor) return "—";
    return constructor.name || constructor.short_name || "—";
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        team_name: formValues.team_name || null,
        short_name: formValues.short_name || null,
        country: formValues.country || null,
        url: formValues.url || null,
        constructor_id: formValues.constructor_id
          ? Number(formValues.constructor_id)
          : null,
      };
      const response = await apiFetch(`/teams/${teamId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update team.");
      }
      const updated = await response.json();
      setTeam(updated);
      setIsModalOpen(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update team.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <SeoHead
        title={team?.team_name || "Team"}
        description={
          team?.team_name
            ? `Formula 1 results and history for ${team.team_name}.`
            : undefined
        }
        ogType="profile"
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Team profile</p>
          <h1>{heroTitle}</h1>
            <p className="hero-subtitle">
              Review team information and maintain historical metadata.
            </p>
            <div className="hero-actions">
              <button
                type="button"
                className="ghost link-pill"
                onClick={() => {
                  navigate(location.state?.returnTo || "/teams");
                }}
              >
                Back to teams
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="pill"
                  onClick={() => setIsModalOpen(true)}
                  disabled={!team}
                >
                  Update team
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
      </section>

      {activeTab === "details" ? (
        <section className="section">
          {loading ? (
            <div className="status-card">Loading team…</div>
          ) : error ? (
            <div className="status-card error">{error}</div>
          ) : (
            <div className="detail-card">
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-label">Team name</span>
                  <span className="detail-value">{team?.team_name || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Short name</span>
                  <span className="detail-value">{team?.short_name || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Country</span>
                  <span className="detail-value">{team?.country || "—"}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Constructor</span>
                  <span className="detail-value">
                    {formatConstructor(
                      constructorMap.get(team?.constructor_id ?? null)
                    )}
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">URL</span>
                  <span className="detail-value">
                    {team?.url ? (
                      <a href={team.url} target="_blank" rel="noreferrer">
                        {team.url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>
              </div>
              <div className="detail-updated-corner">
                Updated{" "}
                {team?.updated_at
                  ? new Date(team.updated_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "—"}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {activeTab === "wins" ? (
        <section className="section">
          <div className="detail-card">
            <div className="status-card">No wins recorded yet.</div>
          </div>
        </section>
      ) : null}

      {!loading && !error && team ? (
        <section className="section">
          <ReferencesSection entityType="team" entityId={team.id} />
        </section>
      ) : null}

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update team</h3>
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
                  Team name
                  <input
                    name="team_name"
                    value={formValues.team_name}
                    onChange={handleFieldChange}
                    required
                  />
                </label>
                <label>
                  Short name
                  <input
                    name="short_name"
                    value={formValues.short_name}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Country
                  <input
                    name="country"
                    value={formValues.country}
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
                        {formatConstructor(constructor)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-span">
                  URL
                  <input
                    name="url"
                    value={formValues.url}
                    onChange={handleFieldChange}
                  />
                </label>
              </div>
              {saveError && <div className="status-card error">{saveError}</div>}
              <div className="modal-actions">
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
    </div>
  );
}
