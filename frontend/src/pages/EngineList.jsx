import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet } from "../lib/api.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import { ALPHABET } from "../lib/constants.js";
import { useCreateModal } from "../context/CreateModalContext.jsx";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import useListFilter from "../hooks/useListFilter.js";

const SEASONS_PAGE_SIZE = 100;

const formatAspiration = (value) => {
  if (!value) return "—";
  if (value === "naturally_aspired") return "Naturally aspired";
  if (value === "supercharged") return "Supercharged";
  if (value === "turbocharged") return "Turbocharged";
  if (value === "hybrid") return "Hybrid";
  return value;
};

export default function EngineList() {
  const canEdit = useAuthStatus();
  const { openCreate } = useCreateModal();
  const location = useLocation();
  const [engines, setEngines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [hasNextPage, setHasNextPage] = useState(false);

  const [activeTab, setActiveTab] = useState("active");
  const [activeEngines, setActiveEngines] = useState([]);
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
        const data = await apiGet("/engines/stats");
        if (isActive) {
          setStats(data);
          setStatsError("");
        }
      } catch (err) {
        if (isActive) {
          setStatsError(err.message || "Failed to load engine stats.");
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

    async function loadActiveEngines() {
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
          `/engines/by-season?season=${encodeURIComponent(latest.short_name)}`
        );
        if (isActive) {
          setActiveEngines(data || []);
          setActiveError("");
        }
      } catch (err) {
        if (isActive) {
          setActiveError(err.message || "Failed to load active engines.");
        }
      } finally {
        if (isActive) {
          setActiveLoading(false);
        }
      }
    }

    loadActiveEngines();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadEngines() {
      try {
        setLoading(true);
        const offset = pageIndex * PAGE_SIZE;
        const data = await apiGet(
          filterQuery
            ? `/engines/search?q=${encodeURIComponent(
              filterQuery
            )}&limit=${PAGE_SIZE}&offset=${offset}`
            : `/engines/by-constructor?starts_with=${letter}&limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setEngines(data);
          setHasNextPage(data.length === PAGE_SIZE);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load engines.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    loadEngines();
    return () => {
      isActive = false;
    };
  }, [filterQuery, letter, pageIndex]);

  const returnTo = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search]
  );

  const renderEngineRow = (engine) => (
    <tr key={engine.id}>
      <td>
        {engine.tagged_indicator && engine.tagged_name
          ? engine.tagged_name
          : engine.constructor?.name ||
          engine.constructor?.short_name ||
          "—"}
      </td>
      <td>
        <Link
          to={`/engines/${engine.slug}`}
          state={{ returnTo }}
          className="table-link"
        >
          {engine.model_number || "—"}
        </Link>
      </td>
      <td>{engine.layout_id || "—"}</td>
      <td>{engine.cylinder_count ?? "—"}</td>
      <td>{engine.displacement_cc ?? "—"}</td>
      <td>{formatAspiration(engine.aspiration_type_id)}</td>
    </tr>
  );

  const engineTableHead = (
    <thead>
      <tr>
        <th>Constructor</th>
        <th>Model</th>
        <th>Layout</th>
        <th>Cylinders</th>
        <th>Displacement (cc)</th>
        <th>Aspiration</th>
      </tr>
    </thead>
  );

  return (
    <div className="page">
      <SeoHead
        title="Engines"
        description="Formula 1 engines and their specifications across the eras."
      />
      <section className="hero compact">
        <div className="hero-content">
          <h1>Engine catalog</h1>
          <div className="tabs">
            <button
              type="button"
              className={`tab-button${activeTab === "active" ? " is-active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              Active Engines ({activeLoading ? "…" : activeEngines.length})
            </button>
            <button
              type="button"
              className={`tab-button${activeTab === "all" ? " is-active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Engines
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Engine global stats</div>
          <div className="panel-grid">
            <div className="panel-card">
            </div>
          </div>
        </div>
      </section>

      <section className="section">


        {activeTab === "active" ? (
          activeLoading ? (
            <div className="status-card">Loading active engines…</div>
          ) : activeError ? (
            <div className="status-card error">{activeError}</div>
          ) : activeEngines.length === 0 ? (
            <div className="status-card">
              No entries found for the {latestSeason?.year ?? ""} season yet.
            </div>
          ) : (
            <div className="tab-panel">
              <div className="section-header">
                <div>
                  <h2>Active Engines</h2>
                </div>
              </div>
              <TableWrapper>
                <DataTable className="data-table--plain">
                  {engineTableHead}
                  <tbody>{activeEngines.map(renderEngineRow)}</tbody>
                </DataTable>
              </TableWrapper>
            </div>
          )
        ) : loading ? (
          <div className="status-card">Loading engines…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <div className="tab-panel">
            <div className="section-header">
              <div>
                <h2>All Engines</h2>
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
                {engineTableHead}
                <tbody>{engines.map(renderEngineRow)}</tbody>
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
