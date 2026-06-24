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

const LOOKUP_PAGE_SIZE = 100;
const SEASONS_PAGE_SIZE = 100;

export default function TeamList() {
  const canEdit = useAuthStatus();
  const { openCreate } = useCreateModal();
  const location = useLocation();
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState("");
  const [hasNextPage, setHasNextPage] = useState(false);
  const [constructorMap, setConstructorMap] = useState(new Map());

  const [activeTab, setActiveTab] = useState("active");
  const [activeTeams, setActiveTeams] = useState([]);
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

  useEffect(() => {
    let isActive = true;
    async function loadStats() {
      try {
        const data = await apiGet("/teams/stats");
        if (isActive) {
          setStats(data);
          setStatsError("");
        }
      } catch (err) {
        if (isActive) {
          setStatsError(err.message || "Failed to load team stats.");
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
    async function loadConstructors() {
      try {
        let offset = 0;
        let items = [];
        while (true) {
          const batch = await apiGet(
            `/constructors?limit=${LOOKUP_PAGE_SIZE}&offset=${offset}`
          );
          items = items.concat(batch);
          if (batch.length < LOOKUP_PAGE_SIZE) {
            break;
          }
          offset += LOOKUP_PAGE_SIZE;
        }
        if (isActive) {
          setConstructorMap(
            new Map(items.map((item) => [item.id, item]))
          );
        }
      } catch (err) {
        if (isActive) {
          setConstructorMap(new Map());
        }
      }
    }
    loadConstructors();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function loadActiveTeams() {
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
          `/teams/by-season?season=${encodeURIComponent(latest.short_name)}`
        );
        if (isActive) {
          setActiveTeams(data || []);
          setActiveError("");
        }
      } catch (err) {
        if (isActive) {
          setActiveError(err.message || "Failed to load active teams.");
        }
      } finally {
        if (isActive) {
          setActiveLoading(false);
        }
      }
    }

    loadActiveTeams();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    async function loadTeams() {
      try {
        setLoading(true);
        const offset = pageIndex * PAGE_SIZE;
        const data = await apiGet(
          filterQuery
            ? `/teams/search?q=${encodeURIComponent(
                filterQuery
              )}&limit=${PAGE_SIZE}&offset=${offset}`
            : `/teams/by-name?starts_with=${letter}&limit=${PAGE_SIZE}&offset=${offset}`
        );
        if (isActive) {
          setTeams(data);
          setHasNextPage(data.length === PAGE_SIZE);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setError(err.message || "Failed to load teams.");
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }
    loadTeams();
    return () => {
      isActive = false;
    };
  }, [filterQuery, letter, pageIndex]);

  const formatConstructorName = (constructorId) => {
    const constructor = constructorMap.get(constructorId);
    return constructor?.name || constructor?.short_name || "—";
  };

  const renderTeamRow = (team) => (
    <tr key={team.id}>
      <td>
        <Link
          to={`/teams/${team.slug}`}
          state={{ returnTo }}
          className="table-link"
        >
          {team.team_name || "—"}
        </Link>
      </td>
      <td>{formatConstructorName(team.constructor_id)}</td>
      <td>{team.first_run_year ?? "—"}</td>
      <td>{team.last_run_year ?? "—"}</td>
      <td>{team.event_entry_count ?? "—"}</td>
      <td>{team.wins_count ?? "—"}</td>
      <td>{team.country || "—"}</td>
      <td>
        {team.url ? (
          <a href={team.url} target="_blank" rel="noreferrer">
            Link
          </a>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );

  const teamTableHead = (
    <thead>
      <tr>
        <th>Team</th>
        <th>Constructor</th>
        <th>First Run</th>
        <th>Last Run</th>
        <th>Event Entries</th>
        <th>Wins</th>
        <th>Country</th>
        <th>URL</th>
      </tr>
    </thead>
  );

  return (
    <div className="page">
      <SeoHead
        title="Teams"
        description="Formula 1 teams and their results across every season since 1950."
      />
      <section className="hero compact">
        <div className="hero-content">
          <h1>Team catalog</h1>
          <div className="tabs">
          <button
            type="button"
            className={`tab-button${activeTab === "active" ? " is-active" : ""}`}
            onClick={() => setActiveTab("active")}
          >
            Active Teams ({activeLoading ? "…" : activeTeams.length})
          </button>
          <button
            type="button"
            className={`tab-button${activeTab === "all" ? " is-active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Teams
          </button>
        </div>
        </div>
         <div className="hero-panel">
          <div className="panel-title">Team global stats</div>
          <div className="panel-grid">
            <div className="panel-card">
            </div>
          </div>
        </div>
      </section>

      <section className="section">
       

        {activeTab === "active" ? (
          activeLoading ? (
            <div className="status-card">Loading active teams…</div>
          ) : activeError ? (
            <div className="status-card error">{activeError}</div>
          ) : activeTeams.length === 0 ? (
            <div className="status-card">
              No entries found for the {latestSeason?.year ?? ""} season yet.
            </div>
          ) : (
            <div className="tab-panel">
              <div className="section-header">
                <div>
                  <h2>Active Teams</h2>
                </div>
              </div>
              <TableWrapper>
                <DataTable className="data-table--plain">
                  {teamTableHead}
                  <tbody>{activeTeams.map(renderTeamRow)}</tbody>
                </DataTable>
              </TableWrapper>
            </div>
          )
        ) : loading ? (
          <div className="status-card">Loading teams…</div>
        ) : error ? (
          <div className="status-card error">{error}</div>
        ) : (
          <div className="tab-panel">
            <div className="section-header">
              <div>
                <h2>All Teams</h2>
              </div>
            </div>
            {!filterInput.trim() && (
              <div className="alpha-filter">
                {ALPHABET.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`alpha-button${
                      letter === item ? " is-active" : ""
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
                  placeholder="Search by team name"
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
                  onClick={() => openCreate("teams")}
                >
                  Create team
                </button>
              ) : null}
            </div>
            <TableWrapper>
              <DataTable className="data-table--plain">
                {teamTableHead}
                <tbody>{teams.map(renderTeamRow)}</tbody>
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
