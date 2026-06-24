import React from "react";
import SeoHead from "../components/SeoHead.jsx";

export default function DisclaimerPage() {
  return (
    <div className="page">
      <SeoHead
        title="Disclaimer"
        description="Legal disclaimer for the Straight Line F1 historical data archive."
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Legal</p>
          <h1>Disclaimer</h1>
          <p className="hero-subtitle">
            Formula 1, F1, and related marks are trademarks of Formula One
            Licensing B.V. This project is independent and not affiliated with,
            endorsed by, or sponsored by Formula One Group.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="detail-card">
          <h2>Use of Information</h2>
          <p>
            Content is provided for informational and historical reference
            purposes only and may contain omissions or inaccuracies.
          </p>
        </div>
      </section>
    </div>
  );
}
