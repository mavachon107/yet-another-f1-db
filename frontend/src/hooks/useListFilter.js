import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LIST_PAGE_SIZE } from "../lib/constants.js";

export default function useListFilter() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filterInput, setFilterInput] = useState(searchParams.get("q") || "");

  const pageIndex = Math.max(
    Number.parseInt(searchParams.get("page") || "0", 10) || 0,
    0
  );
  const letter = searchParams.get("letter") || "A";
  const filterQuery = (searchParams.get("q") || "").trim();

  useEffect(() => {
    setFilterInput(searchParams.get("q") || "");
  }, [searchParams]);

  const updateParams = (nextParams) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(nextParams).forEach(([key, value]) => {
      if (value === null || value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, String(value));
      }
    });
    setSearchParams(params);
  };

  const applySearch = () => {
    const trimmed = filterInput.trim();
    updateParams({
      q: trimmed || null,
      letter: trimmed ? null : letter,
      page: 0,
    });
  };

  return {
    filterInput,
    setFilterInput,
    filterQuery,
    letter,
    pageIndex,
    updateParams,
    applySearch,
    PAGE_SIZE: LIST_PAGE_SIZE,
  };
}
