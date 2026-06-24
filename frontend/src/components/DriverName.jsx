import React from "react";

export default function DriverName({
  driver,
  countryByCode,
  fallback = "—",
  className = "",
}) {
  if (!driver) {
    return <span className={className}>{fallback}</span>;
  }
  const fullName = `${driver.first_name || ""} ${driver.last_name || ""}`.trim();
  const label = fullName || driver.short_name || fallback;
  const country = driver.nationality
    ? countryByCode?.get(driver.nationality.toLowerCase())
    : null;
  const alpha2 = country?.alpha2_code
    ? country.alpha2_code.toLowerCase()
    : null;

  return (
    <span className={`table-driver ${className}`.trim()}>
      <span>{label}</span>
    </span>
  );
}
