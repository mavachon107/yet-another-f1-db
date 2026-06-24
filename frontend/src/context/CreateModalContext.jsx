import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { apiFetch, apiGet, clearApiCache } from "../lib/api.js";
import { isAuthenticated, onAuthChanged } from "../lib/auth.js";
import { useAuth } from "./AuthContext.jsx";

const CreateModalContext = createContext(null);

export function useCreateModal() {
  return useContext(CreateModalContext);
}

const toSnakeLetters = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z]+/g, "_")
    .replace(/^_+|_+$/g, "");

const formatEngineOption = (engine) => {
  if (!engine) return "—";
  const constructorName =
    engine.tagged_indicator && engine.tagged_name
      ? engine.tagged_name
      : engine.constructor?.name || engine.constructor?.short_name || "";
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
  ].filter((v) => v);
  return parts.length ? parts.join(" ") : "—";
};

const sortEngines = (engines) =>
  engines.slice().sort((a, b) => {
    const aC = a.constructor?.name || a.constructor?.short_name || a.constructor_name || "";
    const bC = b.constructor?.name || b.constructor?.short_name || b.constructor_name || "";
    const cmp = aC.localeCompare(bC);
    return cmp !== 0 ? cmp : (a.model_number || "").localeCompare(b.model_number || "");
  });

