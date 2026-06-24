import React from "react";
import SeoHead from "../components/SeoHead.jsx";

export default function MethodologyPage() {
  return (
    <div className="page">
      <SeoHead
        title="Methodology"
        description="How Straight Line F1 sources, structures, and verifies its Formula 1 historical data."
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">StraightLine</p>
          <h1>Methodology / Data Sources</h1>
          <p className="hero-subtitle">
            Data is curated from historical race records and normalized into a
            consistent schema for events, entries, sessions, and standings.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="detail-card">
          <h2>Notes</h2>
          <p>
            Historical datasets can contain inconsistencies and errors.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="detail-card">
          <h2>Websites</h2>
          <ul>
            <li><a href="https://www.formula1.com/" target="_blank" rel="noopener noreferrer">formula1.com</a> &mdash; Official Formula 1 website</li>
            <li><a href="https://www.statsf1.com/" target="_blank" rel="noopener noreferrer">statsf1.com</a> &mdash; Comprehensive F1 statistics</li>
            <li><a href="https://www.chicanef1.com/" target="_blank" rel="noopener noreferrer">chicanef1.com</a> &mdash; Historical race data</li>
            <li><a href="https://en.wikipedia.org/wiki/Formula_One" target="_blank" rel="noopener noreferrer">Wikipedia</a> &mdash; Formula One articles</li>
            <li><a href="https://motorsportstats.com/series/fia-formula-one-world-championship/summary/2026" target="_blank" rel="noopener noreferrer">motorsportstats.com</a> &mdash; Motorsport statistics</li>
            <li><a href="https://gpracingstats.com/grands-prix/brazil/" target="_blank" rel="noopener noreferrer">gpracingstats.com</a> &mdash; Grand Prix racing statistics</li>
            <li><a href="https://www.formula1points.com/" target="_blank" rel="noopener noreferrer">formula1points.com</a> &mdash; Points system analysis</li>
            <li><a href="https://www.f1stats.app/" target="_blank" rel="noopener noreferrer">f1stats.app</a></li>
            <li><a href="https://f1-analysis.com/" target="_blank" rel="noopener noreferrer">f1-analysis.com</a></li>
          </ul>
        </div>
      </section>
      <section className="section">
        <div className="detail-card">
          <h2>Databases and APIs</h2>
          <ul>
            <li><a href="https://github.com/theOehrly/Fast-F1" target="_blank" rel="noopener noreferrer">Fast-F1</a> &mdash; Python package for accessing F1 telemetry and timing data</li>
            <li><a href="https://github.com/jolpica/jolpica-f1" target="_blank" rel="noopener noreferrer">Jolpica F1</a> &mdash; Community-maintained F1 API</li>
            <li><a href="https://www.formula1db.com/" target="_blank" rel="noopener noreferrer">formula1db.com</a> &mdash; Formula 1 database</li>
            <li><a href="https://www.kaggle.com/datasets/rohanrao/formula-1-world-championship-1950-2020" target="_blank" rel="noopener noreferrer">Kaggle F1 Dataset</a> &mdash; F1 World Championship data (1950&ndash;2020)</li>
            <li><a href="https://openf1.org/" target="_blank" rel="noopener noreferrer">OpenF1</a> &mdash; Open-source F1 data API</li>
            <li><a href="https://api-sports.io/documentation/formula-1/v1" target="_blank" rel="noopener noreferrer">API-Sports F1</a> &mdash; Formula 1 REST API</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
