import React from "react";
import SeoHead from "../components/SeoHead.jsx";

const VERSION = import.meta.env.VITE_APP_VERSION || "dev";

export default function ChangelogPage() {
  return (
    <div className="page">
      <SeoHead
        title="Changelog"
        description="Recent updates, data additions, and fixes to the Straight Line F1 archive."
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">StraightLine</p>
          <h1>Changelog</h1>
          <p className="hero-subtitle">
            Product and data-model updates are tracked by release version.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="detail-card">
          <h2>Current Build</h2>
          <p>{VERSION}</p>
        </div>
      </section>
    </div>
  );
}
