import React from "react";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";

const BRAND = "Straight Line F1";

// Build-time origin (e.g. https://f1statsdatahub.com). Falls back to the
// current origin in dev so canonical/og:url stay sensible without the env var.
const SITE_ORIGIN = (
  import.meta.env.VITE_SITE_ORIGIN ||
  (typeof window !== "undefined" ? window.location.origin : "")
).replace(/\/$/, "");

const DEFAULT_IMAGE =
  import.meta.env.VITE_OG_IMAGE || `${SITE_ORIGIN}/og-image.png`;

const absoluteUrl = (path) => {
  if (!path) return SITE_ORIGIN || undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
};

/**
 * Reusable document-head manager for per-route SEO.
 *
 * @param {string}  title         Page title (brand suffix appended unless noSuffix).
 * @param {string}  description   Meta description / og / twitter description.
 * @param {string}  canonicalPath Path for canonical + og:url (defaults to current pathname).
 * @param {string}  ogType        Open Graph type (default "website").
 * @param {string}  image         Absolute or root-relative OG image (defaults to site OG image).
 * @param {boolean} noSuffix      Skip the " | Straight Line F1" suffix.
 * @param {object|object[]} jsonLd Optional JSON-LD object(s) injected as a script tag.
 */
export default function SeoHead({
  title,
  description,
  canonicalPath,
  ogType = "website",
  image,
  noSuffix = false,
  jsonLd,
}) {
  const { pathname } = useLocation();
  const fullTitle = title
    ? noSuffix
      ? title
      : `${title} | ${BRAND}`
    : `${BRAND} — Formula 1 Historical Data & Statistics`;
  const canonical = absoluteUrl(canonicalPath || pathname);
  const ogImage = absoluteUrl(image || DEFAULT_IMAGE);
  const jsonLdBlocks = jsonLd
    ? Array.isArray(jsonLd)
      ? jsonLd
      : [jsonLd]
    : [];

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      {description ? <meta name="description" content={description} /> : null}
      {canonical ? <link rel="canonical" href={canonical} /> : null}

      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content={BRAND} />
      <meta property="og:title" content={fullTitle} />
      {description ? (
        <meta property="og:description" content={description} />
      ) : null}
      {canonical ? <meta property="og:url" content={canonical} /> : null}
      {ogImage ? <meta property="og:image" content={ogImage} /> : null}

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description ? (
        <meta name="twitter:description" content={description} />
      ) : null}
      {ogImage ? <meta name="twitter:image" content={ogImage} /> : null}

      {jsonLdBlocks.map((block, i) => (
        <script key={i} type="application/ld+json">
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}

export { SITE_ORIGIN, BRAND, absoluteUrl };
