import React from "react";
import SeoHead from "../components/SeoHead.jsx";

const API_DOMAIN = "api.f1statsdatahub.com";
const MCP_URL = "https://mcp.f1statsdatahub.com/mcp";

export default function DocsPage() {
  return (
    <div className="page">
      <SeoHead
        title="API Documentation"
        description="Public REST API and MCP connector for Formula 1 historical data on Straight Line F1."
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Developers</p>
          <h1>Documentation</h1>
          <p className="hero-subtitle">
            Connect to the Straight Line F1 public API or integrate the MCP
            server with Claude Desktop.
          </p>
        </div>
      </section>

      {/* ---- Public API ---- */}
      <section className="section">
        <div className="detail-card">
          <h2>Public REST API</h2>
          <p>
            The Straight Line F1 API provides read-only access to Formula 1
            historical data spanning 1950 to the present. No authentication is
            required for public endpoints.
          </p>

          <h3>Base URL</h3>
          <pre className="code-block">https://{API_DOMAIN}</pre>

          <h3>Versioned endpoints</h3>
          <p>
            All public endpoints are available under the <code>/v1/</code>{" "}
            prefix. For convenience, bare paths (e.g. <code>/drivers</code>)
            are aliased to their <code>/v1/</code> equivalents.
          </p>

          <h3>Example requests</h3>
          <pre className="code-block">
{`# List all seasons
curl https://${API_DOMAIN}/v1/seasons

# Get a specific driver
curl https://${API_DOMAIN}/v1/drivers/1

# Get race results for an event
curl https://${API_DOMAIN}/v1/session-results?event_id=100&session_type=Race`}
          </pre>

          <h3>Available resources</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Resource</th>
                  <th>Endpoint</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Seasons", "/v1/seasons"],
                  ["Events", "/v1/events"],
                  ["Drivers", "/v1/drivers"],
                  ["Teams", "/v1/teams"],
                  ["Constructors", "/v1/constructors"],
                  ["Circuits", "/v1/circuits"],
                  ["Cars", "/v1/cars"],
                  ["Engines", "/v1/engines"],
                  ["Session Results", "/v1/session-results"],
                  ["Standings", "/v1/standings"],
                  ["Statistics", "/v1/stats"],
                ].map(([name, path]) => (
                  <tr key={path}>
                    <td>{name}</td>
                    <td>
                      <code>{path}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3>Interactive documentation</h3>
          <p>
            Explore all endpoints, parameters, and response schemas in the{" "}
            <a
              href={`https://${API_DOMAIN}/docs`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Swagger UI
            </a>
            .
          </p>
        </div>
      </section>

      {/* ---- MCP Server ---- */}
      <section className="section">
        <div className="detail-card">
          <h2>MCP Server (Claude Desktop)</h2>
          <p>
            The Straight Line F1 MCP server lets you query the full F1 database
            directly from Claude Desktop using natural language.
          </p>

          <h3>Prerequisites</h3>
          <ul>
            <li>Claude Desktop installed (latest version)</li>
            <li>
              A Claude <strong>Pro</strong>, <strong>Team</strong>, or{" "}
              <strong>Enterprise</strong> plan
            </li>
          </ul>

          <h3>Step 1 &mdash; Open Settings</h3>
          <p>
            In Claude Desktop, click your profile icon and go to{" "}
            <strong>Settings</strong>.
          </p>

          <h3>Step 2 &mdash; Go to the Integrations tab</h3>
          <p>
            In the left sidebar, click <strong>Integrations</strong>. Then click{" "}
            <strong>"+ Add custom integration"</strong>.
          </p>

          <h3>Step 3 &mdash; Enter the server details</h3>
          <p>Fill in the form as follows:</p>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr>
                  <td>
                    <strong>Name</strong>
                  </td>
                  <td>F1 Stats Datahub</td>
                </tr>
                <tr>
                  <td>
                    <strong>URL</strong>
                  </td>
                  <td>
                    <code>{MCP_URL}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            Click <strong>Add</strong> to save.
          </p>

          <h3>Step 4 &mdash; Verify the connection</h3>
          <p>
            The F1 Stats integration should now appear in your integrations list
            with a green connected indicator. Click on it to see the list of
            available tools (driver stats, race results, standings, and more).
          </p>

          <h3>Step 5 &mdash; Start a conversation</h3>
          <p>Start a new chat and try prompts like:</p>
          <ul>
            <li>"Who has the most F1 wins of all time?"</li>
            <li>"Show me Max Verstappen's career stats."</li>
            <li>"What are the 2024 final championship standings?"</li>
            <li>"Get all race results from the 2023 Monaco Grand Prix."</li>
          </ul>

          <h3>Troubleshooting</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Problem</th>
                  <th>Fix</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>"Add custom integration" option not visible</td>
                  <td>
                    This feature requires a paid plan (Pro, Team, or Enterprise)
                  </td>
                </tr>
                <tr>
                  <td>Integration shows as disconnected</td>
                  <td>
                    Double-check the URL for typos and try removing and
                    re-adding it
                  </td>
                </tr>
                <tr>
                  <td>Tools not appearing in chat</td>
                  <td>
                    Start a <strong>new</strong> conversation after adding the
                    integration
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
