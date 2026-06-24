import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiFetch, apiGet, apiUrl } from "../lib/api.js";
import { useCreateModal } from "../context/CreateModalContext.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import DataTable from "../components/DataTable.jsx";
import DriverName from "../components/DriverName.jsx";
import ImageCropper from "../components/ImageCropper.jsx";
import ReferencesSection from "../components/ReferencesSection.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import useCountries from "../hooks/useCountries.js";
import useAuthStatus from "../lib/useAuthStatus.js";

const emptyForm = {
  chassis_name: "",
  constructor_id: "",
  engine_id: "",
  notes: "",
};

const PAGE_SIZE = 100;

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

export default function CarDetail() {
  const canEdit = useAuthStatus();
  const { openCreate } = useCreateModal();
  const { carId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [car, setCar] = useState(null);
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
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [imageDeleting, setImageDeleting] = useState(false);
  const [imageCropped, setImageCropped] = useState(null);
  const [events, setEvents] = useState([]);
  const [eventEntries, setEventEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [engineOptions, setEngineOptions] = useState([]);
  const [carWins, setCarWins] = useState([]);
  const [carWinsLoading, setCarWinsLoading] = useState(false);
  const [carWinsError, setCarWinsError] = useState("");
  const { countryByCode } = useCountries();

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    if (!carId) return;
    let isActive = true;
    async function loadEvents() {
      try {
        const data = await apiGet(`/events/by-car/${carId}`);
        if (!isActive) return;
        setEvents(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isActive) {
          setEvents([]);
        }
      }
    }
    loadEvents();
    return () => {
      isActive = false;
    };
  }, [carId]);

  useEffect(() => {
    if (!carId) return;
    let isActive = true;
    async function loadEntries() {
      setEntriesLoading(true);
      setEntriesError("");
      try {
        const data = await apiGet(`/event-entries/by-car/${carId}`);
        if (!isActive) return;
        setEventEntries(Array.isArray(data) ? data : []);
      } catch (err) {
        if (isActive) {
          setEventEntries([]);
          setEntriesError(err.message || "Failed to load event entries.");
        }
      } finally {
        if (isActive) {
          setEntriesLoading(false);
        }
      }
    }
    loadEntries();
    return () => {
      isActive = false;
    };
  }, [carId]);

  useEffect(() => {
    if (!carId) return;
    let isActive = true;

    async function loadWins() {
      setCarWinsLoading(true);
      try {
        const data = await apiGet(`/cars/${carId}/wins`);
        if (!isActive) return;
        setCarWins(Array.isArray(data) ? data : []);
        setCarWinsError("");
      } catch (err) {
        if (isActive) {
          setCarWinsError(err.message || "Failed to load car wins.");
        }
      } finally {
        if (isActive) {
          setCarWinsLoading(false);
        }
      }
    }

    loadWins();
    return () => {
      isActive = false;
    };
  }, [carId]);

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

  const fetchAllEngines = async () => {
    let offset = 0;
    let items = [];
    while (true) {
      const batch = await apiGet(
        `/engines?limit=${PAGE_SIZE}&offset=${offset}`
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
        const [carData, constructors, engines] = await Promise.all([
          apiGet(`/cars/${carId}`),
          fetchAllConstructors(),
          fetchAllEngines(),
        ]);
        if (isActive) {
          setCar(carData);
          setConstructorOptions(
            constructors
              .slice()
              .sort((a, b) =>
                (a.name || a.short_name || "").localeCompare(
                  b.name || b.short_name || ""
                )
              )
          );
          setEngineOptions(
            engines
              .slice()
              .sort((a, b) => {
                const aConstructor =
                  a.constructor?.name ||
                  a.constructor?.short_name ||
                  a.constructor_name ||
                  "";
                const bConstructor =
                  b.constructor?.name ||
                  b.constructor?.short_name ||
                  b.constructor_name ||
                  "";
                const constructorCompare = aConstructor.localeCompare(
                  bConstructor
                );
                if (constructorCompare !== 0) return constructorCompare;
                return (a.model_number || "").localeCompare(
                  b.model_number || ""
                );
              })
          );
          setFormValues({
            chassis_name: carData.chassis_name || "",
            constructor_id: carData.constructor_id ?? "",
            engine_id: carData.engine_id ?? "",
            notes: carData.notes || "",
          });
          setImageFile(null);
          setImagePreview("");
          setImageError("");
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load car.");
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
  }, [carId]);

  const heroTitle = useMemo(() => {
    if (!car) return "Car profile";
    return car.chassis_name || "Car profile";
  }, [car]);

  const constructorLabel = useMemo(() => {
    const constructor = car?.constructor;
    return constructor?.name || constructor?.short_name || "—";
  }, [car]);

  const engineLabel = useMemo(() => {
    return car?.engine?.model_number || "—";
  }, [car]);

  const engineConstructorName = useMemo(() => {
    const constructor = car?.engine?.constructor;
    return constructor?.name || constructor?.short_name || "—";
  }, [car]);

  const formatTeam = (team) => {
    if (!team) return "—";
    return team.team_name || team.short_name || "—";
  };

  const formatCar = (carItem) => {
    if (!carItem) return "—";
    return carItem.chassis_name || "—";
  };

  const formatTire = (tire) => {
    if (!tire) return "—";
    return tire.manufactor_name || tire.short_name || "—";
  };

  const formatEngineLabel = (carItem) => {
    const engine = carItem?.engine;
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

  const formatEngineOption = (engine) => {
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

  const grandPrixRange = useMemo(() => {
    if (!events.length) {
      return { first: null, last: null };
    }
    const sorted = events
      .slice()
      .filter((event) => event.event_date)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    if (!sorted.length) {
      return { first: null, last: null };
    }
    return {
      first: sorted[0],
      last: sorted[sorted.length - 1],
    };
  }, [events]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const refreshEngineOptions = async () => {
    const engines = await fetchAllEngines();
    setEngineOptions(
      engines
        .slice()
        .sort((a, b) => {
          const aConstructor =
            a.constructor?.name ||
            a.constructor?.short_name ||
            a.constructor_name ||
            "";
          const bConstructor =
            b.constructor?.name ||
            b.constructor?.short_name ||
            b.constructor_name ||
            "";
          const constructorCompare = aConstructor.localeCompare(bConstructor);
          if (constructorCompare !== 0) return constructorCompare;
          return (a.model_number || "").localeCompare(b.model_number || "");
        })
    );
  };

  const openInlineCreateModal = (target, fieldName) => {
    openCreate({
      target,
      source: "car-modal",
      field: fieldName,
      onCreated: async (createdEntity) => {
        if (target === "engines") {
          await refreshEngineOptions();
        }
        if (createdEntity?.id != null) {
          setFormValues((prev) => ({ ...prev, [fieldName]: String(createdEntity.id) }));
        }
      },
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setSaveError("");

    try {
      const payload = {
        chassis_name: formValues.chassis_name || null,
        constructor_id: formValues.constructor_id
          ? Number(formValues.constructor_id)
          : null,
        engine_id: formValues.engine_id ? Number(formValues.engine_id) : null,
        notes: formValues.notes || null,
      };
      const response = await apiFetch(`/cars/${carId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to update car.");
      }
      const updated = await response.json();
      setCar(updated);
      setIsModalOpen(false);
    } catch (err) {
      setSaveError(err.message || "Failed to update car.");
    } finally {
      setSaving(false);
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
    () => resolveImageUrl(car?.image_url || ""),
    [car]
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
    if (!imageFile || !carId) {
      setImageError("Select an image to upload.");
      return;
    }
    setImageUploading(true);
    setImageError("");

    try {
      const formData = new FormData();
      const uploadFile =
        imageCropped && imageCropped instanceof Blob
          ? new File([imageCropped], "car-image", {
              type: imageCropped.type || "image/jpeg",
            })
          : imageFile;
      formData.append("file", uploadFile);
      const response = await apiFetch(`/cars/${carId}/image`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to upload image.");
      }
      const data = await response.json();
      setCar((prev) =>
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

  const handleDelete = async () => {
    if (!carId) return;
    setDeleting(true);
    setDeleteError("");

    try {
      const response = await apiFetch(`/cars/${carId}`, { method: "DELETE" });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to delete car.");
      }
      setIsDeleteModalOpen(false);
      setIsModalOpen(false);
      navigate(location.state?.returnTo || "/cars");
    } catch (err) {
      setDeleteError(err.message || "Failed to delete car.");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteImage = async () => {
    if (!carId) return;
    setImageDeleting(true);
    setImageError("");
    try {
      const response = await apiFetch(`/cars/${carId}/image`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to remove image.");
      }
      setCar((prev) => (prev ? { ...prev, image_url: null } : prev));
    } catch (err) {
      setImageError(err.message || "Failed to remove image.");
    } finally {
      setImageDeleting(false);
    }
  };

  return (
    <div className="page">
      <SeoHead
        title={car?.chassis_name || "Car"}
        description={
          car?.chassis_name
            ? `Formula 1 specifications and results for ${car.chassis_name}.`
            : undefined
        }
        ogType="profile"
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Car profile</p>
          <h1>{heroTitle}</h1>
          <p className="hero-subtitle">
            Review car specs and maintain historical metadata.
          </p>
          <div className="hero-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                navigate(location.state?.returnTo || "/cars");
              }}
            >
              Back to cars
            </button>
            {canEdit ? (
              <button
                type="button"
                className="pill"
                onClick={() => setIsModalOpen(true)}
                disabled={!car}
              >
                Update car
              </button>
            ) : null}
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Car highlights</div>
          <div className="panel-grid">
            <div className="panel-card">
              <div className="panel-label">First Grand Prix</div>
              <div className="panel-value">
                {grandPrixRange.first ? (
                  <Link
                    to={`/seasons/${grandPrixRange.first.season_year}/events/${grandPrixRange.first.slug}/sessions`}
                    className="table-link"
                  >
                    {grandPrixRange.first.event_name || "—"}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-label">Last Grand Prix</div>
              <div className="panel-value">
                {grandPrixRange.last ? (
                  <Link
                    to={`/seasons/${grandPrixRange.last.season_year}/events/${grandPrixRange.last.slug}/sessions`}
                    className="table-link"
                  >
                    {grandPrixRange.last.event_name || "—"}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
            </div>
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
            className={`tab-button${activeTab === "entries" ? " is-active" : ""}`}
            onClick={() => setActiveTab("entries")}
          >
            Entries {!entriesLoading ? `(${eventEntries.length})` : ""}
          </button>
          <button
            type="button"
            className={`tab-button${activeTab === "wins" ? " is-active" : ""}`}
            onClick={() => setActiveTab("wins")}
          >
            Wins {!carWinsLoading ? `(${carWins.length})` : ""}
          </button>
        </div>
      </section>

      {activeTab === "details" ? (
        <>
          <section className="section">
            {loading ? (
              <div className="status-card">Loading car…</div>
            ) : error ? (
              <div className="status-card error">{error}</div>
            ) : (
              <div className="detail-card">
                <div className="detail-media">
                  {imageUrl ? (
                    <img
                      className="car-image"
                      src={imageUrl}
                      alt={car?.chassis_name || "Car"}
                    />
                  ) : (
                    <div className="image-placeholder">No car image</div>
                  )}
                  <div className="detail-media-actions">
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
                <div className="detail-grid">
                  <div className="detail-item detail-span detail-item-divider">
                    <div className="detail-divider">
                      <span>Chassis</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Model Number</span>
                    <span className="detail-value">
                      {car?.chassis_name || "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Constructor</span>
                    <span className="detail-value">{constructorLabel}</span>
                  </div>
                  <div className="detail-item detail-span detail-item-divider">
                    <div className="detail-divider">
                      <span>Engine</span>
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Model Number</span>
                    <span className="detail-value">{engineLabel}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Constructor</span>
                    <span className="detail-value">{engineConstructorName}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Cylinder's Geometry</span>
                    <span className="detail-value">
                      {car?.engine?.layout_id || "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Cylinder's Number</span>
                    <span className="detail-value">
                      {car?.engine?.cylinder_count ?? "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Displacement (cc)</span>
                    <span className="detail-value">
                      {car?.engine?.displacement_cc ?? "—"}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">Aspiration Type</span>
                    <span className="detail-value">
                      {car?.engine?.aspiration_type_id || "—"}
                    </span>
                  </div>
                   <div className="detail-item detail-span detail-item-divider">
                    <div className="detail-divider">
                      <span>Additional Info</span>
                    </div>
                  </div>
                  <div className="detail-item detail-span">
                    <span className="detail-label">Notes</span>
                    <span className="detail-value">{car?.notes || "—"}</span>
                  </div>
                </div>
                <div className="detail-updated-corner">
                  Updated {formatUpdatedAt(car?.updated_at) || "—"}
                </div>
              </div>
            )}
          </section>
          {!loading && !error && car ? (
            <section className="section">
              <ReferencesSection entityType="car" entityId={car.id} />
            </section>
          ) : null}
        </>
      ) : activeTab === "entries" ? (
        <section className="section">
          <div className="detail-card">
            {entriesLoading ? (
              <div className="status-card">Loading entries…</div>
            ) : entriesError ? (
              <div className="status-card error">{entriesError}</div>
            ) : eventEntries.length === 0 ? (
              <div className="status-card">No entries recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Event</th>
                      <th>Team</th>
                      <th>Car</th>
                      <th>Engine</th>
                      <th>Tire</th>
                      <th>Car Number</th>
                      <th>Driver</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventEntries.map((entry) => (
                      <tr key={entry.id}>
                        <td>
                          {entry.event?.id ? (
                            <Link
                              to={`/seasons/${entry.event.season_year}/events/${entry.event.slug}/sessions`}
                              className="table-link"
                            >
                              {entry.event.event_name || "—"}
                            </Link>
                          ) : (
                            entry.event?.event_name || "—"
                          )}
                        </td>
                        <td>
                          {entry.team?.id ? (
                            <Link
                              to={`/teams/${entry.team.slug}`}
                              className="table-link"
                            >
                              {formatTeam(entry.team)}
                            </Link>
                          ) : (
                            formatTeam(entry.team)
                          )}
                        </td>
                        <td>
                          {entry.car?.id ? (
                            <Link
                              to={`/cars/${entry.car.slug}`}
                              className="table-link"
                            >
                              {formatCar(entry.car)}
                            </Link>
                          ) : (
                            formatCar(entry.car)
                          )}
                        </td>
                        <td>{formatEngineLabel(entry.car)}</td>
                        <td>{formatTire(entry.tire)}</td>
                        <td>{entry.car_number ?? "—"}</td>
                        <td>
                          {entry.driver?.id ? (
                            <Link
                              to={`/drivers/${entry.driver.slug}`}
                              className="table-link"
                            >
                              <DriverName
                                driver={entry.driver}
                                countryByCode={countryByCode}
                              />
                            </Link>
                          ) : (
                            <DriverName
                              driver={entry.driver}
                              countryByCode={countryByCode}
                            />
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
      ) : activeTab === "wins" ? (
        <section className="section">
          <div className="detail-card">
            <div className="detail-card-header">
              <div>
                <h2>Race wins</h2>
                <p>Grand prix wins with this car.</p>
              </div>
            </div>
            {carWinsLoading ? (
              <div className="status-card">Loading wins…</div>
            ) : carWinsError ? (
              <div className="status-card error">{carWinsError}</div>
            ) : carWins.length === 0 ? (
              <div className="status-card">No wins recorded yet.</div>
            ) : (
              <TableWrapper>
                <DataTable>
                  <thead>
                    <tr>
                      <th>Grand Prix</th>
                      <th>Year</th>
                      <th>Driver</th>
                      <th>Team</th>
                    </tr>
                  </thead>
                  <tbody>
                    {carWins.map((win) => (
                      <tr key={`${win.event_id}-${win.year}`}>
                        <td>
                          <Link
                            to={`/seasons/${win.year}/events/${win.event_slug}`}
                            className="table-link"
                          >
                            {win.event_name || "Event"}
                          </Link>
                        </td>
                        <td>{win.year}</td>
                        <td>
                          {win.driver?.id ? (
                            <Link
                              to={`/drivers/${win.driver.slug}`}
                              className="table-link"
                            >
                              <DriverName
                                driver={win.driver}
                                countryByCode={countryByCode}
                              />
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {win.team?.id ? (
                            <Link
                              to={`/teams/${win.team.slug}`}
                              className="table-link"
                            >
                              {win.team.team_name || "—"}
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

      {canEdit && isModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>Update car</h3>
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
                  Chassis name
                  <input
                    name="chassis_name"
                    value={formValues.chassis_name}
                    onChange={handleFieldChange}
                    required
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
                <label>
                  Engine
                  <div className="modal-select-with-create">
                    <select
                      name="engine_id"
                      value={formValues.engine_id}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select engine</option>
                      {engineOptions.map((engine) => (
                        <option key={engine.id} value={engine.id}>
                          {formatEngineOption(engine)}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost-button inline-create-button"
                      title="Create engine"
                      aria-label="Create engine"
                      onClick={() => openInlineCreateModal("engines", "engine_id")}
                    >
                      +
                    </button>
                  </div>
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
              <div className="modal-actions">
                <button
                  type="button"
                  className="danger-button"
                  onClick={() => {
                    setDeleteError("");
                    setIsDeleteModalOpen(true);
                  }}
                >
                  Delete car
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
          title="Delete car?"
          message="This will permanently remove the car record and cannot be undone."
          confirmLabel="Delete car"
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
              <h3>Upload car image</h3>
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
                    aspect={16 / 9}
                    outputWidth={1200}
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
    </div>
  );
}
