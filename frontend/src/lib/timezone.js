/**
 * Trim a stored datetime string to the `YYYY-MM-DDTHH:mm` shape a
 * datetime-local input expects (no timezone conversion).
 */
export function toDateTimeInput(value) {
  if (!value) return "";
  const text = String(value).replace(" ", "T");
  return text.length >= 16 ? text.slice(0, 16) : text;
}

/**
 * Expand a datetime-local input value to a full `YYYY-MM-DDTHH:mm:ss` string
 * for the API (no timezone conversion). Returns null when empty.
 */
export function fromDateTimeInput(value) {
  if (!value) return null;
  const text = String(value).trim();
  if (!text) return null;
  return text.length === 16 ? `${text}:00` : text;
}

/**
 * Convert a GMT/UTC ISO string to a datetime-local input value
 * displayed in the given IANA timezone.
 */
export function gmtToLocal(isoString, timezone) {
  if (!isoString || !timezone) return "";
  try {
    // The stored value is a naive GMT/UTC wall-clock string (no `Z`/offset).
    // `new Date(str)` would parse a designator-less date-time as *browser-local*
    // time, skewing the result by the viewer's offset — so pin it to UTC.
    const text = String(isoString).trim();
    const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(text);
    const d = new Date(hasTz ? text : `${text.replace(" ", "T")}Z`);
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
