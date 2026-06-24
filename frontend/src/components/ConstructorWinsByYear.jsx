import React, { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "../lib/api.js";
import DataTable from "./DataTable.jsx";
import TableWrapper from "./TableWrapper.jsx";

const COLOR_HIGH = "#185FA5";
const COLOR_MED = "#378ADD";
const COLOR_LOW = "#85B7EB";
const COLOR_ZERO = "#D3D1C7";

function winColor(wins) {
  if (wins >= 10) return COLOR_HIGH;
  if (wins >= 5) return COLOR_MED;
  if (wins >= 1) return COLOR_LOW;
  return COLOR_ZERO;
}

const LEGEND_ITEMS = [
  { color: COLOR_HIGH, label: "10+ wins" },
  { color: COLOR_MED, label: "5\u20139 wins" },
  { color: COLOR_LOW, label: "1\u20134 wins" },
  { color: COLOR_ZERO, label: "0 wins" },
];

export default function ConstructorWinsByYear({ constructorId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    apiGet(`/constructors/${constructorId}/wins-by-year`)
      .then((d) => {
        if (active) {
          setData(Array.isArray(d) ? d : []);
          setError("");
        }
      })
      .catch((err) => {
        if (active) setError(err.message || "Failed to load wins by year.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [constructorId]);

  const buildChart = useCallback(() => {
    const Chart = window.Chart;
    if (!Chart || !canvasRef.current || data.length === 0) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const labels = data.map((d) => String(d.year));
    const wins = data.map((d) => d.wins);
    const colors = wins.map(winColor);
    const maxWins = Math.max(...wins, 1);

    chartRef.current = new Chart(canvasRef.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            data: wins,
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items[0]?.label || "",
              label: (item) =>
                item.raw > 0 ? `${item.raw} win${item.raw > 1 ? "s" : ""}` : "No wins this season",
            },
          },
        },
        scales: {
          x: {
            border: { display: false },
            grid: { display: false },
            ticks: {
              font: { size: 11 },
              color: "#888780",
              autoSkip: false,
              maxRotation: 45,
            },
          },
          y: {
            border: { display: false },
            grid: { color: "rgba(136,135,128,0.15)" },
            ticks: {
              stepSize: 2,
              color: "#888780",
            },
            beginAtZero: true,
            max: Math.ceil(maxWins / 2) * 2 + 1,
          },
        },
      },
    });
  }, [data]);

  useEffect(() => {
    buildChart();
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [buildChart]);

  if (loading) return <div className="status-card">Loading wins by year...</div>;
  if (error) return <div className="status-card error">{error}</div>;
  if (data.length === 0) return <div className="status-card">No race data recorded.</div>;

  const totalWins = data.reduce((s, d) => s + d.wins, 0);
  const totalEvents = data.reduce((s, d) => s + d.events, 0);
  const bestYear = data.reduce((best, d) => (d.wins > best.wins ? d : best), data[0]);

  return (
    <div style={{ padding: "1rem 0" }}>
      {/* Metric cards */}
      <div className="wins-year-metrics">
        <div className="wins-year-metric-card">
          <div className="wins-year-metric-label">Total wins</div>
          <div className="wins-year-metric-value">{totalWins}</div>
        </div>
        <div className="wins-year-metric-card">
          <div className="wins-year-metric-label">Total events</div>
          <div className="wins-year-metric-value">{totalEvents}</div>
        </div>
        <div className="wins-year-metric-card">
          <div className="wins-year-metric-label">Best year</div>
          <div className="wins-year-metric-value">
            {bestYear.wins > 0 ? `${bestYear.year} (${bestYear.wins})` : "\u2014"}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div style={{ position: "relative", width: "100%", height: 340 }}>
        <canvas ref={canvasRef} />
      </div>

      {/* Custom legend */}
      <div className="wins-year-legend">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="wins-year-legend-item">
            <span
              className="wins-year-legend-swatch"
              style={{ backgroundColor: item.color }}
            />
            {item.label}
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ marginTop: 24 }}>
        <TableWrapper>
          <DataTable>
            <thead>
              <tr>
                <th>Year</th>
                <th>Wins</th>
                <th>Events</th>
                <th>Win rate</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.year}>
                  <td>{d.year}</td>
                  <td>{d.wins}</td>
                  <td>{d.events}</td>
                  <td>
                    {d.events > 0
                      ? `${((d.wins / d.events) * 100).toFixed(0)}%`
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </TableWrapper>
      </div>
    </div>
  );
}
