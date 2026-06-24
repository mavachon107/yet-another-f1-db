import { useMemo } from "react";
import { Link } from "react-router-dom";
import useCountries from "../hooks/useCountries.js";
import useAuthStatus from "../lib/useAuthStatus.js";
import { eventBasePath } from "../lib/eventNavigation.js";

const formatDate = (value) => {
  if (!value) return "TBD";
  const date = new Date(value);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const buildEventDateRange = (sessions) => {
  if (!sessions?.length) return null;
  const dates = sessions
    .flatMap((sessionItem) => [
      sessionItem.date_time_start,
      sessionItem.date_time_end,
    ])
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter((value) => !Number.isNaN(value));
  if (!dates.length) return null;
  const min = new Date(Math.min(...dates));
  const max = new Date(Math.max(...dates));
  const start = formatDate(min);
  const end = formatDate(max);
  return start === end ? start : `${start} — ${end}`;
};

export default function EventDetailHeader({
  event,
  sessions,
  seasonYear,
  eventSlug,
  children,
  panel,
  tabs,
  activeTab,
  prevEvent,
  nextEvent,
}) {
  const prevPath = eventBasePath(prevEvent);
  const nextPath = eventBasePath(nextEvent);
  const { countryByCode, countryByName } = useCountries();
  const canEdit = useAuthStatus();

  const circuitLabel = useMemo(() => {
    if (!event?.circuit) return "Circuit TBD";
    const { name, country } = event.circuit;
    const key = country ? String(country).toLowerCase() : "";
    const resolved =
      key && (countryByCode.get(key) || countryByName.get(key));
    const alpha2 = resolved?.alpha2_code
      ? resolved.alpha2_code.toLowerCase()
      : null;
    const countryLabel = resolved?.name || country;

    return (
      <span>
        <Link
          to={`/circuits/${event.circuit.slug}`}
          className="table-link"
        >
          <span className="table-driver">
            {alpha2 ? (
              <img
                className="flag-icon"
                src={`https://flagcdn.com/24x18/${alpha2}.png`}
                alt={countryLabel ? `${countryLabel} flag` : "Country flag"}
                loading="lazy"
              />
            ) : null}
            <span>{name}</span>
          </span>
        </Link>
        {countryLabel ? <span>{`, ${countryLabel}`}</span> : null}
      </span>
    );
  }, [event, countryByCode, countryByName]);

  const eventDateRange = useMemo(
    () => buildEventDateRange(sessions),
    [sessions]
  );
  const showSeasonLink = Boolean(seasonYear);
  const showActions =
    showSeasonLink || Boolean(children) || prevPath || nextPath;

  return (
    <section className="hero compact">
      <div className="hero-content event-hero-content">
        <div className="hero-eyebrow-row">
          <p className="hero-eyebrow">Event detail</p>
        </div>
        <div className="event-title-row">
          <h1>{event?.event_name || "Event sessions"}</h1>
          {canEdit && eventSlug && seasonYear && (
            <Link
              to={`/seasons/${seasonYear}/events/${eventSlug}/sessions?edit=1`}
              className="session-banner-edit"
              title="Edit event"
            >
              <span className="material-symbols-outlined">edit</span>
            </Link>
          )}
        </div>
        {event?.event_official_name ? (
          <p className="hero-subtitle event-official-name">
            {event.event_official_name}
          </p>
        ) : null}
        <p className="hero-subtitle">{circuitLabel}</p>
        {eventDateRange ? (
          <p className="hero-subtitle">{eventDateRange}</p>
        ) : null}
        {event?.updated_at ? (
          <p className="hero-subtitle">
            Updated{" "}
            {new Date(event.updated_at).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        ) : null}
        {showActions ? (
          <div className="hero-actions">
            {showSeasonLink ? (
              <Link to={`/seasons/${seasonYear}`} className="ghost link-pill">
                Back to season
              </Link>
            ) : null}
            {prevPath ? (
              <Link
                to={`${prevPath}/sessions`}
                className="ghost link-pill"
              >
                Previous event
              </Link>
            ) : null}
            {nextPath ? (
              <Link
                to={`${nextPath}/sessions`}
                className="ghost link-pill"
              >
                Next event
              </Link>
            ) : null}
            {children}
          </div>
        ) : null}
      </div>
      {panel}
    </section>
  );
}
