import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet } from "../lib/api.js";
import DataTable from "../components/DataTable.jsx";
import DriverName from "../components/DriverName.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import useCountries from "../hooks/useCountries.js";

const SEASONS_PAGE_SIZE = 25;

const formatUpdatedAt = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export default function SeasonList() {
  const [seasons, setSeasons] = useState([]);
  const [seasonPageIndex, setSeasonPageIndex] = useState(0);
  const [seasonLoading, setSeasonLoading] = useState(true);
  const [seasonError, setSeasonError] = useState("");
  const [competitionMap, setCompetitionMap] = useState(new Map());
  const [championsMap, setChampionsMap] = useState(new Map());
  const [constructorMap, setConstructorMap] = useState(new Map());
  const [eventCountsMap, setEventCountsMap] = useState(new Map());
  const [seasonSortKey, setSeasonSortKey] = useState("year");
  const [seasonSortDir, setSeasonSortDir] = useState("asc");
  const { countryByCode } = useCountries();

  useEffect(() => {
    let isActive = true;

    async function loadSeasons() {
      try {
        let offset = 0;
        let items = [];
        while (true) {
          const batch = await apiGet(
            `/seasons?limit=${SEASONS_PAGE_SIZE}&offset=${offset}`
          );
          items = items.concat(batch);
          if (batch.length < SEASONS_PAGE_SIZE) {
            break;
          }
          offset += SEASONS_PAGE_SIZE;
        }
        if (isActive) {
          setSeasons(items);
          setSeasonError("");
        }
      } catch (err) {
        if (isActive) {
          setSeasonError(err.message || "Failed to load seasons.");
        }
      } finally {
        if (isActive) {
          setSeasonLoading(false);
        }
      }
    }

    loadSeasons();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    async function fetchAllCompetitions() {
      const PAGE_SIZE = 100;
      let offset = 0;
      let items = [];
      while (true) {
        const batch = await apiGet(
          `/competitions?limit=${PAGE_SIZE}&offset=${offset}`
        );
        items = items.concat(batch);
        if (batch.length < PAGE_SIZE) {
          break;
        }
        offset += PAGE_SIZE;
      }
      return items;
    }

    async function fetchAllConstructors() {
      const PAGE_SIZE = 100;
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
    }

    async function loadLookups() {
      try {
        const [competitions, champions, constructors, eventCounts] =
          await Promise.all([
          fetchAllCompetitions(),
          apiGet("/stats/season_champions"),
          fetchAllConstructors(),
          apiGet("/seasons/event-counts"),
        ]);
        if (!isActive) return;
        const nextCompetitionMap = new Map();
        competitions.forEach((competition) => {
          nextCompetitionMap.set(competition.id, competition);
        });
        const nextChampionsMap = new Map();
        (champions || []).forEach((item) => {
          nextChampionsMap.set(item.season_id, item);
        });
        const nextConstructorMap = new Map();
        constructors.forEach((constructor) => {
          nextConstructorMap.set(constructor.id, constructor);
        });
        const nextEventCountsMap = new Map();
        (eventCounts || []).forEach((item) => {
          nextEventCountsMap.set(item.season_short_name, item);
        });
        setCompetitionMap(nextCompetitionMap);
        setChampionsMap(nextChampionsMap);
        setConstructorMap(nextConstructorMap);
        setEventCountsMap(nextEventCountsMap);
      } catch (err) {
        if (isActive) {
          setCompetitionMap(new Map());
          setChampionsMap(new Map());
          setConstructorMap(new Map());
          setEventCountsMap(new Map());
        }
      }
    }

    loadLookups();
    return () => {
      isActive = false;
    };
  }, []);

  const formatConstructorName = (constructor) => {
    if (!constructor) return "—";
    return constructor.name || constructor.short_name || "—";
  };

  const formatDriverName = (driver) => {
    if (!driver) return "—";
    const fullName = `${driver.first_name || ""} ${driver.last_name || ""}`.trim();
    if (fullName) return fullName;
    return driver.short_name || "—";
  };

  const sortedSeasons = useMemo(() => {
    const dir = seasonSortDir === "asc" ? 1 : -1;
    const valueFor = (season) => {
      if (seasonSortKey === "competition") {
        const competition = competitionMap.get(season.competition_id);
        return competition?.name || "";
      }
      if (seasonSortKey === "driver") {
        const champions = championsMap.get(season.id);
        return formatDriverName(champions?.driver) || "";
      }
      if (seasonSortKey === "constructor") {
        const champions = championsMap.get(season.id);
        return formatConstructorName(champions?.constructor) || "";
      }
      return season.year ?? 0;
    };
    return [...seasons].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      if (typeof aValue === "number" && typeof bValue === "number") {
        return (aValue - bValue) * dir;
      }
      return String(aValue).localeCompare(String(bValue)) * dir;
    });
  }, [seasons, seasonSortDir, seasonSortKey, competitionMap, championsMap]);

  const pagedSeasons = useMemo(() => {
    const start = seasonPageIndex * SEASONS_PAGE_SIZE;
    return sortedSeasons.slice(start, start + SEASONS_PAGE_SIZE);
  }, [sortedSeasons, seasonPageIndex]);

  const seasonHasNextPage =
    (seasonPageIndex + 1) * SEASONS_PAGE_SIZE < sortedSeasons.length;

  const handleSeasonSort = (key) => {
    if (seasonSortKey === key) {
      setSeasonSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSeasonSortKey(key);
    setSeasonSortDir("asc");
    setSeasonPageIndex(0);
  };

  const sortArrow = (key) => {
    if (seasonSortKey !== key) return "";
    return seasonSortDir === "asc" ? "↑" : "↓";
  };

  return (
    <div className="page">
      <SeoHead
        title="Seasons"
        description="Every Formula 1 season from 1950 to today, with events and results."
      />
      <section className="hero compact">
        <div className="hero-content">
          <h1>Season catalog</h1>
        </div>
        <div className="hero-panel">
          <div className="panel-title">Seasons global stats</div>
          <div className="panel-grid">
            <div className="panel-card">
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        {seasonLoading ? (
          <div className="status-card">Loading seasons…</div>
        ) : seasonError ? (
          <div className="status-card error">{seasonError}</div>
        ) : (
          <div className="tab-panel">
            <TableWrapper>
              <DataTable>
                <thead>
                  <tr>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSeasonSort("year")}
                      >
                        Year {sortArrow("year")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSeasonSort("competition")}
                      >
                        Competition {sortArrow("competition")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSeasonSort("driver")}
                      >
                        World Driver Champion {sortArrow("driver")}
                      </button>
                    </th>
                    <th>
                      <button
                        type="button"
                        className="table-sort-button"
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          font: "inherit",
                          fontSize: "inherit",
                          fontWeight: "inherit",
                          color: "inherit",
                          textAlign: "left",
                          cursor: "pointer",
                          textTransform: "capitalize",
                        }}
                        onClick={() => handleSeasonSort("constructor")}
                      >
                        World Constructor Champion {sortArrow("constructor")}
                      </button>
                    </th>
                    <th>Championship events</th>
                    <th>Non-championship events</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedSeasons.map((season) => {
                    const competition = competitionMap.get(season.competition_id);
                    const champions = championsMap.get(season.id);
                    const counts = eventCountsMap.get(season.short_name);
                    return (
                      <tr key={season.id}>
                        <td>
                          <Link to={`/seasons/${season.year}`} className="table-link">
                            {season.year}
                          </Link>
                        </td>
                        <td>{competition?.name || "—"}</td>
                        <td>
                          <DriverName
                            driver={champions?.driver}
                            countryByCode={countryByCode}
                          />
                        </td>
                        <td>
                          {formatConstructorName(champions?.constructor)}
                        </td>
                        <td>{counts?.championship_events ?? "—"}</td>
                        <td>{counts?.non_championship_events ?? "—"}</td>
                        <td>{formatUpdatedAt(season.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </DataTable>
            </TableWrapper>
            {sortedSeasons.length > SEASONS_PAGE_SIZE && (
              <div className="pager">
                <button
                  type="button"
                  className="pager-button"
                  onClick={() =>
                    setSeasonPageIndex((prev) => Math.max(prev - 1, 0))
                  }
                  disabled={seasonPageIndex === 0}
                >
                  Previous
                </button>
                <span className="pager-label">
                  Page {seasonPageIndex + 1}
                </span>
                <button
                  type="button"
                  className="pager-button"
                  onClick={() => setSeasonPageIndex((prev) => prev + 1)}
                  disabled={!seasonHasNextPage}
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
