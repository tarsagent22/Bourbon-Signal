import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RadarBottleOption } from "../api/types";
import seed from "../cellar/bottle-catalog-seed.json";
import { createBottleSearchIndex, rankBottleCatalog } from "../cellar/bottle-search";
import { useMobileApi } from "./useMobileApi";

const searchIndexes = new WeakMap<RadarBottleOption[], ReturnType<typeof createBottleSearchIndex>>();
function sharedSearchIndex(catalog: RadarBottleOption[]) {
  let index = searchIndexes.get(catalog);
  if (!index) { index = createBottleSearchIndex(catalog); searchIndexes.set(catalog, index); }
  return index;
}

// Every bottle picker shares the same catalog, offline seed, ranking and API cache.
export function useBottleCatalog() {
  const api = useMobileApi();
  const [catalog, setCatalog] = useState<RadarBottleOption[]>(seed as RadarBottleOption[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const load = useCallback(async (fresh = false) => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const bottles = await api.listBottleCatalog({ fresh });
      if (request === sequence.current) { setCatalog(bottles); setError(""); }
    } catch {
      if (request === sequence.current) setError("The latest catalog couldn’t load. You can still search saved bottle names.");
    } finally { if (request === sequence.current) setLoading(false); }
  }, [api]);
  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);
  const index = useMemo(() => sharedSearchIndex(catalog), [catalog]);
  const search = useCallback((query: string, limit = 12) => rankBottleCatalog(index, query, limit), [index]);
  return { catalog, search, loading, error, retry: () => void load(true) };
}
