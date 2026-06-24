import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet, apiUrl } from "../lib/api.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import { ALPHABET } from "../lib/constants.js";
import { useCreateModal } from "../context/CreateModalContext.jsx";
import DataTable from "../components/DataTable.jsx";
import DriverName from "../components/DriverName.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import useCountries from "../hooks/useCountries.js";
import useListFilter from "../hooks/useListFilter.js";

const SEASONS_PAGE_SIZE = 100;

export default function DriverList() {
  const canEdit = useAuthStatus();
  const { openCreate } = useCreateModal();
  const location = useLocation();
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [hasNextPage, setHasNextPage] = useState(false);
  const { countryByCode } = useCountries();

  const [activeTab, setActiveTab] = useState("active");
  const [activeDrivers, setActiveDrivers] = useState([]);
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
        const data = await apiGet("/drivers/stats");
        if (isActive) {
          setStats(data);
          setStatsError("");
        }
      } catch (err) {
        if (isActive) {
          setStatsError(err.message || "Failed to load driver stats.");
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

    async function loadActiveDrivers() {
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
          `/drivers/by-season?season=${encodeURIComponent(latest.short_name)}`
        );
        if (isActive) {
          setActiveDrivers(data || []);
          setActiveError("");
        }
      } catch (err) {
        if (isActive) {
          setActiveError(err.message || "Failed to load active drivers.");
        }
      } finally {
        if (isActive) {
          setActiveLoading(false);
        }
      }
    }

    loadActiveDrivers();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    async function loadDrivers() {
      try {
        setLoading(true);
        const offset = pageIndex * PAGE_SIZE;
        const data = await apiGet(
          filterQuery
            ? `/drivers/search?q=${encodeURIComponent(
              filterQuery
            )}&limit=${PAGE_SIZE}&offset=${offset}`
            : `/drivers/by-last-name?starts_with=${letter}&limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setDrivers(data);
          setHasNextPage(data.length === PAGE_SIZE);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load drivers.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }
    loadDrivers();
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

  const renderDriverRow = (driver) => (
    <tr key={driver.id}>
      <td>
        <Link
          to={`/drivers/${driver.slug}`}
          state={{ returnTo }}
          className="table-link"
        >
          <span className="table-driver">
            {driver.image_url ? (
              <img
                className="driver-thumb"
                src={resolveImageUrl(driver.image_url)}
                alt={
                  driver.first_name
                    ? `${driver.first_name} ${driver.last_name}`
                    : "Driver"
                }
                loading="lazy"
              />
            ) : null}
            <DriverName driver={driver} countryByCode={countryByCode} />
          </span>
        </Link>
      </td>
      <td>
        {driver.nationality ? (() => {
          const country = countryByCode.get(driver.nationality.toLowerCase());
          const alpha2 = country?.alpha2_code?.toLowerCase();
          return (
            <span className="table-driver">
              {alpha2 && (
                <img
                  className="flag-icon"
                  src={`https://flagcdn.com/24x18/${alpha2}.png`}
                  alt={country?.name ? `${country.name} flag` : "Country flag"}
                  loading="lazy"
                />
              )}
              <span>{country?.name || driver.nationality}</span>
            </span>
          );
        })() : "—"}
      </td>
      <td>{driver.dob || "—"}</td>
      <td>{driver.first_run_year ?? "—"}</td>
      <td>{driver.last_run_year ?? "—"}</td>
      <td>{driver.event_entry_count ?? "—"}</td>
      <td>{driver.wins_count ?? "—"}</td>
    </tr>
  );

  const driverTableHead = (
    <thead>
      <tr>
        <th>Driver</th>
        <th>Country</th>
        <th>DOB</th>
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
        title="Drivers"
        description="Every Formula 1 driver since 1950 with career stats, wins, and teams."
      />
      <section className="hero compact">
        <div className="hero-content">
          <h1>Driver catalog</h1>
          <div className="tabs">
            <button
              type="button"
              className={`tab-button${activeTab === "active" ? " is-active" : ""}`}
              onClick={() => setActiveTab("active")}
            >
              Active Drivers ({activeLoading ? "…" : activeDrivers.length})
            </button>
            <button
              type="button"
              className={`tab-button${activeTab === "all" ? " is-active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Drivers
            </button>
          </div>


        </div>
        <div className="hero-panel">
          <div className="panel-title">Drivers global stats</div>
          <div className="panel-grid">
            <div className="panel-card">
            </div>
          </div>
        </div>
      </section>

      <section className="section">

        {activeTab === "active" ? (
          activeLoading ? (
            <div className="status-card">Loading active drivers…</div>
          ) : activeError ? (
            <div className="status-card error">{activeError}</div>
          ) : activeDrivers.length === 0 ? (
            <div className="status-card">
              No entries found for the {latestSeason?.year ?? ""} season yet.
            </div>
          ) : (
            <div className="tab-panel">
              <div className="section-header">
                <div>
                  <h2>Active Drivers</h2>
                </div>
              </div>
              <TableWrapper>
                <DataTable className="data-table--plain">
                  {driverTableHead}
                  <tbody>{activeDrivers.map(renderDriverRow)}</tbody>
                </DataTable>
              </TableWrapper>
            </div>
          )
        ) : loading ? (
          <div className="status-card">Loading drivers…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <div className="tab-panel">
            <div className="section-header">
              <div>
                <h2>Drivers list</h2>
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
                  placeholder="Search by first or last name"
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
                  onClick={() => openCreate("drivers")}
                >
                  Create driver
                </button>
              ) : null}
            </div>
            <TableWrapper>
              <DataTable className="data-table--plain">
                {driverTableHead}
                <tbody>{drivers.map(renderDriverRow)}</tbody>
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
