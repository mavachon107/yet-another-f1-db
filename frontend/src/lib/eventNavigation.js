export function resolvePrevNextEventIds(events = [], currentEventId) {
  if (!events.length || !currentEventId) {
    return { prevId: null, nextId: null };
  }
  const parsedCurrent = Number(currentEventId);
  const sorted = [...events].sort((a, b) => {
    const dateA = a?.event_date ? new Date(a.event_date).getTime() : null;
    const dateB = b?.event_date ? new Date(b.event_date).getTime() : null;
    if (dateA !== null && dateB !== null && dateA !== dateB) {
      return dateA - dateB;
    }
    if (dateA !== null && dateB === null) return -1;
    if (dateA === null && dateB !== null) return 1;
    const roundA = a?.round ?? 0;
    const roundB = b?.round ?? 0;
    if (roundA !== roundB) return roundA - roundB;
    return (a?.id ?? 0) - (b?.id ?? 0);
  });
  const index = sorted.findIndex((event) => event.id === parsedCurrent);
  if (index === -1) return { prevId: null, nextId: null };
  return {
    prevId: index > 0 ? sorted[index - 1].id : null,
    nextId: index < sorted.length - 1 ? sorted[index + 1].id : null,
  };
}

// Same ordering as above, but returns the full prev/next event objects so the
// caller can build season-scoped slug links (event objects carry season_year + slug).
export function resolvePrevNextEvents(events = [], currentEventId) {
  if (!events.length || !currentEventId) {
    return { prevEvent: null, nextEvent: null };
  }
  const parsedCurrent = Number(currentEventId);
  const sorted = [...events].sort((a, b) => {
    const dateA = a?.event_date ? new Date(a.event_date).getTime() : null;
    const dateB = b?.event_date ? new Date(b.event_date).getTime() : null;
    if (dateA !== null && dateB !== null && dateA !== dateB) {
      return dateA - dateB;
    }
    if (dateA !== null && dateB === null) return -1;
    if (dateA === null && dateB !== null) return 1;
    const roundA = a?.round ?? 0;
    const roundB = b?.round ?? 0;
    if (roundA !== roundB) return roundA - roundB;
    return (a?.id ?? 0) - (b?.id ?? 0);
  });
  const index = sorted.findIndex((event) => event.id === parsedCurrent);
  if (index === -1) return { prevEvent: null, nextEvent: null };
  return {
    prevEvent: index > 0 ? sorted[index - 1] : null,
    nextEvent: index < sorted.length - 1 ? sorted[index + 1] : null,
  };
}

// Build the season-scoped root path for an event object (or null if missing data).
export function eventBasePath(event) {
  if (!event || event.season_year == null || !event.slug) return null;
  return `/seasons/${event.season_year}/events/${event.slug}`;
}
