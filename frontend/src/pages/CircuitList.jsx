import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet } from "../lib/api.js";
import { ALPHABET } from "../lib/constants.js";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import useCountries from "../hooks/useCountries.js";
import useListFilter from "../hooks/useListFilter.js";

const SEASONS_PAGE_SIZE = 100;

export default function CircuitList() {
  const location = useLocation();
  const [circuits, setCircuits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [hasNextPage, setHasNextPage] = useState(false);
  const { countryByCode, countryByName } = useCountries();

  const [activeTab, setActiveTab] = useState("active");
  const [activeCircuits, setActiveCircuits] = useState([]);
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

  const returnTo = useMemo(
    () => `${location.pathname}${location.search}`,
    [location.pathname, location.search]
  );

  const renderCountryCell = (country) => {
    if (!country) return "—";
    const key = country.toLowerCase();
    const resolved =
      countryByCode.get(key) || countryByName.get(key) || null;
    const alpha2 = resolved?.alpha2_code
      ? resolved.alpha2_code.toLowerCase()
      : null;
    const label = resolved?.name || country;
    return (
      <span className="table-driver">
        {alpha2 ? (
          <img
            className="flag-icon"
            src={`https://flagcdn.com/24x18/${alpha2}.png`}
            alt={label ? `${label} flag` : "Country flag"}
            loading="lazy"
          />
        ) : null}
        <span>{label}</span>
      </span>
    );
  };

  useEffect(() => {
    let isActive = true;
    async function loadStats() {
      try {
        const data = await apiGet("/circuits/stats");
        if (isActive) {
          setStats(data);
          setStatsError("");
        }
      } catch (err) {
        if (isActive) {
          setStatsError(err.message || "Failed to load circuit stats.");
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

    async function loadActiveCircuits() {
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
          `/circuits/by-season?season=${encodeURIComponent(latest.short_name)}`
        );
        if (isActive) {
          setActiveCircuits(data || []);
          setActiveError("");
        }
      } catch (err) {
        if (isActive) {
          setActiveError(err.message || "Failed to load active circuits.");
        }
      } finally {
        if (isActive) {
          setActiveLoading(false);
        }
      }
    }

    loadActiveCircuits();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    async function loadCircuits() {
      try {
        setLoading(true);
        const offset = pageIndex * PAGE_SIZE;
        const data = await apiGet(
          filterQuery
            ? `/circuits/search?q=${encodeURIComponent(
              filterQuery
            )}&limit=${PAGE_SIZE}&offset=${offset}`
            : `/circuits/by-name?starts_with=${letter}&limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setCircuits(data);
          setHasNextPage(data.length === PAGE_SIZE);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load circuits.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }
    loadCircuits();
    return () => {
      isActive = false;
    };
  }, [filterQuery, letter, pageIndex]);

  const renderCircuitRow = (circuit) => (
    <tr key={circuit.id}>
      <td>
        <Link
          to={`/circuits/${circuit.slug}`}
          state={{ returnTo }}
          className="table-link"
        >
          {circuit.name || "—"}
        </Link>
      </td>
      <td>{circuit.city || "—"}</td>
      <td>{renderCountryCell(circuit.country)}</td>
      <td>{circuit.first_run_year ?? "—"}</td>
      <td>{circuit.last_run_year ?? "—"}</td>
      <td>{circuit.event_count ?? "—"}</td>
    </tr>
  );

  const circuitTableHead = (
    <thead>
      <tr>
        <th>Circuit</th>
        <th>City</th>
        <th>Country</th>
        <th>First Run</th>
        <th>Last Run</th>
        <th>Events</th>
      </tr>
    </thead>
  );

  return (
    <div className="page">
      <SeoHead
        title="Circuits"
        description="Formula 1 circuits worldwide with event history and details."
      />
      <section className="hero compact">
        <div className="hero-content">
          <h1>Circuit catalog</h1>
          <div className="tabs">
            <button
              type="button"
              className={`tab-button${activeTab === "active" ? " is-active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              Active Circuits ({activeLoading ? "…" : activeCircuits.length})
            </button>
            <button
              type="button"
              className={`tab-button${activeTab === "all" ? " is-active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Circuits
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Circuit global stats</div>
          <div className="panel-grid">
            <div className="panel-card">
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        {activeTab === "active" ? (
          activeLoading ? (
            <div className="status-card">Loading active circuits…</div>
          ) : activeError ? (
            <div className="status-card error">{activeError}</div>
          ) : activeCircuits.length === 0 ? (
            <div className="status-card">
              No entries found for the {latestSeason?.year ?? ""} season yet.
            </div>
          ) : (
            <div className="tab-panel">
              <div className="section-header">
                <div>
                  <h2>Active Circuits</h2>
                </div>
              </div>
              <TableWrapper>
                <DataTable className="data-table--plain">
                  {circuitTableHead}
                  <tbody>{activeCircuits.map(renderCircuitRow)}</tbody>
                </DataTable>
              </TableWrapper>
            </div>
          )
        ) : loading ? (
          <div className="status-card">Loading circuits…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <div className="tab-panel">
            <div className="section-header">
              <div>
                <h2>All Circuits</h2>
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
                  placeholder="Search by circuit name"
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
                    updateParams({ q: null, letter: "A", page: 0 })
                  }
                >
                  Clear
                </button>
              </div>
            </div>
            <TableWrapper>
              <DataTable className="data-table--plain">
                {circuitTableHead}
                <tbody>{circuits.map(renderCircuitRow)}</tbody>
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
