import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch, apiGet, apiUrl, clearApiCache } from "../lib/api.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import CountrySelect from "../components/CountrySelect.jsx";
import DataTable from "../components/DataTable.jsx";
import DriverName from "../components/DriverName.jsx";
import ImageCropper from "../components/ImageCropper.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import ReferencesSection from "../components/ReferencesSection.jsx";
import useCountries from "../hooks/useCountries.js";
import useAuthStatus from "../lib/useAuthStatus.js";

const emptyForm = {
  short_name: "",
  name: "",
  city: "",
  country: "",
  timezone: "",
  lat: "",
  lon: "",
  alt: "",
  url: "",
  opened_year: "",
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

export default function CircuitDetail() {
  const canEdit = useAuthStatus();
  const { circuitId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [circuit, setCircuit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [performance, setPerformance] = useState([]);
  const [performanceLoading, setPerformanceLoading] = useState(true);
  const [performanceError, setPerformanceError] = useState("");
  const [winners, setWinners] = useState([]);
  const [winnersLoading, setWinnersLoading] = useState(false);
  const [winnersError, setWinnersError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [profileTab, setProfileTab] = useState("details");
  const [activeTab, setActiveTab] = useState("details");
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState("");
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
  const [layoutEditingVersion, setLayoutEditingVersion] = useState(null);
  const [layoutForm, setLayoutForm] = useState({
    version_name: "",
    valid_from: "",
    valid_to: "",
    length_km: "",
    circuit_type: "",
    direction: "",
    turns: "",
  });
  const [layoutSaving, setLayoutSaving] = useState(false);
  const [layoutError, setLayoutError] = useState("");
  const [isLayoutImageOpen, setIsLayoutImageOpen] = useState(false);
  const [layoutImageVersion, setLayoutImageVersion] = useState(null);
  const [layoutImageFile, setLayoutImageFile] = useState(null);
  const [layoutImagePreview, setLayoutImagePreview] = useState("");
  const [layoutImageCropped, setLayoutImageCropped] = useState(null);
  const [layoutImageUploading, setLayoutImageUploading] = useState(false);
  const [layoutImageError, setLayoutImageError] = useState("");
  const [countryInputValue, setCountryInputValue] = useState("");
  const [countrySelection, setCountrySelection] = useState(null);
  const [countrySelectionError, setCountrySelectionError] = useState("");
  const { countries, countryByCode, countryByName, error: countriesError } =
    useCountries();

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [data, statsData, performanceData] = await Promise.all([
          apiGet(`/circuits/${circuitId}`),
          apiGet(`/circuits/${circuitId}/stats`),
          apiGet(`/circuits/${circuitId}/performance`),
        ]);
        if (isActive) {
          setCircuit(data);
          setStats(statsData);
          setPerformance(Array.isArray(performanceData) ? performanceData : []);
          setFormValues({
            short_name: data.short_name || "",
            name: data.name || "",
            city: data.city || "",
            country: data.country || "",
            timezone: data.timezone || "",
            lat: data.lat ?? "",
            lon: data.lon ?? "",
            alt: data.alt ?? "",
            url: data.url || "",
            opened_year: data.opened_year ?? "",
            notes: data.notes || "",
          });
          setError("");
          setStatsError("");
          setPerformanceError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load circuit.");
          setStatsError(err.message || "Failed to load circuit stats.");
          setPerformanceError(
            err.message || "Failed to load circuit performance."
          );
        }
      } finally {
        if (isActive) {
          setLoading(false);
          setStatsLoading(false);
          setPerformanceLoading(false);
        }
      }
    }

    load();
    return () => {
      isActive = false;
    };
  }, [circuitId]);

  useEffect(() => {
    if (profileTab !== "wins") return;
    let isActive = true;

    async function loadWinners() {
      setWinnersLoading(true);
      try {
        const data = await apiGet(`/circuits/${circuitId}/winners`);
        if (!isActive) return;
        setWinners(Array.isArray(data) ? data : []);
        setWinnersError("");
      } catch (err) {
        if (isActive) {
          setWinnersError(err.message || "Failed to load circuit winners.");
        }
      } finally {
        if (isActive) {
          setWinnersLoading(false);
        }
      }
    }

    loadWinners();
    return () => {
      isActive = false;
    };
  }, [profileTab, circuitId]);

  useEffect(() => {
    return () => {
      if (layoutImagePreview) {
        URL.revokeObjectURL(layoutImagePreview);
      }
    };
  }, [layoutImagePreview]);

  const heroTitle = useMemo(() => {
    if (!circuit) return "Circuit profile";
    return circuit.name || circuit.short_name || "Circuit profile";
  }, [circuit]);

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

  const formatSeconds = (value) => {
    if (value === null || value === undefined) return "—";
    const total = Number(value);
    if (Number.isNaN(total)) return "—";
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    const formattedMinutes = String(minutes).padStart(2, "0");
    const formattedSeconds = seconds.toFixed(3).padStart(6, "0");
    return `${formattedMinutes}:${formattedSeconds}`;
  };

  const { performanceData, missingPoleData, missingFastestData } = useMemo(() => {
    if (!performance.length) {
      return {
        performanceData: [],
        missingPoleData: [],
        missingFastestData: [],
      };
    }
    const sorted = [...performance].sort((a, b) => a.year - b.year);
    const minYear = sorted[0].year;
    const maxYear = sorted[sorted.length - 1].year;
    const byYear = new Map(sorted.map((row) => [row.year, row]));
    const data = [];
    const missingPole = [];
    const missingFastest = [];
    let prevPole = null;
    let prevFastest = null;

    for (let year = minYear; year <= maxYear; year += 1) {
      const row = byYear.get(year);
      if (row) {
        prevPole = row.pole_time_s ?? prevPole;
        prevFastest = row.fastest_lap_time_s ?? prevFastest;
        data.push({
          year,
          poleLine: row.pole_time_s ?? null,
          fastestLine: row.fastest_lap_time_s ?? null,
        });
      } else {
        data.push({
          year,
          poleLine: null,
          fastestLine: null,
        });
        if (prevPole !== null) {
          missingPole.push({ year, value: prevPole });
        }
        if (prevFastest !== null) {
          missingFastest.push({ year, value: prevFastest });
        }
      }
    }
    return {
      performanceData: data,
      missingPoleData: missingPole,
      missingFastestData: missingFastest,
    };
  }, [performance]);

  const layoutBands = useMemo(() => {
    if (!performanceData.length || !versions.length) return [];
    const years = performanceData.map((item) => item.year);
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);
    const sorted = versions
      .slice()
      .filter((version) => version.valid_from || version.valid_to)
      .sort((a, b) => (a.valid_from ?? 0) - (b.valid_from ?? 0));
    const bands = [];
    sorted.forEach((version, index) => {
      const start = version.valid_from ?? minYear;
      let end = version.valid_to ?? maxYear;
      if (end < start) {
        end = start;
      }
      bands.push({
        id: version.id || `${start}-${end}`,
        start,
        end,
        fill: index % 2 === 0 ? "rgba(74, 144, 226, 0.12)" : "rgba(31, 28, 25, 0.06)",
        line: index % 2 === 0 ? "rgba(74, 144, 226, 0.5)" : "rgba(31, 28, 25, 0.3)",
      });
    });
    return bands;
  }, [performanceData, versions]);

  const latestLayoutUpdatedAt = useMemo(() => {
    if (!versions.length) return null;
    return versions.reduce((latest, version) => {
      if (!version?.updated_at) return latest;
      if (!latest) return version.updated_at;
      return new Date(version.updated_at) > new Date(latest)
        ? version.updated_at
        : latest;
    }, null);
  }, [versions]);

  const sortedWinners = useMemo(() => {
    return [...winners].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return (a.event_id || 0) - (b.event_id || 0);
    });
  }, [winners]);

  const renderMissingX = ({ cx, cy }) => {
    if (cx == null || cy == null) return null;
    const size = 6;
    return (
      <g>
        <line
          x1={cx - size}
          y1={cy - size}
          x2={cx + size}
          y2={cy + size}
          stroke="#111827"
          strokeWidth={2}
        />
        <line
          x1={cx - size}
          y1={cy + size}
          x2={cx + size}
          y2={cy - size}
          stroke="#111827"
          strokeWidth={2}
        />
      </g>
    );
  };

  const resolveCountry = useCallback(
    (value) => {
      if (!value) return null;
      const key = String(value).toLowerCase();
      return countryByCode.get(key) || countryByName.get(key) || null;
    },
    [countryByCode, countryByName]
  );

  const resolvedCountry = useMemo(
    () => resolveCountry(circuit?.country),
    [circuit, resolveCountry]
  );

  useEffect(() => {
    if (!circuit || !countries.length) return;
    if (isModalOpen && (countrySelection || countryInputValue)) return;
    const match = resolveCountry(circuit.country);
    if (match) {
      setCountrySelection(match);
      setCountryInputValue(match.name || "");
    } else {
      setCountrySelection(null);
      setCountryInputValue(circuit.country || "");
    }
  }, [
    circuit,
    countries,
    resolveCountry,
    isModalOpen,
    countrySelection,
    countryInputValue,
  ]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const handleCountryChange = (_, value) => {
    setCountrySelection(value);
    setCountrySelectionError("");
    setFormValues((prev) => ({
      ...prev,
      country: value?.code || "",
    }));
  };

  const handleCountryInputChange = (_, value, reason) => {
    setCountryInputValue(value);
    if (!value && reason === "clear") {
      setCountrySelection(null);
      setFormValues((prev) => ({
        ...prev,
        country: "",
      }));
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setCountrySelectionError("");

    try {
      if (countryInputValue && !countrySelection) {
        const rawCountry = formValues.country || "";
        if (countryInputValue.toLowerCase() !== rawCountry.toLowerCase()) {
          setCountrySelectionError("Select a country from the list.");
          throw new Error("Select a country from the list.");
        }
      }
      const payload = {
        short_name: formValues.short_name || null,
        name: formValues.name || null,
        city: formValues.city || null,
        country: formValues.country || null,
        timezone: formValues.timezone || null,
        lat: formValues.lat === "" ? null : Number(formValues.lat),
        lon: formValues.lon === "" ? null : Number(formValues.lon),
        alt: formValues.alt === "" ? null : Number(formValues.alt),
        url: formValues.url || null,
        opened_year: formValues.opened_year
          ? Number(formValues.opened_year)
          : null,
        notes: formValues.notes || null,
      };
      const response = await apiFetch(`/circuits/${circuitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update circuit.");
      }
      const updated = await response.json();
      setCircuit(updated);
      setIsModalOpen(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update circuit.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!circuitId) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const response = await apiFetch(`/circuits/${circuitId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete circuit.");
      }
      setIsDeleteModalOpen(false);
      setIsModalOpen(false);
      navigate("/");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete circuit.");
    } finally {
      setDeleting(false);
    }
  };

  const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return apiUrl(url);
  };

  const loadVersions = async () => {
    if (!circuitId) return;
    setVersionsLoading(true);
    setVersionsError("");
    try {
      clearApiCache(`/circuit-versions/by-circuit/${circuitId}`);
      const data = await apiGet(`/circuit-versions/by-circuit/${circuitId}`);
      setVersions(Array.isArray(data) ? data : []);
    } catch (err) {
      setVersions([]);
      setVersionsError(err.message || "Failed to load layouts.");
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    if (profileTab !== "details" || activeTab !== "layouts") return;
    loadVersions();
  }, [activeTab, circuitId, profileTab]);

  const handleLayoutFormChange = (event) => {
    const { name, value } = event.target;
    setLayoutForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreateLayout = async (event) => {
    event.preventDefault();
    if (!circuitId) return;
    setLayoutSaving(true);
    setLayoutError("");
    try {
      const payload = {
        circuit_id: Number(circuitId),
        version_name: layoutForm.version_name || null,
        valid_from: layoutForm.valid_from
          ? Number(layoutForm.valid_from)
          : null,
        valid_to: layoutForm.valid_to ? Number(layoutForm.valid_to) : null,
        length_km: layoutForm.length_km ? Number(layoutForm.length_km) : null,
        circuit_type: layoutForm.circuit_type || null,
        direction: layoutForm.direction || null,
        turns: layoutForm.turns ? Number(layoutForm.turns) : null,
      };
      const url = layoutEditingVersion
        ? `/circuit-versions/${layoutEditingVersion.id}`
        : "/circuit-versions/";
      const response = await apiFetch(url, {
        method: layoutEditingVersion ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to save layout.");
      }
      await response.json();
      setIsLayoutModalOpen(false);
      setLayoutEditingVersion(null);
      setLayoutForm({
        version_name: "",
        valid_from: "",
        valid_to: "",
        length_km: "",
        circuit_type: "",
        direction: "",
        turns: "",
      });
      loadVersions();
    } catch (err) {
      setLayoutError(err.message || "Failed to save layout.");
    } finally {
      setLayoutSaving(false);
    }
  };

  const handleLayoutImageSelection = (event) => {
    const file = event.target.files?.[0] || null;
    if (layoutImagePreview) {
      URL.revokeObjectURL(layoutImagePreview);
    }
    if (!file) {
      setLayoutImageFile(null);
      setLayoutImagePreview("");
      return;
    }
    setLayoutImageFile(file);
    setLayoutImagePreview(URL.createObjectURL(file));
    setLayoutImageCropped(null);
    setLayoutImageError("");
  };

  const handleUploadLayoutImage = async (event) => {
    event.preventDefault();
    if (!layoutImageFile || !layoutImageVersion) {
      setLayoutImageError("Select an image to upload.");
      return;
    }
    setLayoutImageUploading(true);
    setLayoutImageError("");
    try {
      const formData = new FormData();
      const uploadFile =
        layoutImageCropped && layoutImageCropped instanceof Blob
          ? new File([layoutImageCropped], "layout-image", {
              type: layoutImageCropped.type || "image/jpeg",
            })
          : layoutImageFile;
      formData.append("file", uploadFile);
      const response = await apiFetch(
        `/circuit-versions/${layoutImageVersion.id}/image`,
        { method: "POST", body: formData }
      );
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to upload layout image.");
      }
      await response.json();
      setIsLayoutImageOpen(false);
      setLayoutImageFile(null);
      setLayoutImageCropped(null);
      if (layoutImagePreview) {
        URL.revokeObjectURL(layoutImagePreview);
      }
      setLayoutImagePreview("");
      setLayoutImageVersion(null);
      loadVersions();
    } catch (err) {
      setLayoutImageError(err.message || "Failed to upload layout image.");
    } finally {
      setLayoutImageUploading(false);
    }
  };

  return (
    <div className="page">
      <SeoHead
        title={circuit?.name || "Circuit"}
        description={
          circuit?.name
            ? `Formula 1 events and history at ${circuit.name}.`
            : undefined
        }
        ogType="profile"
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Circuit profile</p>
          <h1>{heroTitle}</h1>
          <p className="hero-subtitle">
            Review circuit details and maintain location metadata.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="ghost link-pill"
              onClick={() => {
                navigate(location.state?.returnTo || "/circuits");
              }}
            >
              Back to circuits
            </button>
            {canEdit ? (
              <button
                type="button"
                className="pill"
                onClick={() => setIsModalOpen(true)}
                disabled={!circuit}
              >
                Update circuit
              </button>
            ) : null}
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Circuit stats</div>
          <div className="panel-grid">
            <div className="panel-card">
              <div className="panel-label">Events</div>
              <div className="panel-value">
                {statsLoading ? "—" : stats?.event_count ?? "—"}
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-label">First event</div>
              <div className="panel-value">
                {statsLoading
                  ? "—"
                  : stats?.first_event_name || "—"}
              </div>
              <div className="panel-meta-value">
                {statsLoading
                  ? "—"
                  : formatDate(stats?.first_event_date)}
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-label">Last event</div>
              <div className="panel-value">
                {statsLoading
                  ? "—"
                  : stats?.last_event_name || "—"}
              </div>
              <div className="panel-meta-value">
                {statsLoading
                  ? "—"
                  : formatDate(stats?.last_event_date)}
              </div>
            </div>
          </div>
          {statsError && <div className="status-card error">{statsError}</div>}
        </div>
      </section>

      <section className="section">
        <div className="tabs">
          <button
            type="button"
            className={`tab-button${profileTab === "details" ? " is-active" : ""}`}
            onClick={() => setProfileTab("details")}
          >
            Details
          </button>
          <button
            type="button"
            className={`tab-button${profileTab === "wins" ? " is-active" : ""}`}
            onClick={() => setProfileTab("wins")}
          >
            Wins
          </button>
        </div>
        {loading ? (
          <div className="status-card">Loading circuit…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : profileTab === "details" ? (
          <>
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
                className={`tab-button${activeTab === "layouts" ? " is-active" : ""}`}
                onClick={() => setActiveTab("layouts")}
              >
                Layouts
              </button>
              <button
                type="button"
                className={`tab-button${activeTab === "performance" ? " is-active" : ""}`}
                onClick={() => setActiveTab("performance")}
              >
                Time vs Year
              </button>
            </div>
            {activeTab === "details" ? (
              <>
                <div className="detail-card">
                  <div className="detail-grid">
                    <div className="detail-item">
                      <span className="detail-label">Name</span>
                      <span className="detail-value">{circuit?.name || "—"}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Short name</span>
                      <span className="detail-value">{circuit?.short_name || "—"}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">City</span>
                      <span className="detail-value">{circuit?.city || "—"}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Country</span>
                      <span className="detail-value">
                        {resolvedCountry ? (
                          <span className="table-driver">
                            {resolvedCountry.alpha2_code ? (
                              <img
                                className="flag-icon"
                                src={`https://flagcdn.com/24x18/${resolvedCountry.alpha2_code.toLowerCase()}.png`}
                                alt={
                                  resolvedCountry.name
                                    ? `${resolvedCountry.name} flag`
                                    : "Country flag"
                                }
                                loading="lazy"
                              />
                            ) : null}
                            <span>{resolvedCountry.name}</span>
                          </span>
                        ) : (
                          circuit?.country || "—"
                        )}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Latitude</span>
                      <span className="detail-value">{circuit?.lat ?? "—"}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Longitude</span>
                      <span className="detail-value">{circuit?.lon ?? "—"}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Altitude</span>
                      <span className="detail-value">{circuit?.alt ?? "—"}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Timezone</span>
                      <span className="detail-value">
                        {circuit?.timezone || "—"}
                      </span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Opened</span>
                      <span className="detail-value">
                        {circuit?.opened_year || "—"}
                      </span>
                    </div>
                    <div className="detail-item detail-span">
                      <span className="detail-label">URL</span>
                      <span className="detail-value">
                        {circuit?.url ? (
                          <a href={circuit.url} target="_blank" rel="noreferrer">
                            {circuit.url}
                          </a>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                    <div className="detail-item detail-span">
                      <span className="detail-label">Notes</span>
                      <span className="detail-value">{circuit?.notes || "—"}</span>
                    </div>
                  </div>
                  <div className="detail-updated-corner">
                    Updated {formatUpdatedAt(circuit?.updated_at) || "—"}
                  </div>
                </div>
                <ReferencesSection entityType="circuit" entityId={circuit?.id} />
              </>
            ) : activeTab === "performance" ? (
              <div className="detail-card">
                <div className="detail-card-header">
                  <div>
                    <h2>Time vs Year</h2>
                    <p>Pole position and fastest lap times (F1 World).</p>
                  </div>
                </div>
                {performanceLoading ? (
                  <div className="status-card">Loading performance…</div>
                ) : performanceError ? (
                  <div className="status-card error">{performanceError}</div>
                ) : performanceData.length === 0 ? (
                  <div className="status-card">No performance data yet.</div>
                ) : (
                  <div style={{ width: "100%", height: 320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={performanceData} margin={{ left: 8, right: 16 }}>
                        {layoutBands.map((band) => (
                          <ReferenceArea
                            key={`band-${band.id}`}
                            x1={band.start}
                            x2={band.end}
                            fill={band.fill}
                            fillOpacity={1}
                            ifOverflow="extendDomain"
                          />
                        ))}
                        {layoutBands.flatMap((band) => [
                          <ReferenceLine
                            key={`band-start-${band.id}`}
                            x={band.start}
                            stroke={band.line}
                            strokeDasharray="3 3"
                            ifOverflow="extendDomain"
                          />,
                          <ReferenceLine
                            key={`band-end-${band.id}`}
                            x={band.end}
                            stroke={band.line}
                            strokeDasharray="3 3"
                            ifOverflow="extendDomain"
                          />,
                        ])}
                        <CartesianGrid strokeDasharray="4 4" />
                        <XAxis dataKey="year" />
                        <YAxis
                          domain={["auto", "auto"]}
                          tickFormatter={formatSeconds}
                          allowDecimals={false}
                          width={70}
                        />
                        <Tooltip
                          formatter={(value) => formatSeconds(value)}
                          labelFormatter={(label) => `Year ${label}`}
                        />
                        <Legend />
                        <Line
                          type="linear"
                          dataKey="poleLine"
                          stroke="#f4b942"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                          name="Pole time"
                        />
                        <Line
                          type="linear"
                          dataKey="fastestLine"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          connectNulls={false}
                          name="Fastest lap"
                        />
                        <Scatter
                          data={missingPoleData}
                          dataKey="value"
                          shape={renderMissingX}
                          name="Missing pole"
                        />
                        <Scatter
                          data={missingFastestData}
                          dataKey="value"
                          shape={renderMissingX}
                          name="Missing fastest"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            ) : (
              <div className="detail-card">
                <div className="detail-card-header">
                  <div>
                    <h2>Layouts</h2>
                    <p>Track layout versions for this circuit.</p>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      className="pill"
                      onClick={() => {
                        setLayoutEditingVersion(null);
                        setLayoutForm({
                          version_name: "",
                          valid_from: "",
                          valid_to: "",
                          length_km: "",
                          circuit_type: "",
                          direction: "",
                          turns: "",
                        });
                        setIsLayoutModalOpen(true);
                      }}
                    >
                      Add layout
                    </button>
                  ) : null}
                </div>
                {versionsLoading ? (
                  <div className="status-card">Loading layouts…</div>
                ) : versionsError ? (
                  <div className="status-card error">{versionsError}</div>
                ) : versions.length === 0 ? (
                  <div className="status-card">No layouts recorded yet.</div>
                ) : (
                  <>
                    <TableWrapper>
                      <DataTable>
                        <thead>
                          <tr>
                            <th>Layout</th>
                            <th>Years</th>
                            <th>Length (km)</th>
                            <th>Type</th>
                            <th>Direction</th>
                            <th>Turns</th>
                            <th>Image</th>
                            {canEdit ? <th>Actions</th> : null}
                          </tr>
                        </thead>
                        <tbody>
                          {versions.map((version) => (
                            <tr key={version.id}>
                              <td>{version.version_name || "—"}</td>
                              <td>
                                {version.valid_from || "—"}
                                {version.valid_to ? ` → ${version.valid_to}` : ""}
                              </td>
                              <td>
                                {version.length_km !== null &&
                                version.length_km !== undefined
                                  ? version.length_km
                                  : "—"}
                              </td>
                              <td>{version.circuit_type || "—"}</td>
                              <td>{version.direction || "—"}</td>
                              <td>{version.turns ?? "—"}</td>
                              <td>
                                {version.layout_image_url ? (
                                  <img
                                    className="layout-thumb"
                                    src={resolveImageUrl(version.layout_image_url)}
                                    alt="Layout"
                                    loading="lazy"
                                  />
                                ) : (
                                  "—"
                                )}
                              </td>
                              {canEdit ? (
                                <td>
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => {
                                      setLayoutEditingVersion(version);
                                      setLayoutForm({
                                        version_name: version.version_name || "",
                                        valid_from:
                                          version.valid_from !== null &&
                                          version.valid_from !== undefined
                                            ? String(version.valid_from)
                                            : "",
                                        valid_to:
                                          version.valid_to !== null &&
                                          version.valid_to !== undefined
                                            ? String(version.valid_to)
                                            : "",
                                        length_km:
                                          version.length_km !== null &&
                                          version.length_km !== undefined
                                            ? String(version.length_km)
                                            : "",
                                        circuit_type: version.circuit_type || "",
                                        direction: version.direction || "",
                                        turns:
                                          version.turns !== null &&
                                          version.turns !== undefined
                                            ? String(version.turns)
                                            : "",
                                      });
                                      setIsLayoutModalOpen(true);
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost-button"
                                    onClick={() => {
                                      setLayoutImageVersion(version);
                                      setIsLayoutImageOpen(true);
                                    }}
                                  >
                                    Upload image
                                  </button>
                                </td>
                              ) : null}
                            </tr>
                          ))}
                        </tbody>
                      </DataTable>
                    </TableWrapper>
                    <div className="table-footer">
                      Updated {formatUpdatedAt(latestLayoutUpdatedAt) || "—"}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="detail-card">
            <div className="detail-card-header">
              <div>
                <h2>Winners by Year</h2>
                <p>Race winners at this circuit (F1 World).</p>
              </div>
            </div>
            {winnersLoading ? (
              <div className="status-card">Loading winners…</div>
            ) : winnersError ? (
              <div className="status-card error">{winnersError}</div>
            ) : sortedWinners.length === 0 ? (
              <div className="status-card">No winners recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Event</th>
                      <th>Winner</th>
                      <th>Team</th>
                      <th>Car</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWinners.map((winner) => (
                      <tr key={`${winner.year}-${winner.event_id}-${winner.driver?.id || "driver"}`}>
                        <td>{winner.year}</td>
                        <td>
                          {winner.event_id ? (
                            <Link
                              to={`/seasons/${winner.year}/events/${winner.event_slug}`}
                              className="table-link"
                            >
                              {winner.event_name || "Event"}
                            </Link>
                          ) : (
                            winner.event_name || "—"
                          )}
                        </td>
                        <td>
                          {winner.driver ? (
                            <Link
                              to={`/drivers/${winner.driver.slug}`}
                              className="table-link"
                            >
                              <DriverName
                                driver={winner.driver}
                                countryByCode={countryByCode}
                              />
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {winner.team ? (
                            <Link
                              to={`/teams/${winner.team.slug}`}
                              className="table-link"
                            >
                              {winner.team.name || winner.team.short_name || "—"}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {winner.car ? (
                            <Link
                              to={`/cars/${winner.car.slug}`}
                              className="table-link"
                            >
                              {winner.car.chassis_name || "—"}
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
        )}
      </section>

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update circuit</h3>
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
                  City
                  <input
                    name="city"
                    value={formValues.city}
                    onChange={handleFieldChange}
                  />
                </label>
                <CountrySelect
                  label="Country"
                  options={countries}
                  value={countrySelection}
                  inputValue={countryInputValue}
                  onInputChange={handleCountryInputChange}
                  onChange={handleCountryChange}
                  error={Boolean(countrySelectionError)}
                  helperText={countrySelectionError}
                />
                <label>
                  Latitude
                  <input
                    type="number"
                    name="lat"
                    value={formValues.lat}
                    onChange={handleFieldChange}
                    step="any"
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="number"
                    name="lon"
                    value={formValues.lon}
                    onChange={handleFieldChange}
                    step="any"
                  />
                </label>
                <label>
                  Altitude
                  <input
                    type="number"
                    name="alt"
                    value={formValues.alt}
                    onChange={handleFieldChange}
                    step="any"
                  />
                </label>
                <label>
                  Timezone
                  <input
                    name="timezone"
                    value={formValues.timezone}
                    onChange={handleFieldChange}
                    placeholder="e.g., Asia/Bahrain"
                  />
                </label>
                <label>
                  Opened year
                  <input
                    type="number"
                    name="opened_year"
                    value={formValues.opened_year}
                    onChange={handleFieldChange}
                  />
                </label>
                <label className="form-span">
                  URL
                  <input
                    name="url"
                    value={formValues.url}
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
              {countriesError && (
                <div className="status-card error">{countriesError}</div>
              )}
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
                  Delete circuit
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
          title="Delete circuit?"
          message="This will permanently remove the circuit record."
          confirmLabel="Delete circuit"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteModalOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}

      {canEdit && isLayoutModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>{layoutEditingVersion ? "Update layout" : "Add layout"}</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setIsLayoutModalOpen(false);
                  setLayoutEditingVersion(null);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateLayout}>
              <div className="form-grid">
                <label>
                  Version name
                  <input
                    name="version_name"
                    value={layoutForm.version_name}
                    onChange={handleLayoutFormChange}
                    required
                  />
                </label>
                <label>
                  Valid from (year)
                  <input
                    type="number"
                    min="1800"
                    max="2200"
                    name="valid_from"
                    value={layoutForm.valid_from}
                    onChange={handleLayoutFormChange}
                  />
                </label>
                <label>
                  Valid to (year)
                  <input
                    type="number"
                    min="1800"
                    max="2200"
                    name="valid_to"
                    value={layoutForm.valid_to}
                    onChange={handleLayoutFormChange}
                  />
                </label>
                <label>
                  Length (km)
                  <input
                    type="number"
                    step="0.001"
                    name="length_km"
                    value={layoutForm.length_km}
                    onChange={handleLayoutFormChange}
                  />
                </label>
                <label>
                  Circuit type
                  <select
                    name="circuit_type"
                    value={layoutForm.circuit_type}
                    onChange={handleLayoutFormChange}
                  >
                    <option value="">Select</option>
                    <option value="circuit">Circuit</option>
                    <option value="street">Street</option>
                    <option value="hybrid">Hybrid</option>
                    <option value="temporary">Temporary</option>
                    <option value="oval">Oval</option>
                    <option value="road">Road</option>
                  </select>
                </label>
                <label>
                  Direction
                  <select
                    name="direction"
                    value={layoutForm.direction}
                    onChange={handleLayoutFormChange}
                  >
                    <option value="">Select</option>
                    <option value="clockwise">Clockwise</option>
                    <option value="counterclockwise">Counter-clockwise</option>
                  </select>
                </label>
                <label>
                  Turns
                  <input
                    type="number"
                    name="turns"
                    value={layoutForm.turns}
                    onChange={handleLayoutFormChange}
                  />
                </label>
              </div>
              {layoutError && (
                <div className="status-card error">{layoutError}</div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setIsLayoutModalOpen(false);
                    setLayoutEditingVersion(null);
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={layoutSaving}>
                  {layoutSaving
                    ? "Saving…"
                    : layoutEditingVersion
                    ? "Update layout"
                    : "Create layout"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {canEdit && isLayoutImageOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Upload layout image</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setIsLayoutImageOpen(false);
                  setLayoutImageFile(null);
                  setLayoutImageCropped(null);
                  if (layoutImagePreview) {
                    URL.revokeObjectURL(layoutImagePreview);
                  }
                  setLayoutImagePreview("");
                  setLayoutImageVersion(null);
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleUploadLayoutImage}>
              <div className="form-grid">
                <label className="form-span">
                  Image file
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleLayoutImageSelection}
                  />
                </label>
                <div className="form-span">
                  <ImageCropper
                    file={layoutImageFile}
                    aspect={16 / 9}
                    outputWidth={1200}
                    onCropped={setLayoutImageCropped}
                    onError={(message) => setLayoutImageError(message)}
                  />
                </div>
              </div>
              {layoutImageError && (
                <div className="status-card error">{layoutImageError}</div>
              )}
              <div className="modal-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => {
                    setIsLayoutImageOpen(false);
                    setLayoutImageFile(null);
                    setLayoutImageCropped(null);
                    if (layoutImagePreview) {
                      URL.revokeObjectURL(layoutImagePreview);
                    }
                    setLayoutImagePreview("");
                    setLayoutImageVersion(null);
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="pill"
                  disabled={layoutImageUploading}
                >
                  {layoutImageUploading ? "Uploading…" : "Upload image"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
