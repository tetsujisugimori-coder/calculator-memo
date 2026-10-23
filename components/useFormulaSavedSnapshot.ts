"use client";
import { useCallback, useEffect, useState } from "react";
import { loadData, STORAGE_KEY } from "../lib/storage";

function readSnapshot() { return { loaded: loadData(), fetchedAt: new Date().toISOString() }; }
/** A validated, read-only source shared by the library list and its detail. */
export function useFormulaSavedSnapshot() {
  const [snapshot, setSnapshot] = useState(readSnapshot);
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const observe = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) setStale(true); };
    window.addEventListener("storage", observe);
    return () => window.removeEventListener("storage", observe);
  }, []);
  const refresh = useCallback(() => { setSnapshot(readSnapshot()); setStale(false); }, []);
  return { ...snapshot, stale, refresh };
}
export type FormulaSavedSnapshot = ReturnType<typeof useFormulaSavedSnapshot>;
