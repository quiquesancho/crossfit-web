import { useEffect, useState } from "react";

import { fetchCatalogEntries, fetchMovements, type CatalogEntry, type Movement } from "./api";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; entries: CatalogEntry[]; movements: Movement[] };

export function CatalogScreen() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    Promise.all([
      fetchCatalogEntries("block-type", controller.signal),
      fetchMovements(controller.signal),
    ])
      .then(([catalog, movements]) =>
        setState({ status: "ready", entries: catalog.entries, movements: movements.movements }),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : "Unknown error" });
      });

    return () => controller.abort();
  }, []);

  if (state.status === "loading") return <p>Cargando…</p>;

  if (state.status === "error") {
    return (
      <p role="alert">
        No se pudo cargar el catálogo: {state.message}
      </p>
    );
  }

  return (
    <section>
      <h2>Tipos de bloque</h2>
      <ul>
        {state.entries.map((entry) => (
          <li key={entry.id}>
            {entry.description} <small>({entry.code})</small>
          </li>
        ))}
      </ul>

      <h2>Movimientos</h2>
      <ul>
        {state.movements.map((movement) => (
          <li key={movement.id}>
            {movement.name} <small>({movement.familyCode})</small>
          </li>
        ))}
      </ul>
    </section>
  );
}
