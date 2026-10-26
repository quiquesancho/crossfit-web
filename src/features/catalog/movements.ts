import { useEffect, useState } from "react";

import { fetchMovements, type Movement } from "./api";

let cached: Movement[] | null = null;
let pending: Promise<Movement[]> | null = null;

function loadMovements(): Promise<Movement[]> {
  if (cached) return Promise.resolve(cached);
  if (!pending) {
    pending = fetchMovements()
      .then((response) => {
        cached = response.movements;
        pending = null;
        return cached;
      })
      .catch((error: unknown) => {
        pending = null;
        throw error;
      });
  }
  return pending;
}

/**
 * Resolves the catalogue names of the movements used in a block, so a
 * substitution can be shown with the movement that was actually performed.
 * The catalogue is cached for the lifetime of the session.
 */
export function useMovementNames(ids: string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = [...new Set(ids)].sort((left, right) => left.localeCompare(right)).join(",");

  useEffect(() => {
    if (!key) return;
    let active = true;
    loadMovements()
      .then((movements) => {
        if (!active) return;
        const next: Record<string, string> = {};
        for (const movement of movements) next[movement.id] = movement.name;
        setNames(next);
      })
      .catch(() => {
        // The substitution stays visible without a name; the editor retries on demand.
      });
    return () => {
      active = false;
    };
  }, [key]);

  return names;
}
