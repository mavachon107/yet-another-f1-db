/**
 * Convert a GMT/UTC ISO string to a datetime-local input value
 * displayed in the given IANA timezone.
 */
export function gmtToLocal(isoString, timezone) {
  if (!isoString || !timezone) return "";
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return "";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (type) => parts.find((p) => p.type === type)?.value || "00";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    return "";
  }
}

/**
 * Convert a datetime-local input value (interpreted as circuit local time)
 * to a GMT/UTC ISO string.
 */
export function localToGmt(datetimeLocalValue, timezone) {
  if (!datetimeLocalValue || !timezone) return null;
  try {
    const [datePart, timePart] = datetimeLocalValue.split("T");
    const [y, m, d] = datePart.split("-").map(Number);
    const [h, min] = timePart.split(":").map(Number);
    // Start with a guess: the same wall-clock numbers interpreted as UTC.
    const guess = Date.UTC(y, m - 1, d, h, min);
    // Ask what that UTC instant looks like when rendered in the target
    // timezone. We read the parts directly (browser-timezone independent).
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const get = (type) => Number(parts.find((p) => p.type === type).value);
    let tzH = get("hour");
    if (tzH === 24) tzH = 0;
    const tzAsUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      tzH,
      get("minute"),
      get("second")
    );
    // tzAsUtc - guess is the timezone offset at that wall-clock.
    const offset = tzAsUtc - guess;
    return new Date(guess - offset).toISOString();
  } catch {
    return null;
  }
}
