import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet, apiUrl } from "../lib/api.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import { ALPHABET } from "../lib/constants.js";
import { useCreateModal } from "../context/CreateModalContext.jsx";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import useListFilter from "../hooks/useListFilter.js";

const SEASONS_PAGE_SIZE = 100;

export default function CarList() {
  const canEdit = useAuthStatus();
  const { openCreate } = useCreateModal();
  const location = useLocation();
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [hasNextPage, setHasNextPage] = useState(false);

  const [activeTab, setActiveTab] = useState("active");
  const [activeCars, setActiveCars] = useState([]);
  const [activeLoading, setActiveLoading] = useState(true);
  const [activeError, setActiveError] = useState("");
  const [latestSeason, setLatestSeason] = useState(null);

  const {
    filterInput,
    setFilterInput,
    filterQuery,
    letter,
    pageIndex,
    updateParams,
    applySearch,
    PAGE_SIZE,
  } = useListFilter();

  useEffect(() => {
    let isActive = true;

    async function loadStats() {
      try {
        const data = await apiGet("/cars/stats");
        if (isActive) {
          setStats(data);
          setStatsError("");
        }
      } catch (err) {
        if (isActive) {
          setStatsError(err.message || "Failed to load car stats.");
        }
      }
    }

    loadStats();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadActiveCars() {
      try {
        let offset = 0;
        let seasons = [];
        while (true) {
          const batch = await apiGet(
            `/seasons?limit=${SEASONS_PAGE_SIZE}&offset=${offset}`
          );
          seasons = seasons.concat(batch);
          if (batch.length < SEASONS_PAGE_SIZE) break;
          offset += SEASONS_PAGE_SIZE;
        }
        const latest = seasons.reduce(
          (best, s) =>
            !best || Number(s.year) > Number(best.year) ? s : best,
          null
        );
        if (!latest) {
          if (isActive) {
            setActiveError("No seasons found.");
            setActiveLoading(false);
          }
          return;
        }
        if (isActive) setLatestSeason(latest);

        const data = await apiGet(
          `/cars/by-season?season=${encodeURIComponent(latest.short_name)}`
        );
        if (isActive) {
          setActiveCars(data || []);
          setActiveError("");
        }
      } catch (err) {
        if (isActive) {
          setActiveError(err.message || "Failed to load active cars.");
        }
      } finally {
        if (isActive) {
          setActiveLoading(false);
        }
      }
    }

    loadActiveCars();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadCars() {
      try {
        setLoading(true);
        const offset = pageIndex * PAGE_SIZE;
        const data = await apiGet(
          filterQuery
            ? `/cars/search?q=${encodeURIComponent(
              filterQuery
            )}&limit=${PAGE_SIZE}&offset=${offset}`
            : `/cars/by-name?starts_with=${letter}&limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setCars(data);
          setHasNextPage(data.length === PAGE_SIZE);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load cars.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadCars();
    return () => {
      isActive = false;
    };
  }, [filterQuery, letter, pageIndex]);

  const resolveImageUrl = (url) => {
    if (!url) return null;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    return apiUrl(url);
  };

  const returnTo = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search]
  );

  const formatEngineLabel = (car) => {
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

  const renderCarRow = (car) => (
    <tr key={car.id}>
      <td>
        <Link
          to={`/cars/${car.slug}`}
          state={{ returnTo }}
          className="table-link"
        >
          <span className="table-car">
            {car.image_url ? (
              <img
                className="car-thumb"
                src={resolveImageUrl(car.image_url)}
                alt={
                  car.chassis_name
                    ? `${car.chassis_name} thumbnail`
                    : "Car"
                }
                loading="lazy"
              />
            ) : null}
            <span>{car.chassis_name || "—"}</span>
          </span>
        </Link>
      </td>
      <td>{formatEngineLabel(car)}</td>
      <td>{car.first_run_year ?? "—"}</td>
      <td>{car.last_run_year ?? "—"}</td>
      <td>{car.event_entry_count ?? "—"}</td>
      <td>{car.wins_count ?? "—"}</td>
      <td>{car.world_driver_entries ?? "—"}</td>
      <td>{car.world_constructor_entries ?? "—"}</td>
    </tr>
  );

  const carTableHead = (
    <thead>
      <tr>
        <th>Car</th>
        <th>Engine</th>
        <th>First Run</th>
        <th>Last Run</th>
        <th>Event Entries</th>
        <th>Wins</th>
        <th>World Driver</th>
        <th>World Constructor</th>
      </tr>
    </thead>
  );

  return (
    <div className="page">
      <SeoHead
        title="Cars"
        description="Formula 1 cars and chassis with specifications and results."
      />
      <section className="hero compact">
        <div className="hero-content">
          <h1>Cars catalog</h1>
          <div className="tabs">
            <button
              type="button"
              className={`tab-button${activeTab === "active" ? " is-active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              Active Cars ({activeLoading ? "…" : activeCars.length})
            </button>
            <button
              type="button"
              className={`tab-button${activeTab === "all" ? " is-active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Cars ({activeLoading ? "…" : cars.length})
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Cars global stats</div>
          <div className="panel-grid">
            <div className="panel-card">
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        {activeTab === "active" ? (
          activeLoading ? (
            <div className="status-card">Loading active cars…</div>
          ) : activeError ? (
            <div className="status-card error">{activeError}</div>
          ) : activeCars.length === 0 ? (
            <div className="status-card">
              No entries found for the {latestSeason?.year ?? ""} season yet.
            </div>
          ) : (
            <div className="tab-panel">
              <div className="section-header">
                <div>
                  <h2>Active Cars</h2>
                </div>
              </div>
              <TableWrapper>
                <DataTable className="data-table--plain">
                  {carTableHead}
                  <tbody>{activeCars.map(renderCarRow)}</tbody>
                </DataTable>
              </TableWrapper>
            </div>
          )
        ) : loading ? (
          <div className="status-card">Loading cars…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <div className="tab-panel">
            <div className="section-header">
              <div>
                <h2>All Cars</h2>
              </div>
            </div>
            {!filterInput.trim() && (
              <div className="alpha-filter">
                {ALPHABET.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`alpha-button${letter === item ? " is-active" : ""
                      }`}
                    onClick={() =>
                      updateParams({ letter: item, q: null, page: 0 })
                    }
                  >
                    {item}
                  </button>
                ))}
              </div>
            )}
            <div className="filter-row car-list-filter">
              <div className="filter-row-left">
                <input
                  type="text"
                  className="filter-input"
                  placeholder="Search by car name"
                  value={filterInput}
                  onChange={(event) => setFilterInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      applySearch();
                    }
                  }}
                />
                </div>
                <div>
                <button type="button" className="pill" onClick={applySearch}>
                  Search
                </button>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() =>
                    updateParams({
                      q: null,
                      letter: "A",
                      page: 0,
                    })
                  }
                >
                  Clear
                </button>
              </div>
              {canEdit ? (
                <button
                  type="button"
                  className="pill"
                  onClick={() => openCreate("cars")}
                >
                  Create car
                </button>
              ) : null}
            </div>
            <TableWrapper>
              <DataTable className="data-table--plain">
                {carTableHead}
                <tbody>{cars.map(renderCarRow)}</tbody>
              </DataTable>
            </TableWrapper>
            {(hasNextPage || pageIndex > 0) && (
              <div className="pager">
                <button
                  type="button"
                  className="pager-button"
                  onClick={() =>
                    updateParams({ page: Math.max(pageIndex - 1, 0) })
                  }
                  disabled={pageIndex === 0}
                >
                  Previous
                </button>
                <span className="pager-label">Page {pageIndex + 1}</span>
                <button
                  type="button"
                  className="pager-button"
                  onClick={() => updateParams({ page: pageIndex + 1 })}
                  disabled={!hasNextPage}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