export function CreateModalProvider({ children }) {
  const { openAuthRequiredModal } = useAuth();

  const createContextRef = useRef({ target: null, onCreated: null, returnTarget: null });
  const [createTarget, setCreateTarget] = useState(null);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [constructorOptions, setConstructorOptions] = useState([]);
  const [engineOptions, setEngineOptions] = useState([]);

  const [driverForm, setDriverForm] = useState({
    first_name: "", last_name: "", short_name: "", driverCode: "",
    url: "", dob: "", dod: "", nationality: "",
  });
  const [teamForm, setTeamForm] = useState({
    team_name: "", short_name: "", country: "", url: "",
  });
  const [carForm, setCarForm] = useState({
    constructor_id: "", chassis_name: "", engine_id: "", notes: "",
  });
  const [engineForm, setEngineForm] = useState({
    constructor_id: "", model_number: "", tagged_indicator: false, tagged_name: "",
    layout_id: "", cylinder_count: "", displacement_cc: "", aspiration_type_id: "",
  });
  const [constructorForm, setConstructorForm] = useState({
    name: "", short_name: "", country: "", founded_year: "", defunct_year: "", notes: "",
  });
  const [tireForm, setTireForm] = useState({
    manufactor_name: "", tire_type: "", short_name: "", abbreviation: "",
  });

  // Close create modal on logout
  useEffect(() => {
    return onAuthChanged(() => {
      if (!isAuthenticated()) {
        setCreateTarget(null);
        setCreateError("");
        createContextRef.current = { target: null, onCreated: null, returnTarget: null };
      }
    });
  }, []);

  const fetchAllPages = async (path) => {
    const BATCH_SIZE = 100;
    let offset = 0;
    let items = [];
    while (true) {
      const batch = await apiGet(`${path}?limit=${BATCH_SIZE}&offset=${offset}`);
      items = items.concat(batch);
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
    return items;
  };

  const refreshEngineOptions = async () => {
    const engines = await fetchAllPages("/engines");
    setEngineOptions(sortEngines(engines));
  };

  const closeCreateModal = () => {
    setCreateTarget(null);
    setCreateError("");
    createContextRef.current = { target: null, onCreated: null, returnTarget: null };
  };

  const openCreate = async (targetOrDetail) => {
    const detail =
      typeof targetOrDetail === "string" ? { target: targetOrDetail } : targetOrDetail || {};
    const target = detail.target;
    if (!target) return;
    if (!isAuthenticated()) {
      openAuthRequiredModal();
      return;
    }
    createContextRef.current = {
      target,
      onCreated: typeof detail.onCreated === "function" ? detail.onCreated : null,
      returnTarget: typeof detail.returnTarget === "string" ? detail.returnTarget : null,
    };
    setCreateTarget(target);
    setCreateError("");
    if (target === "cars" || target === "engines") {
      try {
        const constructors = await fetchAllPages("/constructors");
        setConstructorOptions(
          constructors
            .slice()
            .sort((a, b) => (a.name || a.short_name || "").localeCompare(b.name || b.short_name || ""))
        );
        if (target === "cars") {
          const engines = await fetchAllPages("/engines");
          setEngineOptions(sortEngines(engines));
        }
      } catch (err) {
        setCreateError(err.message || "Failed to load constructors.");
      }
    }
  };

  const openInlineEngineCreate = () => {
    openCreate({
      target: "engines",
      source: "car-create-modal",
      returnTarget: "cars",
      onCreated: async (createdEntity) => {
        await refreshEngineOptions();
        if (createdEntity?.id != null) {
          setCarForm((prev) => ({ ...prev, engine_id: String(createdEntity.id) }));
        }
      },
    });
  };

  const handleCreateChange = (setter) => (event) => {
    const { name, value, type, checked } = event.target;
    setter((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createTarget) return;
    setCreating(true);
    setCreateError("");
    try {
      let endpoint = "";
      let payload = {};
      if (createTarget === "drivers") {
        endpoint = "/drivers";
        payload = {
          first_name: driverForm.first_name || null,
          last_name: driverForm.last_name || null,
          short_name: driverForm.short_name || null,
          driverCode: driverForm.driverCode || null,
          url: driverForm.url || null,
          dob: driverForm.dob || null,
          dod: driverForm.dod || null,
          nationality: driverForm.nationality || null,
        };
      } else if (createTarget === "teams") {
        endpoint = "/teams";
        payload = {
          team_name: teamForm.team_name || null,
          short_name: teamForm.short_name || null,
          country: teamForm.country || null,
          url: teamForm.url || null,
        };
      } else if (createTarget === "cars") {
        endpoint = "/cars";
        payload = {
          constructor_id: carForm.constructor_id ? Number(carForm.constructor_id) : null,
          chassis_name: carForm.chassis_name || null,
          engine_id: carForm.engine_id ? Number(carForm.engine_id) : null,
          notes: carForm.notes || null,
        };
      } else if (createTarget === "engines") {
        endpoint = "/engines";
        payload = {
          constructor_id: engineForm.constructor_id ? Number(engineForm.constructor_id) : null,
          model_number: engineForm.model_number || null,
          tagged_indicator: engineForm.tagged_indicator,
          tagged_name: engineForm.tagged_name || null,
          layout_id: engineForm.layout_id || null,
          cylinder_count: engineForm.cylinder_count ? Number(engineForm.cylinder_count) : null,
          displacement_cc: engineForm.displacement_cc ? Number(engineForm.displacement_cc) : null,
          aspiration_type_id: engineForm.aspiration_type_id || null,
        };
      } else if (createTarget === "constructors") {
        endpoint = "/constructors";
        payload = {
          name: constructorForm.name || null,
          short_name: constructorForm.short_name || null,
          country: constructorForm.country || null,
          founded_year: constructorForm.founded_year ? Number(constructorForm.founded_year) : null,
          defunct_year: constructorForm.defunct_year ? Number(constructorForm.defunct_year) : null,
          notes: constructorForm.notes || null,
        };
      } else if (createTarget === "tires") {
        endpoint = "/tires/";
        payload = {
          manufactor_name: tireForm.manufactor_name,
          tire_type: tireForm.tire_type || "",
          short_name: tireForm.short_name || toSnakeLetters(tireForm.manufactor_name),
          abbreviation: tireForm.abbreviation || null,
        };
      }

      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Failed to create record.");
      }
      const createdRecord = await response.json();
      clearApiCache(`/${createTarget}`);
      window.dispatchEvent(
        new CustomEvent("refresh:lists", { detail: { target: createTarget } })
      );
      if (typeof createContextRef.current.onCreated === "function") {
        await Promise.resolve(createContextRef.current.onCreated(createdRecord));
      }
      if (createContextRef.current.returnTarget) {
        const returnTarget = createContextRef.current.returnTarget;
        createContextRef.current = { target: returnTarget, onCreated: null, returnTarget: null };
        setCreateTarget(returnTarget);
        return;
      }
      closeCreateModal();
    } catch (err) {
      setCreateError(err.message || "Failed to create record.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <CreateModalContext.Provider value={{ openCreate }}>
      {children}

      {createTarget && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="modal-header">
              <h3>
                {createTarget === "drivers"
                  ? "New driver"
                  : createTarget === "teams"
                  ? "New team"
                  : createTarget === "constructors"
                  ? "New constructor"
                  : createTarget === "engines"
                  ? "New engine"
                  : createTarget === "tires"
                  ? "New tire"
                  : "New car"}
              </h3>
              <button type="button" className="icon-button" onClick={closeCreateModal} aria-label="Close">
                ×
              </button>
            </div>
            <form className="modal-form" onSubmit={handleCreateSubmit}>
              {createTarget === "drivers" && (
                <div className="form-grid">
                  <label>
                    First name
                    <input name="first_name" value={driverForm.first_name} onChange={handleCreateChange(setDriverForm)} required />
                  </label>
                  <label>
                    Last name
                    <input name="last_name" value={driverForm.last_name} onChange={handleCreateChange(setDriverForm)} required />
                  </label>
                  <label>
                    Short name
                    <input name="short_name" value={driverForm.short_name} onChange={handleCreateChange(setDriverForm)} />
                  </label>
                  <label>
                    Driver code
                    <input name="driverCode" value={driverForm.driverCode} onChange={handleCreateChange(setDriverForm)} />
                  </label>
                  <label>
                    Country code (ISO3)
                    <input name="nationality" value={driverForm.nationality} onChange={handleCreateChange(setDriverForm)} placeholder="e.g. FRA" />
                  </label>
                  <label>
                    DOB
                    <input type="date" name="dob" value={driverForm.dob} onChange={handleCreateChange(setDriverForm)} />
                  </label>
                  <label>
                    DOD
                    <input type="date" name="dod" value={driverForm.dod} onChange={handleCreateChange(setDriverForm)} />
                  </label>
                  <label className="form-span">
                    URL
                    <input name="url" value={driverForm.url} onChange={handleCreateChange(setDriverForm)} />
                  </label>
                </div>
              )}
              {createTarget === "constructors" && (
                <div className="form-grid">
                  <label>
                    Name
                    <input name="name" value={constructorForm.name} onChange={handleCreateChange(setConstructorForm)} required />
                  </label>
                  <label>
                    Short name
                    <input name="short_name" value={constructorForm.short_name} onChange={handleCreateChange(setConstructorForm)} required />
                  </label>
                  <label>
                    Country
                    <input name="country" value={constructorForm.country} onChange={handleCreateChange(setConstructorForm)} />
                  </label>
                  <label>
                    Founded year
                    <input type="number" name="founded_year" value={constructorForm.founded_year} onChange={handleCreateChange(setConstructorForm)} />
                  </label>
                  <label>
                    Defunct year
                    <input type="number" name="defunct_year" value={constructorForm.defunct_year} onChange={handleCreateChange(setConstructorForm)} />
                  </label>
                  <label className="form-span">
                    Notes
                    <textarea name="notes" value={constructorForm.notes} onChange={handleCreateChange(setConstructorForm)} rows={3} />
                  </label>
                </div>
              )}
              {createTarget === "teams" && (
                <div className="form-grid">
                  <label>
                    Team name
                    <input name="team_name" value={teamForm.team_name} onChange={handleCreateChange(setTeamForm)} required />
                  </label>
                  <label>
                    Short name
                    <input name="short_name" value={teamForm.short_name} onChange={handleCreateChange(setTeamForm)} />
                  </label>
                  <label>
                    Country
                    <input name="country" value={teamForm.country} onChange={handleCreateChange(setTeamForm)} />
                  </label>
                  <label className="form-span">
                    URL
                    <input name="url" value={teamForm.url} onChange={handleCreateChange(setTeamForm)} />
                  </label>
                </div>
              )}
              {createTarget === "cars" && (
                <div className="form-grid">
                  <label>
                    Chassis name
                    <input name="chassis_name" value={carForm.chassis_name} onChange={handleCreateChange(setCarForm)} required />
                  </label>
                  <label>
                    Constructor
                    <select name="constructor_id" value={carForm.constructor_id} onChange={handleCreateChange(setCarForm)}>
                      <option value="">Select constructor</option>
                      {constructorOptions.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || c.short_name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Engine
                    <div className="modal-select-with-create">
                      <select name="engine_id" value={carForm.engine_id} onChange={handleCreateChange(setCarForm)} className="engine-select">
                        <option value="">Select engine</option>
                        {engineOptions.map((engine) => (
                          <option key={engine.id} value={engine.id}>{formatEngineOption(engine)}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="ghost-button inline-create-button"
                        title="Create engine"
                        aria-label="Create engine"
                        onClick={openInlineEngineCreate}
                      >
                        +
                      </button>
                    </div>
                  </label>
                  <label className="form-span">
                    Notes
                    <input name="notes" value={carForm.notes} onChange={handleCreateChange(setCarForm)} />
                  </label>
                </div>
              )}
              {createTarget === "engines" && (
                <div className="form-grid">
                  <label>
                    Model number
                    <input name="model_number" value={engineForm.model_number} onChange={handleCreateChange(setEngineForm)} />
                  </label>
                  <label>
                    Constructor
                    <select name="constructor_id" value={engineForm.constructor_id} onChange={handleCreateChange(setEngineForm)}>
                      <option value="">Select constructor</option>
                      {constructorOptions.map((c) => (
                        <option key={c.id} value={c.id}>{c.name || c.short_name}</option>
                      ))}
                    </select>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      name="tagged_indicator"
                      checked={engineForm.tagged_indicator}
                      onChange={handleCreateChange(setEngineForm)}
                    />
                    Tagged engine
                  </label>
                  <label>
                    Tagged name
                    <input
                      name="tagged_name"
                      value={engineForm.tagged_name}
                      onChange={handleCreateChange(setEngineForm)}
                      disabled={!engineForm.tagged_indicator}
                      placeholder="e.g. Ford Cosworth"
                    />
                  </label>
                  <label>
                    Layout
                    <select name="layout_id" value={engineForm.layout_id} onChange={handleCreateChange(setEngineForm)}>
                      <option value="">Select layout</option>
                      <option value="L">L</option>
                      <option value="V">V</option>
                      <option value="F">F</option>
                      <option value="W">W</option>
                      <option value="H">H</option>
                    </select>
                  </label>
                  <label>
                    Cylinders
                    <input type="number" name="cylinder_count" value={engineForm.cylinder_count} onChange={handleCreateChange(setEngineForm)} />
                  </label>
                  <label>
                    Displacement (cc)
                    <input type="number" name="displacement_cc" value={engineForm.displacement_cc} onChange={handleCreateChange(setEngineForm)} />
                  </label>
                  <label>
                    Aspiration
                    <select name="aspiration_type_id" value={engineForm.aspiration_type_id} onChange={handleCreateChange(setEngineForm)}>
                      <option value="">Select aspiration</option>
                      <option value="naturally_aspired">Naturally aspired</option>
                      <option value="supercharged">Supercharged</option>
                      <option value="turbocharged">Turbocharged</option>
                      <option value="hybrid">Hybrid</option>
                    </select>
                  </label>
                </div>
              )}
              {createTarget === "tires" && (
                <div className="form-grid">
                  <label>
                    Name
                    <input
                      name="manufactor_name"
                      value={tireForm.manufactor_name}
                      onChange={(event) => {
                        const value = event.target.value;
                        setTireForm((prev) => ({
                          ...prev,
                          manufactor_name: value,
                          short_name: toSnakeLetters(value),
                        }));
                      }}
                      required
                    />
                  </label>
                  <label>
                    Abbreviation
                    <input name="abbreviation" value={tireForm.abbreviation} onChange={handleCreateChange(setTireForm)} />
                  </label>
                </div>
              )}
              {createError && <div className="status-card error">{createError}</div>}
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={closeCreateModal}>
                  Cancel
                </button>
                <button type="submit" className="pill" disabled={creating}>
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </CreateModalContext.Provider>
  );
}
