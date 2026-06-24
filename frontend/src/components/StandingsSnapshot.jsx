import React, { useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "./DataTable.jsx";
import TableWrapper from "./TableWrapper.jsx";
import DriverName from "./DriverName.jsx";

export default function StandingsSnapshot({
  driverStandings,
  constructorStandings,
  countryByCode,
  eventName,
  event,
}) {
  const [tab, setTab] = useState("drivers");

  const hasDrivers = driverStandings && driverStandings.length > 0;
  const hasConstructors = constructorStandings && constructorStandings.length > 0;

  if (!hasDrivers && !hasConstructors) return null;

  const rows = tab === "drivers" ? driverStandings : constructorStandings;

  return (
    <div className="detail-card">
      <div className="detail-card-header">
        <div>
          <h2>Championship standings</h2>
          {eventName ? (
            <p>After {eventName}</p>
          ) : null}
        </div>
        {event?.season_year && event?.slug ? (
          <Link
            className="ghost-button"
            to={`/seasons/${event.season_year}/events/${event.slug}/standings`}
          >
            View full standings
          </Link>
        ) : null}
      </div>
      <div className="standings-tabs">
        <button
          type="button"
          className={`standings-tab${tab === "drivers" ? " active" : ""}`}
          onClick={() => setTab("drivers")}
        >
          Drivers
        </button>
        <button
          type="button"
          className={`standings-tab${tab === "constructors" ? " active" : ""}`}
          onClick={() => setTab("constructors")}
        >
          Constructors
        </button>
      </div>
      <TableWrapper>
        <DataTable className="dashboard-table">
          <thead>
            <tr>
              <th className="position-cell">#</th>
              <th>{tab === "drivers" ? "Driver" : "Constructor"}</th>
              {tab === "drivers" ? <th>Constructor</th> : null}
              <th className="points-cell">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${tab}-${row.id}`}>
                <td className="position-cell">{row.position}</td>
                <td>
                  {tab === "drivers" ? (
                    row.driver ? (
                      <DriverName
                        driver={row.driver}
                        countryByCode={countryByCode}
                      />
                    ) : (
                      "—"
                    )
                  ) : (
                    row.constructor?.name ||
                    row.constructor?.short_name ||
                    "—"
                  )}
                </td>
                {tab === "drivers" ? (
                  <td>
                    {row.constructor?.name ||
                      row.constructor?.short_name ||
                      "—"}
                  </td>
                ) : null}
                <td className="points-cell">
                  {row.points != null ? row.points : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </TableWrapper>
    </div>
  );
}
