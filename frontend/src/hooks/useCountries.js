import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api.js";

export default function useCountries() {
  const [countries, setCountries] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadCountries() {
      try {
        const data = await apiGet("/countries?limit=500");
        if (isActive) {
          setCountries(Array.isArray(data) ? data : []);
          setError("");
        }
      } catch (err) {
        if (isActive) {
          setCountries([]);
          setError(err.message || "Failed to load countries.");
        }
      }
    }

    loadCountries();
    return () => {
      isActive = false;
    };
  }, []);

  const countryByCode = useMemo(() => {
    const map = new Map();
    countries.forEach((country) => {
      if (country?.code) {
        map.set(country.code.toLowerCase(), country);
      }
    });
    return map;
  }, [countries]);

  const countryByName = useMemo(() => {
    const map = new Map();
    countries.forEach((country) => {
      if (country?.name) {
        map.set(country.name.toLowerCase(), country);
      }
    });
    return map;
  }, [countries]);

  return { countries, countryByCode, countryByName, error };
}
