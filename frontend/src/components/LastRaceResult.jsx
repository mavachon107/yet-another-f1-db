import React from "react";
import { Link } from "react-router-dom";
import DataTable from "./DataTable.jsx";
import TableWrapper from "./TableWrapper.jsx";
import DriverName from "./DriverName.jsx";

export default function LastRaceResult({ results, event, countryByCode }) {
  if (!results || results.length === 0) return null;

  const eventName = event?.event_name || "Race";

  return (
    <div className="detail-card">
      <div className="detail-card-header">
        <div>
          <h2>Last race</h2>
          <p>{eventName}</p>
        </div>
        {event?.season_year && event?.slug ? (
          <Link
            className="ghost-button"
            to={`/seasons/${event.season_year}/events/${event.slug}/race`}
          >
            View full results
          </Link>
        ) : null}
      </div>
      <TableWrapper>
        <DataTable className="dashboard-table">
          <thead>
            <tr>
              <th className="position-cell">#</th>
              <th>Driver</th>
              <th>Team</th>
              <th className="points-cell">Pts</th>
            </tr>
          </thead>
          <tbody>
            {results.map((row, index) => {
              const driver = row.entry?.driver || null;
              const team = row.entry?.team || null;
              const pos = row.position || "—";
              return (
                <tr key={row.id || index}>
                  <td className="position-cell">{pos}</td>
                  <td>
                    {driver ? (
                      <DriverName
                        driver={driver}
                        countryByCode={countryByCode}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {team?.team_name || team?.short_name || "—"}
                  </td>
                  <td className="points-cell">
                    {row.points != null ? row.points : "—"}
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
