import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import { apiFetch, apiGet } from "../lib/api.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import ReferencesSection from "../components/ReferencesSection.jsx";
import ConstructorWinsByYear from "../components/ConstructorWinsByYear.jsx";

const PAGE_SIZE = 25;
const emptyForm = {
  name: "",
  short_name: "",
  country: "",
  founded_year: "",
  defunct_year: "",
  notes: "",
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

export default function ConstructorDetail() {
  const canEdit = useAuthStatus();
  const { constructorId } = useParams();
  const navigate = useNavigate();
  const [constructor, setConstructor] = useState(null);
  const [cars, setCars] = useState([]);
  const [teams, setTeams] = useState([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [teamPageIndex, setTeamPageIndex] = useState(0);
  const [hasNextTeamPage, setHasNextTeamPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [carsLoading, setCarsLoading] = useState(true);
  const [teamsLoading, setTeamsLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [carsError, setCarsError] = useState("");
  const [teamsError, setTeamsError] = useState("");
  const [profileTab, setProfileTab] = useState("details");
  const [wins, setWins] = useState([]);
  const [winsLoading, setWinsLoading] = useState(false);
  const [winsError, setWinsError] = useState("");
  const [poles, setPoles] = useState([]);
  const [polesLoading, setPolesLoading] = useState(false);
  const [polesError, setPolesError] = useState("");
  const [lineage, setLineage] = useState(null);
  const [lineageLoading, setLineageLoading] = useState(false);
  const [lineageError, setLineageError] = useState("");
  const [lineageLink, setLineageLink] = useState(null);
  const [lineageLinkLoading, setLineageLinkLoading] = useState(false);
  const [lineageLinkError, setLineageLinkError] = useState("");
  const [lineageConstructorOptions, setLineageConstructorOptions] = useState([]);
  const [isLineageModalOpen, setIsLineageModalOpen] = useState(false);
  const [lineageForm, setLineageForm] = useState({
    parent_constructor_id: "",
    notes: "",
  });
  const [lineageSaving, setLineageSaving] = useState(false);
  const [lineageSaveError, setLineageSaveError] = useState("");
  const [isLineageDeleteOpen, setIsLineageDeleteOpen] = useState(false);
  const [lineageDeleting, setLineageDeleting] = useState(false);
  const [lineageDeleteError, setLineageDeleteError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const formatTeamRunYears = (team) => {
    const first = team?.first_run_year ?? null;
    const last = team?.last_run_year ?? null;
    if (!first && !last) return "—";
    if (first && last && first === last) return String(first);
    if (first && last) return `${first} - ${last}`;
    return String(first || last);
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

  const formatCarRunYears = (car) => {
    const first = car?.first_run_year ?? null;
    const last = car?.last_run_year ?? null;
    if (!first && !last) return "—";
    if (first && last && first === last) return String(first);
    if (first && last) return `${first} - ${last}`;
    return String(first || last);
  };

  const formatLineageConstructorName = (node) =>
    node?.name || node?.short_name || "—";

  const formatLineageYears = (node) => {
    const first = node?.first_run_year ?? null;
    const last = node?.last_run_year ?? null;
    if (!first && !last) return "—";
    if (first && last && first === last) return String(first);
    if (first && last) return `${first} - ${last}`;
    return String(first || last);
  };

  const lineageNodesById = useMemo(() => {
    const map = new Map();
    (lineage?.nodes || []).forEach((node) => {
      map.set(node.constructor_id, node);
    });
    return map;
  }, [lineage]);

  const predecessorNodes = useMemo(
    () =>
      (lineage?.nodes || [])
        .filter((node) => node.role === "predecessor" || node.role === "both")
        .sort((a, b) => {
          const aDepth = a.predecessor_depth ?? Number.POSITIVE_INFINITY;
          const bDepth = b.predecessor_depth ?? Number.POSITIVE_INFINITY;
          if (aDepth !== bDepth) return bDepth - aDepth;
          return formatLineageConstructorName(a).localeCompare(
            formatLineageConstructorName(b)
          );
        }),
    [lineage]
  );

  const successorNodes = useMemo(
    () =>
      (lineage?.nodes || [])
        .filter((node) => node.role === "successor" || node.role === "both")
        .sort((a, b) => {
          const aDepth = a.successor_depth ?? Number.POSITIVE_INFINITY;
          const bDepth = b.successor_depth ?? Number.POSITIVE_INFINITY;
          if (aDepth !== bDepth) return aDepth - bDepth;
          return formatLineageConstructorName(a).localeCompare(
            formatLineageConstructorName(b)
          );
        }),
    [lineage]
  );

  const parseResponseError = async (response, fallbackMessage) => {
    try {
      const payload = await response.json();
      if (payload && typeof payload.detail === "string") return payload.detail;
      if (typeof payload === "string") return payload;
    } catch {
      // Ignore and fallback to text body or default message.
    }
    try {
      const text = await response.text();
      return text || fallbackMessage;
    } catch {
      return fallbackMessage;
    }
  };

  const loadLineageGraph = async () => {
    const data = await apiGet(`/constructors/${constructorId}/lineage`);
    return data || null;
  };

  const loadLineageLink = async () => {
    const links = await apiGet(
      `/constructor-lineage-links?constructor_id=${constructorId}`
    );
    if (!Array.isArray(links) || links.length === 0) return null;
    return links[0];
  };

  const loadLineageConstructorOptions = async () => {
    const options = [];
    let offset = 0;
    const limit = 100;
    const currentId = Number(constructorId);
    while (true) {
      const batch = await apiGet(`/constructors?offset=${offset}&limit=${limit}`);
      const rows = Array.isArray(batch) ? batch : [];
      rows.forEach((item) => {
        if (item.id !== currentId) {
          options.push({
            id: item.id,
            label: item.name || item.short_name || `Constructor #${item.id}`,
          });
        }
      });
      if (rows.length < limit) break;
      offset += limit;
    }
    options.sort((a, b) => a.label.localeCompare(b.label));
    return options;
  };

  useEffect(() => {
    let isActive = true;

    async function loadConstructor() {
      try {
        const [data, statsData] = await Promise.all([
          apiGet(`/constructors/${constructorId}`),
          apiGet(`/constructors/${constructorId}/stats`),
        ]);
        if (isActive) {
          setConstructor(data);
          setStats(statsData);
          setFormValues({
            name: data.name || "",
            short_name: data.short_name || "",
            country: data.country || "",
            founded_year: data.founded_year ?? "",
            defunct_year: data.defunct_year ?? "",
            notes: data.notes || "",
          });
          setError("");
          setStatsError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load constructor.");
          setStatsError(err.message || "Failed to load constructor stats.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
          setStatsLoading(false);
        }
      }
    }

    loadConstructor();
    return () => {
      isActive = false;
    };
  }, [constructorId]);

  useEffect(() => {
    let isActive = true;

    async function loadCars() {
      try {
        setCarsLoading(true);
        const offset = pageIndex * PAGE_SIZE;
        const data = await apiGet(
          `/constructors/${constructorId}/cars?limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setCars(data);
          setHasNextPage(data.length === PAGE_SIZE);
          setCarsError("");
        }
      } catch (err) {
        if (isActive) {
          setCarsError(err.message || "Failed to load cars.");
        }
      } finally {
        if (isActive) {
          setCarsLoading(false);
        }
      }
    }

    loadCars();
    return () => {
      isActive = false;
    };
  }, [constructorId, pageIndex]);

  useEffect(() => {
    let isActive = true;

    async function loadTeams() {
      try {
        setTeamsLoading(true);
        const offset = teamPageIndex * PAGE_SIZE;
        const data = await apiGet(
          `/constructors/${constructorId}/teams?limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setTeams(data);
          setHasNextTeamPage(data.length === PAGE_SIZE);
          setTeamsError("");
        }
      } catch (err) {
        if (isActive) {
          setTeamsError(err.message || "Failed to load teams.");
        }
      } finally {
        if (isActive) {
          setTeamsLoading(false);
        }
      }
    }

    loadTeams();
    return () => {
      isActive = false;
    };
  }, [constructorId, teamPageIndex]);

  useEffect(() => {
    if (profileTab !== "wins") return;
    let isActive = true;
    async function loadWins() {
      setWinsLoading(true);
      setWinsError("");
      try {
        const data = await apiGet(`/constructors/${constructorId}/wins`);
        if (!isActive) return;
        setWins(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isActive) {
          setWins([]);
          setWinsError(err.message || "Failed to load constructor wins.");
        }
      } finally {
        if (isActive) setWinsLoading(false);
      }
    }
    loadWins();
    return () => {
      isActive = false;
    };
  }, [constructorId, profileTab]);

  useEffect(() => {
    if (profileTab !== "poles") return;
    let isActive = true;
    async function loadPoles() {
      setPolesLoading(true);
      setPolesError("");
      try {
        const data = await apiGet(`/constructors/${constructorId}/pole-positions`);
        if (!isActive) return;
        setPoles(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isActive) {
          setPoles([]);
          setPolesError(err.message || "Failed to load constructor pole positions.");
        }
      } finally {
        if (isActive) setPolesLoading(false);
      }
    }
    loadPoles();
    return () => {
      isActive = false;
    };
  }, [constructorId, profileTab]);

  useEffect(() => {
    if (profileTab !== "lineage") return;
    let isActive = true;
    async function loadLineage() {
      setLineageLoading(true);
      setLineageError("");
      setLineageLinkLoading(true);
      setLineageLinkError("");
      try {
        const [lineageData, linkData, optionData] = await Promise.all([
          loadLineageGraph(),
          loadLineageLink(),
          canEdit ? loadLineageConstructorOptions() : Promise.resolve(),
        ]);
        if (!isActive) return;
        setLineage(lineageData || null);
        setLineageLink(linkData || null);
        if (Array.isArray(optionData)) {
          setLineageConstructorOptions(optionData);
        }
      } catch (err) {
        if (isActive) {
          setLineage(null);
          setLineageLink(null);
          setLineageError(err.message || "Failed to load constructor lineage.");
          setLineageLinkError(err.message || "Failed to load constructor lineage link.");
        }
      } finally {
        if (isActive) {
          setLineageLoading(false);
          setLineageLinkLoading(false);
        }
      }
    }
    loadLineage();
    return () => {
      isActive = false;
    };
  }, [canEdit, constructorId, profileTab]);

  const heroTitle = useMemo(() => {
    if (!constructor) return "Constructor profile";
    return constructor.name || constructor.short_name || "Constructor profile";
  }, [constructor]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const openModal = () => {
    if (!constructor) return;
    setFormValues({
      name: constructor.name || "",
      short_name: constructor.short_name || "",
      country: constructor.country || "",
      founded_year: constructor.founded_year ?? "",
      defunct_year: constructor.defunct_year ?? "",
      notes: constructor.notes || "",
    });
    setSaveError("");
    setDeleteError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!constructorId) return;
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        name: formValues.name || null,
        short_name: formValues.short_name || null,
        country: formValues.country || null,
        founded_year: formValues.founded_year
          ? Number(formValues.founded_year)
          : null,
        defunct_year: formValues.defunct_year
          ? Number(formValues.defunct_year)
          : null,
        notes: formValues.notes || null,
      };
      const response = await apiFetch(`/constructors/${constructorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update constructor.");
      }
      const updated = await response.json();
      setConstructor(updated);
      setIsModalOpen(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update constructor.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!constructorId) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const response = await apiFetch(`/constructors/${constructorId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete constructor.");
      }
      navigate("/");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete constructor.");
    } finally {
      setDeleting(false);
    }
  };

  const openLineageModal = () => {
    setLineageSaveError("");
    setLineageDeleteError("");
    setLineageForm({
      parent_constructor_id: lineageLink?.parent_constructor_id
        ? String(lineageLink.parent_constructor_id)
        : "",
      notes: lineageLink?.notes || "",
    });
    setIsLineageModalOpen(true);
  };

  const handleLineageFieldChange = (event) => {
    const { name, value } = event.target;
    setLineageForm((prev) => ({ ...prev, [name]: value }));
  };

  const refreshLineageState = async () => {
    setLineageLoading(true);
    setLineageLinkLoading(true);
    setLineageError("");
    setLineageLinkError("");
    try {
      const [lineageData, linkData] = await Promise.all([
        loadLineageGraph(),
        loadLineageLink(),
      ]);
      setLineage(lineageData || null);
      setLineageLink(linkData || null);
    } catch (err) {
      const message = err.message || "Failed to refresh constructor lineage.";
      setLineageError(message);
      setLineageLinkError(message);
    } finally {
      setLineageLoading(false);
      setLineageLinkLoading(false);
    }
  };

  const handleLineageSubmit = async (event) => {
    event.preventDefault();
    if (!constructorId) return;
    setLineageSaving(true);
    setLineageSaveError("");
    try {
      const payload = {
        notes: lineageForm.notes || null,
      };
      if (lineageForm.parent_constructor_id) {
        payload.parent_constructor_id = Number(lineageForm.parent_constructor_id);
      } else {
        payload.parent_constructor_id = null;
      }

      const endpoint = lineageLink
        ? `/constructor-lineage-links/${lineageLink.id}`
        : "/constructor-lineage-links";
      const method = lineageLink ? "PATCH" : "POST";
      const requestBody = lineageLink
        ? payload
        : { constructor_id: Number(constructorId), ...payload };

      const response = await apiFetch(endpoint, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!response.ok) {
        throw new Error(
          await parseResponseError(
            response,
            lineageLink
              ? "Failed to update constructor lineage link."
              : "Failed to create constructor lineage link."
          )
        );
      }

      await refreshLineageState();
      setIsLineageModalOpen(false);
    } catch (err) {
      setLineageSaveError(err.message || "Failed to save constructor lineage link.");
    } finally {
      setLineageSaving(false);
    }
  };

  const handleLineageDelete = async () => {
    if (!lineageLink?.id) return;
    setLineageDeleting(true);
    setLineageDeleteError("");
    try {
      const response = await apiFetch(`/constructor-lineage-links/${lineageLink.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(
          await parseResponseError(
            response,
            "Failed to delete constructor lineage link."
          )
        );
      }
      setIsLineageDeleteOpen(false);
      setIsLineageModalOpen(false);
      await refreshLineageState();
    } catch (err) {
      setLineageDeleteError(
        err.message || "Failed to delete constructor lineage link."
      );
    } finally {
      setLineageDeleting(false);
    }
  };

  return (
    <div className="page">
      <SeoHead
        title={constructor?.name || "Constructor"}
        description={
          constructor?.name
            ? `Formula 1 results and lineage for ${constructor.name}.`
            : undefined
        }
        ogType="profile"
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Constructor profile</p>
          <h1>{heroTitle}</h1>
          <p className="hero-subtitle">
            Review constructor history and current chassis lineup.
          </p>
          <div className="hero-actions">
            <Link to="/" className="ghost link-pill">
              Back to dashboard
            </Link>
            {canEdit ? (
              <button type="button" className="pill" onClick={openModal}>
                Update constructor
              </button>
            ) : null}
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Constructor stats</div>
          <div className="panel-grid">
            <div className="panel-card">
              <div className="panel-label">Starts</div>
              <div className="panel-value">
                {statsLoading ? "—" : stats?.starts ?? "—"}
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-label">Poles</div>
              <div className="panel-value">
                {statsLoading ? "—" : stats?.poles ?? "—"}
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-label">Wins</div>
              <div className="panel-value">
                {statsLoading ? "—" : stats?.wins ?? "—"}
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-label">Podiums</div>
              <div className="panel-value">
                {statsLoading ? "—" : stats?.podiums ?? "—"}
              </div>
            </div>
          </div>
          <div className="panel-meta">
            <div>
              <span className="panel-meta-label">First event</span>
              <span className="panel-meta-value">
                {statsLoading ? "—" : stats?.first_event_name || "—"}
              </span>
            </div>
            <div>
              <span className="panel-meta-label">Last event</span>
              <span className="panel-meta-value">
                {statsLoading ? "—" : stats?.last_event_name || "—"}
              </span>
            </div>
          </div>
          {statsError ? <div className="status-card error">{statsError}</div> : null}
        </div>
      </section>

      <section className="section">
        <div className="tabs">
          {[
            { id: "details", label: "Details" },
            { id: "cars", label: `Cars (${cars.length})` },
            { id: "teams", label: `Teams (${teams.length})` },
            { id: "wins", label: `Wins (${stats?.wins ?? 0})` },
            { id: "poles", label: `Pole positions (${stats?.poles ?? 0})` },
            { id: "wins-by-year", label: "Wins by year" },
            { id: "lineage", label: "Lineage" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`tab-button${profileTab === tab.id ? " is-active" : ""}`}
              onClick={() => setProfileTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      {profileTab === "details" ? (
        <>
          <section className="section">
            {loading ? (
              <div className="status-card">Loading constructor…</div>
            ) : error ? (
              <div className="status-card error">{error}</div>
            ) : (
              <div className="detail-card">
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">Name</span>
                    <span className="detail-value">{constructor?.name || "—"}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Short name</span>
                    <span className="detail-value">
                      {constructor?.short_name || "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Country</span>
                    <span className="detail-value">
                      {constructor?.country || "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Founded</span>
                    <span className="detail-value">
                      {constructor?.founded_year || "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Defunct</span>
                    <span className="detail-value">
                      {constructor?.defunct_year || "—"}
                    </span>
                  </div>
                  <div className="detail-item detail-span">
                    <span className="detail-label">Notes</span>
                    <span className="detail-value">{constructor?.notes || "—"}</span>
                  </div>
                </div>
                <div className="detail-updated-corner">
                  Updated {formatUpdatedAt(constructor?.updated_at) || "—"}
                </div>
              </div>
            )}
          </section>
          {!loading && !error && constructor ? (
            <section className="section">
              <ReferencesSection
                entityType="constructor"
                entityId={constructor.id}
              />
            </section>
          ) : null}
        </>
      ) : null}

      {profileTab === "cars" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Cars</h2>
              <p>Cars linked to this constructor.</p>
            </div>
          </div>
          <div className="tab-panel">
            {carsLoading ? (
              <div className="status-card">Loading cars…</div>
            ) : carsError ? (
              <div className="status-card error">{carsError}</div>
            ) : cars.length === 0 ? (
              <div className="status-card">No cars recorded yet.</div>
            ) : (
              <>
                <TableWrapper>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Year(s)</th>
                        <th>Chassis</th>
                        <th>Engine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cars.map((car) => (
                        <tr key={car.id}>
                          <td>{formatCarRunYears(car)}</td>
                          <td>
                            <Link to={`/cars/${car.slug}`} className="table-link">
                              {car.chassis_name || "—"}
                            </Link>
                          </td>
                          <td>
                            {car.engine?.id ? (
                              <Link
                                to={`/engines/${car.engine.slug}`}
                                className="table-link"
                              >
                                {formatEngine(car)}
                              </Link>
                            ) : (
                              formatEngine(car)
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrapper>
                <div className="pager">
                  <button
                    type="button"
                    className="pager-button"
                    onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
                    disabled={pageIndex === 0}
                  >
                    Previous
                  </button>
                  <span className="pager-label">Page {pageIndex + 1}</span>
                  <button
                    type="button"
                    className="pager-button"
                    onClick={() => setPageIndex((prev) => prev + 1)}
                    disabled={!hasNextPage}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {profileTab === "teams" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Teams</h2>
              <p>Teams linked to this constructor.</p>
            </div>
          </div>
          <div className="tab-panel">
            {teamsLoading ? (
              <div className="status-card">Loading teams…</div>
            ) : teamsError ? (
              <div className="status-card error">{teamsError}</div>
            ) : teams.length === 0 ? (
              <div className="status-card">No teams recorded yet.</div>
            ) : (
              <>
                <TableWrapper>
                  <DataTable>
                    <thead>
                      <tr>
                        <th>Year(s)</th>
                        <th>Team name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {teams.map((team, idx) => (
                        <tr key={`${team.id}-${team.first_run_year ?? idx}`}>
                          <td>{formatTeamRunYears(team)}</td>
                          <td>
                            <Link
                              to={`/teams/${team.slug}`}
                              className="table-link"
                            >
                              {team.team_name || "—"}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                </TableWrapper>
                <div className="pager">
                  <button
                    type="button"
                    className="pager-button"
                    onClick={() => setTeamPageIndex((prev) => Math.max(prev - 1, 0))}
                    disabled={teamPageIndex === 0}
                  >
                    Previous
                  </button>
                  <span className="pager-label">Page {teamPageIndex + 1}</span>
                  <button
                    type="button"
                    className="pager-button"
                    onClick={() => setTeamPageIndex((prev) => prev + 1)}
                    disabled={!hasNextTeamPage}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {profileTab === "wins" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Race wins</h2>
              <p>All race wins for this constructor (latest first).</p>
            </div>
          </div>
          <div className="tab-panel">
            {winsLoading ? (
              <div className="status-card">Loading wins…</div>
            ) : winsError ? (
              <div className="status-card error">{winsError}</div>
            ) : wins.length === 0 ? (
              <div className="status-card">No wins recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Grand Prix</th>
                      <th>Driver</th>
                      <th>Car</th>
                      <th>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wins.map((win, index) => (
                      <tr key={`${win.event_id}-${win.year}-${index}`}>
                        <td>{wins.length - index}</td>
                        <td>
                          {win.event_id ? (
                            <Link to={`/seasons/${win.year}/events/${win.event_slug}`} className="table-link">
                              {win.event_name || "Event"}
                            </Link>
                          ) : (
                            win.event_name || "—"
                          )}
                        </td>
                        <td>
                          {win.driver ? (
                            <Link to={`/drivers/${win.driver.slug}`} className="table-link">
                              {`${win.driver.first_name || ""} ${win.driver.last_name || ""}`.trim() ||
                                win.driver.short_name ||
                                "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {win.car ? (
                            <Link to={`/cars/${win.car.slug}`} className="table-link">
                              {win.car.chassis_name || "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {win.team ? (
                            <Link to={`/teams/${win.team.slug}`} className="table-link">
                              {win.team.team_name || win.team.short_name || "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrapper>
            )}
          </div>
        </section>
      ) : null}

      {profileTab === "poles" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Pole positions</h2>
              <p>All pole positions for this constructor (latest first).</p>
            </div>
          </div>
          <div className="tab-panel">
            {polesLoading ? (
              <div className="status-card">Loading pole positions…</div>
            ) : polesError ? (
              <div className="status-card error">{polesError}</div>
            ) : poles.length === 0 ? (
              <div className="status-card">No pole positions recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Grand Prix</th>
                      <th>Driver</th>
                      <th>Car</th>
                      <th>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {poles.map((pole, index) => (
                      <tr key={`${pole.event_id}-${pole.year}-${index}`}>
                        <td>{poles.length - index}</td>
                        <td>
                          {pole.event_id ? (
                            <Link to={`/seasons/${pole.year}/events/${pole.event_slug}`} className="table-link">
                              {pole.event_name || "Event"}
                            </Link>
                          ) : (
                            pole.event_name || "—"
                          )}
                        </td>
                        <td>
                          {pole.driver ? (
                            <Link to={`/drivers/${pole.driver.slug}`} className="table-link">
                              {`${pole.driver.first_name || ""} ${pole.driver.last_name || ""}`.trim() ||
                                pole.driver.short_name ||
                                "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {pole.car ? (
                            <Link to={`/cars/${pole.car.slug}`} className="table-link">
                              {pole.car.chassis_name || "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {pole.team ? (
                            <Link to={`/teams/${pole.team.slug}`} className="table-link">
                              {pole.team.team_name || pole.team.short_name || "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </TableWrapper>
            )}
          </div>
        </section>
      ) : null}

      {profileTab === "wins-by-year" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Wins by year</h2>
              <p>Race wins per active year for this constructor.</p>
            </div>
          </div>
          <div className="tab-panel">
            <ConstructorWinsByYear constructorId={parseInt(constructorId, 10)} />
          </div>
        </section>
      ) : null}

      {profileTab === "lineage" ? (
        <section className="section">
          <div className="section-header">
            <div>
              <h2>Lineage timeline</h2>
              <p>Evolution chain across predecessor and successor constructors.</p>
            </div>
            {canEdit ? (
              <button
                type="button"
                className="pill"
                onClick={openLineageModal}
                disabled={lineageLinkLoading}
              >
                Manage lineage
              </button>
            ) : null}
          </div>
          <div className="detail-card">
            {lineageLoading ? (
              <div className="status-card">Loading lineage timeline…</div>
            ) : lineageError ? (
              <div className="status-card error">{lineageError}</div>
            ) : lineageLinkError ? (
              <div className="status-card error">{lineageLinkError}</div>
            ) : !lineage ? (
              <div className="status-card">No lineage data available.</div>
            ) : (
              <div className="lineage-graph">
                <div className="lineage-column">
                  <div className="lineage-column-title">Predecessors</div>
                  <div className="lineage-node-stack">
                    {predecessorNodes.length ? (
                      predecessorNodes.map((node) => (
                        <Link
                          key={`pred-${node.constructor_id}`}
                          to={`/constructors/${node.slug}`}
                          className="lineage-node-link"
                        >
                          <span className="lineage-node-main">
                            {formatLineageConstructorName(node)}
                          </span>
                          <span className="lineage-node-years">
                            {formatLineageYears(node)}
                          </span>
                        </Link>
                      ))
                    ) : (
                      <div className="lineage-node-muted">—</div>
                    )}
                  </div>
                </div>
                <div className="lineage-column lineage-column-current">
                  <div className="lineage-column-title">Current</div>
                  <div className="lineage-node-current">
                    <span className="lineage-node-main">
                      {formatLineageConstructorName(
                        lineageNodesById.get(Number(constructorId))
                      )}
                    </span>
                    <span className="lineage-node-years">
                      {formatLineageYears(lineageNodesById.get(Number(constructorId)))}
                    </span>
                  </div>
                </div>
                <div className="lineage-column">
                  <div className="lineage-column-title">Successors</div>
                  <div className="lineage-node-stack">
                    {successorNodes.length ? (
                      successorNodes.map((node) => (
                        <Link
                          key={`succ-${node.constructor_id}`}
                          to={`/constructors/${node.slug}`}
                          className="lineage-node-link"
                        >
                          <span className="lineage-node-main">
                            {formatLineageConstructorName(node)}
                          </span>
                          <span className="lineage-node-years">
                            {formatLineageYears(node)}
                          </span>
                        </Link>
                      ))
                    ) : (
                      <div className="lineage-node-muted">—</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {canEdit && isLineageModalOpen ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{lineageLink ? "Update lineage link" : "Create lineage link"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => setIsLineageModalOpen(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleLineageSubmit}>
              <div className="form-grid">
                <label className="form-span">
                  Parent constructor
                  <select
                    name="parent_constructor_id"
                    value={lineageForm.parent_constructor_id}
                    onChange={handleLineageFieldChange}
                  >
                    <option value="">None</option>
                    {lineageConstructorOptions.map((option) => (
                      <option key={option.id} value={String(option.id)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-span">
                  Notes
                  <input
                    name="notes"
                    value={lineageForm.notes}
                    onChange={handleLineageFieldChange}
                  />
                </label>
              </div>
              {lineageSaveError ? (
                <div className="status-card error">{lineageSaveError}</div>
              ) : null}
              {lineageDeleteError ? (
                <div className="status-card error">{lineageDeleteError}</div>
              ) : null}
              <div className="modal-actions">
                {lineageLink ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setLineageDeleteError("");
                      setIsLineageDeleteOpen(true);
                    }}
                    disabled={lineageDeleting}
                  >
                    Delete lineage link
                  </button>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setIsLineageModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={lineageSaving}>
                  {lineageSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update constructor</h3>
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
                  Name
                  <input
                    name="name"
                    value={formValues.name}
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
                    required
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
                  Founded year
                  <input
                    type="number"
                    name="founded_year"
                    value={formValues.founded_year}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  Defunct year
                  <input
                    type="number"
                    name="defunct_year"
                    value={formValues.defunct_year}
                    onChange={handleFieldChange}
                  />
                </label>
                <label className="form-span">
                  Notes
                  <input
                    name="notes"
                    value={formValues.notes}
                    onChange={handleFieldChange}
                  />
                </label>
              </div>
              {saveError && <div className="status-card error">{saveError}</div>}
              {deleteError && (
                <div className="status-card error">{deleteError}</div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    setDeleteError("");
                    setIsDeleteOpen(true);
                  }}
                  disabled={deleting}
                >
                  Delete constructor
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
          isOpen={isDeleteOpen}
          title="Delete constructor?"
          message="This will permanently remove the constructor record."
          confirmLabel="Delete constructor"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}

      {canEdit ? (
        <ConfirmModal
          isOpen={isLineageDeleteOpen}
          title="Delete lineage link?"
          message="This will remove the parent-child lineage mapping for this constructor."
          confirmLabel="Delete link"
          onConfirm={handleLineageDelete}
          onCancel={() => setIsLineageDeleteOpen(false)}
          isLoading={lineageDeleting}
          error={lineageDeleteError}
        />
      ) : null}
    </div>
  );
}
