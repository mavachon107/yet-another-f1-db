import { useEffect, useState } from "react";
import { Outlet, useParams } from "react-router-dom";
import { apiGet } from "../lib/api.js";

// Warm the lazy chunks for the sibling event tabs. Each tab is a separate
// lazy()-loaded chunk; without this, the first click on a not-yet-downloaded
// tab suspends and flashes the top-level Suspense fallback (looks like a full
// page reload). Preloading on mount makes tab switches resolve synchronously.
const EVENT_TAB_IMPORTS = [
  () => import("./PracticeDetails.jsx"),
  () => import("./EventSessions.jsx"),
  () => import("./FastestLapsDetail.jsx"),
  () => import("./StandingDetail.jsx"),
  () => import("./EventReferences.jsx"),
  () => import("./EventEntryList.jsx"),
  () => import("./EventEntryCompare.jsx"),
  () => import("./QualifyingDetails.jsx"),
  () => import("./RaceResultDetails.jsx"),
  () => import("./DriverOfTheDayDetail.jsx"),
  () => import("./SpeedTrapDetail.jsx"),
];

/**
 * Resolves the season-scoped event slug (`/seasons/:seasonYear/events/:eventSlug`)
 * to a numeric event id and shares it with the nested event pages via Outlet
 * context, so each page can keep loading its data by id. Rendering of the child
 * page is gated until the id is known.
 */
export default function EventLayout() {
  const { seasonYear, eventSlug } = useParams();
  const [eventId, setEventId] = useState(null);
  const [error, setError] = useState("");

  // Preload sibling tab chunks once so switching tabs never hits the Suspense
  // fallback. Fire-and-forget; failures are harmless (the chunk loads on click).
  useEffect(() => {
    EVENT_TAB_IMPORTS.forEach((load) => {
      load().catch(() => {});
    });
  }, []);

  useEffect(() => {
    let active = true;
    setEventId(null);
    setError("");
    apiGet(
      `/events/by-slug?season_year=${encodeURIComponent(seasonYear)}&slug=${encodeURIComponent(eventSlug)}`
    )
      .then((event) => {
        if (active) setEventId(event?.id ?? null);
      })
      .catch((err) => {
        if (active) setError(err.message || "Event not found.");
      });
    return () => {
      active = false;
    };
  }, [seasonYear, eventSlug]);

  if (error) {
    return (
      <main className="container">
        <p className="error-text">{error}</p>
      </main>
    );
  }

  if (eventId == null) {
    return (
      <main className="container">
        <p>Loading event…</p>
      </main>
    );
  }

  return <Outlet context={{ eventId, seasonYear, eventSlug }} />;
}
