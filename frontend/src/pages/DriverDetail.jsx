import React, { useEffect, useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiFetch, apiGet, apiUrl } from "../lib/api.js";
import DriverName from "../components/DriverName.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import ImageCropper from "../components/ImageCropper.jsx";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverWinsByYear from "../components/DriverWinsByYear.jsx";
import ReferencesSection from "../components/ReferencesSection.jsx";
import useAuthStatus from "../lib/useAuthStatus.js";

const emptyForm = {
  first_name: "",
  last_name: "",
  driverCode: "",
  url: "",
  dob: "",
  dod: "",
  nationality: "",
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

export default function DriverDetail() {
  const canEdit = useAuthStatus();
  // The route is keyed by the driver's name-slug; the backend resolves it.
  const { slug: driverId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [formValues, setFormValues] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [countries, setCountries] = useState([]);
  const [countriesError, setCountriesError] = useState("");
  const [countryInputValue, setCountryInputValue] = useState("");
  const [countrySelection, setCountrySelection] = useState(null);
  const [countrySelectionError, setCountrySelectionError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState("");
  const [wins, setWins] = useState([]);
  const [winsLoading, setWinsLoading] = useState(false);
  const [winsError, setWinsError] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageDeleting, setImageDeleting] = useState(false);
  const [imageCropped, setImageCropped] = useState(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [driverTeams, setDriverTeams] = useState([]);
  const [driverTeamsLoading, setDriverTeamsLoading] = useState(false);
  const [driverTeamsError, setDriverTeamsError] = useState("");

  const countryByCode = useMemo(() => {
    const map = new Map();
    countries.forEach((country) => {
      if (country?.code) {
        map.set(country.code.toLowerCase(), country);
      }
    });
    return map;
  }, [countries]);

  const resolvedCountry = useMemo(() => {
    if (!driver?.nationality) return null;
    return countryByCode.get(driver.nationality.toLowerCase()) || null;
  }, [driver, countryByCode]);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const [driverData, statsData] = await Promise.all([
          apiGet(`/drivers/${driverId}`),
          apiGet(`/drivers/${driverId}/stats`),
        ]);
        if (isActive) {
          setDriver(driverData);
          setStats(statsData);
          setFormValues({
            first_name: driverData.first_name || "",
            last_name: driverData.last_name || "",
            driverCode: driverData.driverCode || "",
            url: driverData.url || "",
            dob: driverData.dob || "",
            dod: driverData.dod || "",
            nationality: driverData.nationality || "",
          });
          setCountryInputValue("");
          setCountrySelection(null);
          setError("");
          setStatsError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load driver.");
          setStatsError(err.message || "Failed to load driver stats.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
          setStatsLoading(false);
        }
      }
    }

    load();
    return () => {
      isActive = false;
    };
  }, [driverId]);

  useEffect(() => {
    if (activeTab !== "wins") return;
    let isActive = true;

    async function loadWins() {
      setWinsLoading(true);
      try {
        const data = await apiGet(`/drivers/${driverId}/wins`);
        if (!isActive) return;
        setWins(Array.isArray(data) ? data : []);
        setWinsError("");
      } catch (err) {
        if (isActive) {
          setWinsError(err.message || "Failed to load driver wins.");
        }
      } finally {
        if (isActive) {
          setWinsLoading(false);
        }
      }
    }

    loadWins();
    return () => {
      isActive = false;
    };
  }, [activeTab, driverId]);

  useEffect(() => {
    if (activeTab !== "teams") return;
    let isActive = true;

    async function loadTeams() {
      setDriverTeamsLoading(true);
      try {
        const data = await apiGet(`/drivers/${driverId}/teams`);
        if (!isActive) return;
        setDriverTeams(Array.isArray(data) ? data : []);
        setDriverTeamsError("");
      } catch (err) {
        if (isActive) {
          setDriverTeamsError(err.message || "Failed to load driver teams.");
        }
      } finally {
        if (isActive) {
          setDriverTeamsLoading(false);
        }
      }
    }

    loadTeams();
    return () => {
      isActive = false;
    };
  }, [activeTab, driverId]);

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    let isActive = true;

    async function loadCountries() {
      try {
        const data = await apiGet("/countries?limit=500");
        if (isActive) {
          setCountries(Array.isArray(data) ? data : []);
          setCountriesError("");
        }
      } catch (err) {
        if (isActive) {
          setCountries([]);
          setCountriesError(err.message || "Failed to load countries.");
        }
      }
    }

    loadCountries();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!driver || !countries.length) return;
    if (!driver.nationality) return;
    if (isModalOpen && (countrySelection || countryInputValue)) return;
    const match = countryByCode.get(driver.nationality.toLowerCase());
    if (match) {
      setCountrySelection(match);
      setCountryInputValue(match.name || "");
    }
  }, [
    driver,
    countries,
    countryByCode,
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
      nationality: value?.code || "",
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");
    setCountrySelectionError("");

    try {
      if (countryInputValue && !countrySelection) {
        setCountrySelectionError("Select a country from the list.");
        throw new Error("Select a country from the list.");
      }
      const payload = {
        first_name: formValues.first_name || null,
        last_name: formValues.last_name || null,
        driverCode: formValues.driverCode || null,
        url: formValues.url || null,
        dob: formValues.dob || null,
        dod: formValues.dod || null,
        nationality: formValues.nationality || null,
      };
      const response = await apiFetch(`/drivers/${driverId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update driver.");
      }
      const updated = await response.json();
      setDriver(updated);
      setIsModalOpen(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update driver.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!driverId) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const response = await apiFetch(`/drivers/${driverId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete driver.");
      }
      setIsDeleteModalOpen(false);
      setIsModalOpen(false);
      navigate("/");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete driver.");
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

  const imageUrl = useMemo(
    () => resolveImageUrl(driver?.image_url || ""),
    [driver]
  );

  const handleImageSelection = (event) => {
    const file = event.target.files?.[0] || null;
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    if (!file) {
      setImageFile(null);
      setImagePreview("");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setImageCropped(null);
    setImageError("");
  };

  const handleUploadImage = async (event) => {
    event.preventDefault();
    if (!imageFile || !driverId) {
      setImageError("Select an image to upload.");
      return;
    }
    setImageUploading(true);
    setImageError("");

    try {
      const formData = new FormData();
      const uploadFile =
        imageCropped && imageCropped instanceof Blob
          ? new File([imageCropped], "driver-image", {
              type: imageCropped.type || "image/jpeg",
            })
          : imageFile;
      formData.append("file", uploadFile);
      const response = await apiFetch(`/drivers/${driverId}/image`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to upload image.");
      }
      const data = await response.json();
      setDriver((prev) =>
        prev ? { ...prev, image_url: data.image_url } : prev
      );
      setIsImageModalOpen(false);
      setImageFile(null);
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
      setImagePreview("");
      setImageCropped(null);
    } catch (err) {
      setImageError(err.message || "Failed to upload image.");
    } finally {
      setImageUploading(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!driverId) return;
    setImageDeleting(true);
    setImageError("");
    try {
      const response = await apiFetch(`/drivers/${driverId}/image`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to remove image.");
      }
      setDriver((prev) => (prev ? { ...prev, image_url: null } : prev));
    } catch (err) {
      setImageError(err.message || "Failed to remove image.");
    } finally {
      setImageDeleting(false);
    }
  };

  return (
    <div className="page">
      <SeoHead
        title={
          driver
            ? `${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() ||
              "Driver"
            : "Driver"
        }
        description={
          driver
            ? `Formula 1 career stats, wins, and teams for ${driver.first_name ?? ""} ${driver.last_name ?? ""}.`.trim()
            : undefined
        }
        ogType="profile"
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Driver profile</p>
          <div className="driver-hero">
            {imageUrl ? (
              <img
                className="driver-hero-image driver-hero-image-clickable"
                src={imageUrl}
                alt={driver?.first_name || "Driver"}
                onClick={() => setIsPhotoModalOpen(true)}
              />
            ) : (
              <div className="driver-hero-placeholder">No image</div>
            )}
            <div className="driver-hero-text">
              <h1>
            {driver ? (
                <DriverName
                  driver={driver}
                  countryByCode={countryByCode}
                  className="driver-hero-name"
                />
            ) : (
              "Driver profile"
            )}
              </h1>
              <div className="driver-hero-actions">
                {canEdit ? (
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => setIsImageModalOpen(true)}
                  >
                    Upload image
                  </button>
                ) : null}
                {canEdit && imageUrl ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={handleDeleteImage}
                    disabled={imageDeleting}
                  >
                    {imageDeleting ? "Removing…" : "Remove image"}
                  </button>
                ) : null}
              </div>
              {imageError ? (
                <div className="status-card error">{imageError}</div>
              ) : null}
            </div>
          </div>
          <p className="hero-subtitle">
            Review career details and maintain driver metadata.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="ghost link-pill"
              onClick={() => {
                navigate(location.state?.returnTo || "/drivers");
              }}
            >
              Back to drivers
            </button>
            {canEdit ? (
              <button
                type="button"
                className="pill"
                onClick={() => setIsModalOpen(true)}
                disabled={!driver}
              >
                Update driver
              </button>
            ) : null}
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Driver stats</div>
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
            <div>
              <span className="panel-meta-label">Years active</span>
              <span className="panel-meta-value">
                {statsLoading ? "—" : stats?.years_active ?? "—"}
              </span>
            </div>
          </div>
          {statsError && <div className="status-card error">{statsError}</div>}
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
          <button
            type="button"
            className={`tab-button${activeTab === "teams" ? " is-active" : ""}`}
            onClick={() => setActiveTab("teams")}
          >
            Teams
          </button>
          <button
            type="button"
            className={`tab-button${activeTab === "wins-by-year" ? " is-active" : ""}`}
            onClick={() => setActiveTab("wins-by-year")}
          >
            Wins by year
          </button>
        </div>
        {loading ? (
          <div className="status-card">Loading driver…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : activeTab === "details" ? (
          <div className="detail-card">
            <div className="detail-grid">
              <div className="detail-item">
                <span className="detail-label">First name</span>
                <span className="detail-value">{driver?.first_name || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Last name</span>
                <span className="detail-value">{driver?.last_name || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Driver code</span>
                <span className="detail-value">{driver?.driverCode || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Country</span>
                <span className="detail-value">
                  {resolvedCountry?.name || "—"}
                </span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Date of birth</span>
                <span className="detail-value">{driver?.dob || "—"}</span>
              </div>
              <div className="detail-item">
                <span className="detail-label">Date of death</span>
                <span className="detail-value">{driver?.dod || "—"}</span>
              </div>
              <div className="detail-item detail-span">
                <span className="detail-label">Profile URL</span>
                <span className="detail-value">
                  {driver?.url ? (
                    <a href={driver.url} target="_blank" rel="noreferrer">
                      {driver.url}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </div>
            <div className="detail-updated-corner">
              Updated {formatUpdatedAt(driver?.updated_at) || "—"}
            </div>
          </div>
        ) : activeTab === "wins" ? (
          <div className="detail-card">
            <div className="detail-card-header">
              <div>
                <h2>Race wins</h2>
                <p>Grand prix wins with car and team.</p>
              </div>
            </div>
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
                      <th>Grand Prix</th>
                      <th>Car</th>
                      <th>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wins.map((win) => (
                      <tr key={`${win.event_id}-${win.year}`}>
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
                              {win.team.name || win.team.short_name || "—"}
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
        ) : activeTab === "teams" ? (
          <div className="detail-card">
            <div className="detail-card-header">
              <div>
                <h2>Teams</h2>
                <p>Teams this driver has raced for.</p>
              </div>
            </div>
            {driverTeamsLoading ? (
              <div className="status-card">Loading teams…</div>
            ) : driverTeamsError ? (
              <div className="status-card error">{driverTeamsError}</div>
            ) : driverTeams.length === 0 ? (
              <div className="status-card">No teams recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Year(s)</th>
                      <th>Team name</th>
                      <th>Constructor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {driverTeams.map((team, idx) => {
                      const first = team.first_run_year;
                      const last = team.last_run_year;
                      let years = "—";
                      if (first && last && first === last) years = String(first);
                      else if (first && last) years = `${first} - ${last}`;
                      else if (first || last) years = String(first || last);
                      return (
                        <tr key={`${team.id}-${first ?? idx}`}>
                          <td>{years}</td>
                          <td>
                            <Link
                              to={`/teams/${team.slug}`}
                              className="table-link"
                            >
                              {team.team_name || "—"}
                            </Link>
                          </td>
                          <td>
                            {team.constructor_id ? (
                              <Link
                                to={`/constructors/${team.constructor_slug}`}
                                className="table-link"
                              >
                                {team.constructor_name || "—"}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
              </TableWrapper>
            )}
          </div>
        ) : activeTab === "wins-by-year" ? (
          <DriverWinsByYear driverId={driverId} />
        ) : null}
      </section>
      {!loading && !error && driver ? (
        <section className="section">
          <ReferencesSection entityType="driver" entityId={driver.id} />
        </section>
      ) : null}

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update driver</h3>
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
                  First name
                  <input
                    name="first_name"
                    value={formValues.first_name}
                    onChange={handleFieldChange}
                    required
                  />
                </label>
                <label>
                  Last name
                  <input
                    name="last_name"
                    value={formValues.last_name}
                    onChange={handleFieldChange}
                    required
                  />
                </label>
                <label>
                  Driver code
                  <input
                    name="driverCode"
                    value={formValues.driverCode}
                    onChange={handleFieldChange}
                  />
                </label>
                <div>
                  <label>Country</label>
                  <Autocomplete
                    fullWidth
                    options={countries}
                    getOptionLabel={(option) =>
                      option?.name
                        ? `${option.name} (${option.code})${
                            option.nationality
                              ? ` — ${option.nationality}`
                              : ""
                          }`
                        : ""
                    }
                    isOptionEqualToValue={(option, value) =>
                      option.code === value.code
                    }
                    value={countrySelection}
                    inputValue={countryInputValue}
                    onInputChange={(_, value, reason) => {
                      setCountryInputValue(value);
                      if (!value && reason === "clear") {
                        setCountrySelection(null);
                        setFormValues((prev) => ({
                          ...prev,
                          nationality: "",
                        }));
                      }
                    }}
                    onChange={handleCountryChange}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        placeholder="Search and select a country"
                        error={Boolean(countrySelectionError)}
                      />
                    )}
                  />
                </div>
                <label>
                  DOB
                  <input
                    type="date"
                    name="dob"
                    value={formValues.dob}
                    onChange={handleFieldChange}
                  />
                </label>
                <label>
                  DOD
                  <input
                    type="date"
                    name="dod"
                    value={formValues.dod}
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
              </div>
              {countrySelectionError && (
                <div className="status-card error">{countrySelectionError}</div>
              )}
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
                  Delete driver
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
          title="Delete driver?"
          message="This will permanently remove the driver record and cannot be undone."
          confirmLabel="Delete driver"
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteModalOpen(false)}
          isLoading={deleting}
          error={deleteError}
        />
      ) : null}

      {canEdit && isImageModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Upload driver image</h3>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setIsImageModalOpen(false);
                  setImageFile(null);
                  setImageCropped(null);
                  if (imagePreview) {
                    URL.revokeObjectURL(imagePreview);
                  }
                  setImagePreview("");
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleUploadImage}>
              <div className="form-grid">
                <label className="form-span">
                  Image file
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageSelection}
                  />
                </label>
                <div className="form-span">
                  <ImageCropper
                    file={imageFile}
                    aspect={1}
                    outputWidth={800}
                    onCropped={setImageCropped}
                    onError={(message) => setImageError(message)}
                  />
                </div>
              </div>
              {imageError ? (
                <div className="status-card error">{imageError}</div>
              ) : null}
              <div className="modal-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={() => {
                  setIsImageModalOpen(false);
                  setImageFile(null);
                  setImageCropped(null);
                  if (imagePreview) {
                    URL.revokeObjectURL(imagePreview);
                  }
                  setImagePreview("");
                }}
              >
                Cancel
              </button>
                <button type="submit" className="pill" disabled={imageUploading}>
                  {imageUploading ? "Uploading…" : "Upload image"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isPhotoModalOpen && imageUrl && (
        <div
          className="modal-backdrop"
          onClick={() => setIsPhotoModalOpen(false)}
        >
          <div
            className="photo-lightbox"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="icon-button photo-lightbox-close"
              onClick={() => setIsPhotoModalOpen(false)}
            >
              &times;
            </button>
            <img
              className="photo-lightbox-image"
              src={imageUrl}
              alt={driver?.first_name || "Driver"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
