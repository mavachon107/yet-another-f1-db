import React from "react";
import SeoHead from "../components/SeoHead.jsx";

export default function AboutPage() {
  return (
    <div className="page">
      <SeoHead
        title="About"
        description="Straight Line F1 is a research-focused archive of Formula 1 seasons, drivers, constructors, circuits and results from 1950 to today."
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">StraightLine</p>
          <h1>About</h1>
          <p className="hero-subtitle">
            Straight Line F1 Stats Data Hub is a research-focused interface for exploring Formula 1 seasons, drivers, constructors, circuits, and event results and statistics through data oriented tables and insights. 
            In addition, it offers a set of public APIs as well as a MCP connector to Claude Desktop.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="detail-card">
          <h2>Missions</h2>
          <ul>
            <li>Keep historical Formula 1 data accessible, navigable, and auditable for enthusiasts, analysts, and developers.</li>
            <li>Provide accessible data beyond what is actually availabe in public APIs and databases.</li>
          </ul>
        </div>
        <div className="detail-card">
          <h2>Data</h2>
          <ul>
            <li>All FIA Formula 1 championships data from 1950 to now. This data is common and available at many locations on the web.</li>
            <li>All Non-championship events from 1950 to 1983 (last allowed non-championship events) (coming soon)</li>
            <li>All race events before 1950 (coming soon)</li>
            <li>Session time and weather data.</li>
            <li>point systems and season regulation data.</li>
            <li>Integration with openF1 data when availabe.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
