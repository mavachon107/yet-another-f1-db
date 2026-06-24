import { useCallback, useEffect, useRef, useState } from "react";
import DataTable from "../components/DataTable.jsx";
import TableWrapper from "../components/TableWrapper.jsx";
import { apiFetch, readErrorMessage } from "../lib/api.js";
import { getAccessTokenRole, onAuthChanged } from "../lib/auth.js";

const REFRESH_MS = 10_000;

// Scheduler timestamps are naive UTC ISO strings (no timezone suffix). Append "Z"
// so the browser parses them as UTC and renders in the viewer's local time.
function formatUtc(value) {
  if (!value) return "—";
  const iso = /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

const LEVEL_COLORS = {
  success: "#2f9b5f",
  error: "#d23b3b",
  warning: "#b8860b",
  info: "var(--muted)",
};

function LevelBadge({ level }) {
  const color = LEVEL_COLORS[level] || "var(--muted)";
  return (
    <span
      className="pill-static"
      style={{ color, borderColor: color, textTransform: "uppercase", fontSize: "0.7rem" }}
    >
      {level}
    </span>
  );
}

function sessionLabel(row) {
  if (row.event_name && row.session_type) return `${row.event_name} · ${row.session_type}`;
  if (row.event_name) return row.event_name;
  if (row.session_type) return row.session_type;
  if (row.session_id) return `session ${row.session_id}`;
  if (row.event_id) return `event ${row.event_id}`;
  return "—";
}

export default function SchedulerLogs() {
  const [isAdmin, setIsAdmin] = useState(() => getAccessTokenRole() === "admin");
  const [status, setStatus] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const activeRef = useRef(true);

  useEffect(() => onAuthChanged(() => setIsAdmin(getAccessTokenRole() === "admin")), []);

  const load = useCallback(async () => {
    try {
      const response = await apiFetch("/api/admin/scheduler/status", { method: "GET" });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, "Failed to load scheduler status."));
      }
      const data = await response.json();
      if (activeRef.current) {
        setStatus(data);
        setError("");
      }
    } catch (err) {
      if (activeRef.current) setError(err.message || "Failed to load scheduler status.");
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return undefined;
    }
    activeRef.current = true;
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      activeRef.current = false;
      clearInterval(id);
    };
  }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="page">
        <div className="status-card error">Admin access required.</div>
      </div>
    );
  }

  const jobs = status?.jobs || [];
  const logs = status?.logs || [];

  return (
    <div className="page">
      <section className="section">
        <div className="section-header">
          <h2>Scheduler</h2>
          <p>OpenF1 auto-fetch activity. Refreshes every 10&nbsp;seconds.</p>
        </div>

        <div className="detail-card" style={{ marginBottom: "1.5rem" }}>
          <strong>Next scheduled run:</strong>{" "}
          {status?.next_run_at ? (
            formatUtc(status.next_run_at)
          ) : (
            <span style={{ color: "var(--muted)" }}>
              none scheduled — the scheduler service may not be running
            </span>
          )}
        </div>

        {error ? <div className="status-card error">{error}</div> : null}
        {loading && !status ? <div className="status-card">Loading…</div> : null}

        <h3>Pending jobs</h3>
        {jobs.length ? (
          <TableWrapper>
            <DataTable>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Event / session</th>
                  <th>Next run</th>
                  <th>Attempt</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.job_id}>
                    <td>{job.kind}</td>
                    <td>{job.kind === "planner" ? "— (planner sweep)" : sessionLabel(job)}</td>
                    <td>{formatUtc(job.next_run_at)}</td>
                    <td>{job.attempt ? `#${job.attempt}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableWrapper>
        ) : (
          <div className="status-card">No pending jobs.</div>
        )}

        <h3 style={{ marginTop: "1.5rem" }}>Activity</h3>
        {logs.length ? (
          <TableWrapper>
            <DataTable>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Status</th>
                  <th>Action</th>
                  <th>Event / session</th>
                  <th>Rows</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatUtc(log.created_at)}</td>
                    <td><LevelBadge level={log.level} /></td>
                    <td>{log.action}</td>
                    <td>{sessionLabel(log)}</td>
                    <td>{log.openf1_rows ?? "—"}</td>
                    <td>{log.message}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </TableWrapper>
        ) : (
          <div className="status-card">No activity recorded yet.</div>
        )}
      </section>
    </div>
  );
}
