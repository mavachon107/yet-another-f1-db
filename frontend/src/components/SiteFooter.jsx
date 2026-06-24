import React from "react";
import { Link } from "react-router-dom";
import { apiUrl } from "../lib/api.js";

const GITHUB_URL = "https://github.com/mavachon107/f1-datahub";

const FOOTER_SECTIONS = [
  {
    title: "F1 Archive",
    links: [
      { label: "About", to: "/about" },
      { label: "Methodology / Data Sources", to: "/methodology" },
      { label: "Changelog", to: "/changelog" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "User Documentation", to: "/docs" },
      { label: "Public API Swagger", href: apiUrl("/docs") },
      { label: "GitHub", href: GITHUB_URL },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Disclaimer", to: "/legal/disclaimer" },
      { label: "Privacy", to: "/legal/privacy" },
    ],
  },
];

function FooterLink({ item }) {
  if (item.href) {
    return (
      <a
        className="site-footer-link"
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {item.label}
      </a>
    );
  }
  return (
    <Link className="site-footer-link" to={item.to}>
      {item.label}
    </Link>
  );
}

export default function SiteFooter({ buildVersion }) {
  return (
    <footer className="site-footer">
      <div className="site-footer-grid">
        {FOOTER_SECTIONS.map((section) => (
          <div key={section.title} className="site-footer-column">
            <h2 className="site-footer-heading">{section.title}</h2>
            <ul className="site-footer-links">
              {section.links.map((item) => (
                <li key={item.label}>
                  <FooterLink item={item} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="site-footer-meta">
        <div className="muted">
          Formula 1 trademarks are owned by Formula One Licensing B.V.
        </div>
        <div className="muted">Build: {buildVersion}</div>
      </div>
    </footer>
  );
}
