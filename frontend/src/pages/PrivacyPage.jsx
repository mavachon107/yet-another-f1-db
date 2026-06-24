import React from "react";
import SeoHead from "../components/SeoHead.jsx";

export default function PrivacyPage() {
  return (
    <div className="page">
      <SeoHead
        title="Privacy Policy"
        description="Privacy policy for Straight Line F1."
      />
      <section className="hero compact">
        <div className="hero-content">
          <p className="hero-eyebrow">Legal</p>
          <h1>Privacy</h1>
          <p className="hero-subtitle">
            This interface stores only the minimum required account/session data
            for authentication and user preferences.
          </p>
        </div>
      </section>
      <section className="section">
        <div className="detail-card">
          <h2>Data Handling</h2>
          <p>
            Authentication tokens and profile preferences are processed to
            provide secure access and personalized settings.
          </p>
        </div>
      </section>
    </div>
  );
}
