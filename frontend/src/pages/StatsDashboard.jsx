import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import SeoHead from "../components/SeoHead.jsx";
import { apiGet } from "../lib/api.js";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import DriverName from "../components/DriverName.jsx";
import useCountries from "../hooks/useCountries.js";

const SECTION_ORDER = ["global", "drivers", "constructors"];

const SECTION_META = {
  global: {
    label: "Global",
    title: "Global stats",
    subtitle: "Cross-season insights and overall championship context.",
    defaultMetric: "entrants_by_year",
    metrics: [
      {
        key: "entrants_by_year",
        label: "Entrants by year",
        endpoint: "/stats/number_entrants_by_year",
      },
      {
        key: "km_by_year",
        label: "KM travelled by year",
        endpoint: "/stats/km_by_year",
        note: "This graph represents the cumulated distance travelled from one event's location to the next one throughout a season.",
      },
      {
        key: "season_champions",
        label: "Season champions",
        endpoint: "/stats/season_champions",
      },
    ],
  },
  drivers: {
    label: "Drivers",
    title: "Driver stats",
    subtitle: "Driver leaderboards for race wins and qualifying poles.",
    defaultMetric: "number_wins",
    metrics: [
      {
        key: "number_wins",
        label: "Number of wins",
        endpoint: "/drivers/stats/number_wins",
      },
      {
        key: "number_pole_positions",
        label: "Pole positions",
        endpoint: "/drivers/stats/number_pole_positions",
      },
      {
        key: "dotd_wins",
        label: "Driver of the Day",
        endpoint: "/drivers/stats/dotd_wins",
        note: "Driver of the Day award exists since 2016.",
      },
      {
        key: "wins_by_country",
        label: "Wins by country",
        endpoint: "/drivers/stats/wins_by_country",
      },
    ],
  },
  constructors: {
    label: "Constructors",
    title: "Constructor stats",
    subtitle: "Constructor leaderboards for race wins and qualifying poles.",
    defaultMetric: "number_wins",
    metrics: [
      {
        key: "number_wins",
        label: "Number of wins",
        endpoint: "/constructors/stats/number_wins",
      },
      {
        key: "number_pole_positions",
        label: "Pole positions",
        endpoint: "/constructors/stats/number_pole_positions",
      },
      {
        key: "lineage_transitions",
        label: "Lineage transitions",
        endpoint: "/constructors/stats/lineage-transitions",
      },
    ],
  },
};

function resolveSection(pathname) {
  if (pathname.startsWith("/stats/drivers")) return "drivers";
  if (pathname.startsWith("/stats/constructors")) return "constructors";
  return "global";
}

function metricLink(section, metric) {
  return `/stats/${section}?metric=${encodeURIComponent(metric)}`;
}

