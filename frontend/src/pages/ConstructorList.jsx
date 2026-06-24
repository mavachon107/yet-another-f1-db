import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet } from "../lib/api.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import { ALPHABET } from "../lib/constants.js";
import { useCreateModal } from "../context/CreateModalContext.jsx";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import useCountries from "../hooks/useCountries.js";
import useListFilter from "../hooks/useListFilter.js";

const SEASONS_PAGE_SIZE = 100;

export default function ConstructorList() {
  const canEdit = useAuthStatus();
  const { openCreate } = useCreateModal();
  const location = useLocation();
  const [constructors, setConstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasNextPage, setHasNextPage] = useState(false);
  const { countryByCode, countryByName } = useCountries();

  const [activeTab, setActiveTab] = useState("active");
  const [activeConstructors, setActiveConstructors] = useState([]);
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

    async function loadActiveConstructors() {
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
          `/constructors/by-season?season=${encodeURIComponent(latest.short_name)}`
        );
        if (isActive) {
          setActiveConstructors(data || []);
          setActiveError("");
        }
      } catch (err) {
        if (isActive) {
          setActiveError(err.message || "Failed to load active constructors.");
        }
      } finally {
        if (isActive) {
          setActiveLoading(false);
        }
      }
    }

    loadActiveConstructors();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    async function loadConstructors() {
      try {
        setLoading(true);
        const offset = pageIndex * PAGE_SIZE;
        const data = await apiGet(
          filterQuery
            ? `/constructors/search?q=${encodeURIComponent(
              filterQuery
            )}&limit=${PAGE_SIZE}&offset=${offset}`
            : `/constructors/by-name?starts_with=${letter}&limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setConstructors(data);
          setHasNextPage(data.length === PAGE_SIZE);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load constructors.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }
    loadConstructors();
    return () => {
      isActive = false;
    };
  }, [filterQuery, letter, pageIndex]);

  const renderConstructorRow = (constructor) => (
    <tr key={constructor.id}>
      <td>
        <Link
          to={`/constructors/${constructor.slug}`}
          state={{ returnTo }}
          className="table-link"
        >
          {constructor.name || "—"}
        </Link>
      </td>
      <td>{renderCountryCell(constructor.country)}</td>
      <td>{constructor.first_run_year ?? "—"}</td>
      <td>{constructor.last_run_year ?? "—"}</td>
      <td>{constructor.event_entry_count ?? "—"}</td>
      <td>{constructor.wins_count ?? "—"}</td>
    </tr>
  );

  const constructorTableHead = (
    <thead>
      <tr>
        <th>Name</th>
        <th>Country</th>
        <th>First Run</th>
        <th>Last Run</th>
        <th>Event Entries</th>
        <th>Wins</th>
      </tr>
    </thead>
  );

  return (
    <div className="page">
      <SeoHead
        title="Constructors"
        description="Formula 1 constructors, their lineage, and championship results."
      />
      <section className="hero compact">
        <div className="hero-content">
          <h1>Constructor catalog</h1>
          <div className="tabs">
            <button
              type="button"
              className={`tab-button${activeTab === "active" ? " is-active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              Active Constructors ({activeLoading ? "…" : activeConstructors.length})
            </button>
            <button
              type="button"
              className={`tab-button${activeTab === "all" ? " is-active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Constructors
            </button>
          </div>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Constructors global stats</div>
          <div className="panel-grid">
            <div className="panel-card">
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        {activeTab === "active" ? (
          activeLoading ? (
            <div className="status-card">Loading active constructors…</div>
          ) : activeError ? (
            <div className="status-card error">{activeError}</div>
          ) : activeConstructors.length === 0 ? (
            <div className="status-card">
              No entries found for the {latestSeason?.year ?? ""} season yet.
            </div>
          ) : (
            <div className="tab-panel">
              <div className="section-header">
                <div>
                  <h2>Active Constructors</h2>
                </div>
              </div>
              <TableWrapper>
                <DataTable className="data-table--plain">
                  {constructorTableHead}
                  <tbody>{activeConstructors.map(renderConstructorRow)}</tbody>
                </DataTable>
              </TableWrapper>
            </div>
          )
        ) : loading ? (
          <div className="status-card">Loading constructors…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <div className="tab-panel">
            <div className="section-header">
              <div>
                <h2>All Constructors</h2>
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
                  placeholder="Search by constructor name"
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
              {canEdit ? (
                <button
                  type="button"
                  className="pill"
                  onClick={() => openCreate("constructors")}
                >
                  Create constructor
                </button>
              ) : null}
            </div>
            <TableWrapper>
              <DataTable className="data-table--plain">
                {constructorTableHead}
                <tbody>{constructors.map(renderConstructorRow)}</tbody>
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