function renderGlobalMetric(metric, data, loading, countryByCode) {
  if (metric === "entrants_by_year") {
    const chartData = Array.isArray(data)
      ? data.map((row) => ({ year: row.year, entrants: row.entrants }))
      : [];

    return (
      <div className="tab-panel">
        <TableWrapper>
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="4 4" />
                <XAxis dataKey="year" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="entrants"
                  stroke="#f4b942"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#f4b942" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TableWrapper>
      </div>
    );
  }

  if (metric === "km_by_year") {
    const chartData = Array.isArray(data)
      ? data.map((row) => ({ year: row.year, km: row.km }))
      : [];

    const metricConfig = SECTION_META.global.metrics.find((m) => m.key === metric);

    return (
      <div className="tab-panel">
        {metricConfig?.note ? (
          <p className="hero-subtitle" style={{ marginBottom: 12 }}>
            {metricConfig.note}
          </p>
        ) : null}
        <TableWrapper>
          <div style={{ width: "100%", height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="4 4" />
                <XAxis dataKey="year" />
                <YAxis
                  allowDecimals={false}
                  tickFormatter={(v) => `${Math.round(v).toLocaleString()}`}
                />
                <Tooltip
                  formatter={(value) => [`${Number(value).toLocaleString()} km`, "Distance"]}
                />
                <Line
                  type="monotone"
                  dataKey="km"
                  stroke="#42a5f5"
                  strokeWidth={2}
                  dot={{ r: 3, fill: "#42a5f5" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </TableWrapper>
      </div>
    );
  }

  if (metric === "season_champions") {
    const rows = Array.isArray(data) ? data : [];
    return (
      <div className="tab-panel">
        <TableWrapper>
          <DataTable>
            <thead>
              <tr>
                <th>Season</th>
                <th>Driver champion</th>
                <th>Constructor champion</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const driver = row.driver || null;
                const constructor = row.constructor || null;
                const constructorName =
                  constructor?.name || constructor?.short_name || "—";
                const cKey = (constructor?.country || "").toLowerCase();
                const cResolved = countryByCode ? countryByCode.get(cKey) : null;
                const cAlpha2 = cResolved?.alpha2_code
                  ? cResolved.alpha2_code.toLowerCase()
                  : null;
                const cLabel = cResolved?.name || constructor?.country || null;
                return (
                  <tr key={`champion-${row.season_id}`}>
                    <td>{row.year ?? row.season_id}</td>
                    <td>
                      {driver ? (
                        <span>
                          <DriverName driver={driver} countryByCode={countryByCode} />
                          {driver.constructor_name ? (
                            <span style={{ marginLeft: 6, opacity: 0.7 }}>
                              ({driver.constructor_name})
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {constructor ? (
                        <span>
                          {constructorName}
                          {cLabel ? (
                            <span style={{ marginLeft: 6, opacity: 0.7 }}>
                              ({cAlpha2 ? (
                                <img
                                  className="flag-icon"
                                  src={`https://flagcdn.com/24x18/${cAlpha2}.png`}
                                  alt={`${cLabel} flag`}
                                  loading="lazy"
                                  style={{ verticalAlign: "middle", marginRight: 3 }}
                                />
                              ) : null}
                              {cLabel})
                            </span>
                          ) : null}
                        </span>
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
      </div>
    );
  }

  if (loading) {
    return <div className="status-card">Loading stats…</div>;
  }
  return null;
}

function denseRanks(rows, valueKey = "total") {
  const ranks = [];
  let rank = 1;
  for (let i = 0; i < rows.length; i++) {
    if (i > 0 && (rows[i][valueKey] ?? 0) < (rows[i - 1][valueKey] ?? 0)) {
      rank = rank + 1;
    }
    ranks.push(rank);
  }
  return ranks;
}

function renderDriverMetric(metric, data, countryByCode) {
  const rows = Array.isArray(data) ? data : [];

  if (metric === "wins_by_country") {
    const ranks = denseRanks(rows);
    return (
      <div className="tab-panel">
        <TableWrapper>
          <DataTable>
            <thead>
              <tr>
                <th>#</th>
                <th>Country</th>
                <th>Wins</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = (row.country || "").toLowerCase();
                const resolved = countryByCode ? countryByCode.get(key) : null;
                const alpha2 = resolved?.alpha2_code
                  ? resolved.alpha2_code.toLowerCase()
                  : null;
                const label = resolved?.name || row.country || "—";
                return (
                  <tr key={`country-${row.country}`}>
                    <td>{ranks[index]}</td>
                    <td>
                      <span className="table-driver">
                        {alpha2 ? (
                          <img
                            className="flag-icon"
                            src={`https://flagcdn.com/24x18/${alpha2}.png`}
                            alt={`${label} flag`}
                            loading="lazy"
                          />
                        ) : null}
                        <span>{label}</span>
                      </span>
                    </td>
                    <td>{row.total ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </TableWrapper>
      </div>
    );
  }

  const valueHeaders = {
    number_wins: "Wins",
    number_pole_positions: "Pole positions",
    dotd_wins: "DOTD Wins",
  };
  const valueHeader = valueHeaders[metric] || "Total";
  const metricConfig = SECTION_META.drivers.metrics.find((m) => m.key === metric);
  const driverRanks = denseRanks(rows);

  return (
    <div className="tab-panel">
      {metricConfig?.note ? (
        <p className="hero-subtitle" style={{ marginBottom: 12 }}>
          {metricConfig.note}
        </p>
      ) : null}
      <TableWrapper>
        <DataTable>
          <thead>
            <tr>
              <th>#</th>
              <th>Driver</th>
              <th>{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${metric}-${row.driver_id}`}>
                <td>{driverRanks[index]}</td>
                <td>
                  <DriverName driver={row} countryByCode={countryByCode} />
                </td>
                <td>{row.total ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrapper>
    </div>
  );
}

function renderConstructorMetric(metric, data) {
  const rows = Array.isArray(data) ? data : [];
  if (metric === "lineage_transitions") {
    return (
      <div className="tab-panel">
        <TableWrapper>
          <DataTable>
            <thead>
              <tr>
                <th>#</th>
                <th>Parent</th>
                <th>Child</th>
                <th>Year(s)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const parentName = row.parent_name || row.parent_short_name || "—";
                const childName = row.child_name || row.child_short_name || "—";
                const first = row.child_first_run_year ?? null;
                const last = row.child_last_run_year ?? null;
                const years =
                  first && last
                    ? first === last
                      ? String(first)
                      : `${first} - ${last}`
                    : first || last || "—";
                return (
                  <tr key={`${row.parent_constructor_id}-${row.child_constructor_id}`}>
                    <td>{index + 1}</td>
                    <td>{parentName}</td>
                    <td>{childName}</td>
                    <td>{years}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </TableWrapper>
      </div>
    );
  }
  const valueHeader = metric === "number_wins" ? "Wins" : "Pole positions";
  const constructorRanks = denseRanks(rows);

  return (
    <div className="tab-panel">
      <TableWrapper>
        <DataTable>
          <thead>
            <tr>
              <th>#</th>
              <th>Constructor</th>
              <th>{valueHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${metric}-${row.constructor_id}`}>
                <td>{constructorRanks[index]}</td>
                <td>{row.name || row.short_name || "—"}</td>
                <td>{row.total ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrapper>
    </div>
  );
}

export default function StatsDashboard() {
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { countryByCode } = useCountries();
  const [cache, setCache] = useState({});

  const section = resolveSection(location.pathname);
  const sectionConfig = SECTION_META[section];
  const metricKeys = useMemo(
    () => new Set(sectionConfig.metrics.map((item) => item.key)),
    [sectionConfig]
  );
  const rawMetric = searchParams.get("metric") || sectionConfig.defaultMetric;
  const metric = metricKeys.has(rawMetric) ? rawMetric : sectionConfig.defaultMetric;

  useEffect(() => {
    if (!metricKeys.has(rawMetric)) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("metric", sectionConfig.defaultMetric);
      setSearchParams(nextParams, { replace: true });
    }
  }, [metricKeys, rawMetric, searchParams, sectionConfig.defaultMetric, setSearchParams]);

  const metricConfig = sectionConfig.metrics.find((item) => item.key === metric);
  const cacheKey = `${section}:${metric}`;
  const current = cache[cacheKey] || { loading: false, error: "", data: null };

  useEffect(() => {
    if (!metricConfig) return;
    if (current.loading || current.data !== null || current.error) return;

    let isActive = true;
    setCache((prev) => ({
      ...prev,
      [cacheKey]: { loading: true, error: "", data: null },
    }));

    apiGet(metricConfig.endpoint)
      .then((result) => {
        if (!isActive) return;
        setCache((prev) => ({
          ...prev,
          [cacheKey]: { loading: false, error: "", data: result },
        }));
      })
      .catch((err) => {
        if (!isActive) return;
        setCache((prev) => ({
          ...prev,
          [cacheKey]: {
            loading: false,
            error: err.message || "Failed to load stats.",
            data: null,
          },
        }));
      });

    return () => {
      isActive = false;
    };
  }, [cacheKey, metricConfig]);

  return (
    <div className="page">
      <SeoHead
        title="Statistics"
        description="Global, driver, and constructor Formula 1 statistics and records."
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Stats</p>
          <h1>{sectionConfig.title}</h1>
          <p className="hero-subtitle">{sectionConfig.subtitle}</p>
        </div>
      </section>

      <section className="section">
        <div className="stats-section-nav">
          {SECTION_ORDER.map((sectionKey) => {
            const isActive = sectionKey === section;
            const to = metricLink(sectionKey, SECTION_META[sectionKey].defaultMetric);
            return (
              <Link
                key={sectionKey}
                className={`stats-nav-pill${isActive ? " active" : ""}`}
                to={to}
              >
                {SECTION_META[sectionKey].label}
              </Link>
            );
          })}
        </div>

        <div className="stats-metric-nav">
          {sectionConfig.metrics.map((item) => {
            const isActive = item.key === metric;
            const cached = cache[`${section}:${item.key}`];
            const count = Array.isArray(cached?.data) ? cached.data.length : null;
            return (
              <Link
                key={item.key}
                className={`stats-metric-pill${isActive ? " active" : ""}`}
                to={metricLink(section, item.key)}
              >
                {item.label}{count !== null ? ` (${count})` : ""}
              </Link>
            );
          })}
        </div>

        {current.loading && current.data === null ? (
          <div className="status-card">Loading stats…</div>
        ) : null}

        {current.error ? <div className="status-card error">{current.error}</div> : null}

        {!current.loading && !current.error ? (
          <>
            {section === "global"
              ? renderGlobalMetric(metric, current.data, current.loading, countryByCode)
              : null}
            {section === "drivers"
              ? renderDriverMetric(metric, current.data, countryByCode)
              : null}
            {section === "constructors"
              ? renderConstructorMetric(metric, current.data)
              : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
