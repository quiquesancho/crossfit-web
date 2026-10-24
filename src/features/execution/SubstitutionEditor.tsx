import { useEffect, useState } from "react";

import { fetchCatalogEntries, fetchMovements, type CatalogEntry, type Movement } from "../catalog/api";
import type { Substitution } from "./types";
import { createUuidV7 } from "./uuid";

type CatalogState =
  | { status: "loading" }
  | { status: "ready"; movements: Movement[]; reasons: CatalogEntry[] }
  | { status: "error" };

export function SubstitutionEditor({
  prescriptionId,
  prescriptionName,
  substitution,
  onSave,
  onClose,
}: {
  prescriptionId: string;
  prescriptionName: string;
  substitution: Substitution | undefined;
  onSave: (substitution: Substitution | undefined) => void;
  onClose: () => void;
}) {
  const [catalogs, setCatalogs] = useState<CatalogState>({ status: "loading" });
  const [movementId, setMovementId] = useState(substitution?.actualMovementId ?? "");
  const [reasonId, setReasonId] = useState(substitution?.reasonId ?? "");
  const [note, setNote] = useState(substitution?.note ?? "");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchMovements(controller.signal),
      fetchCatalogEntries("substitution-reason", controller.signal),
    ])
      .then(([movements, reasons]) => {
        if (controller.signal.aborted) return;
        setCatalogs({ status: "ready", movements: movements.movements, reasons: reasons.entries });
      })
      .catch(() => {
        if (!controller.signal.aborted) setCatalogs({ status: "error" });
      });
    return () => controller.abort();
  }, []);

  function save() {
    if (!movementId) return;
    onSave({
      id: substitution?.id ?? createUuidV7(),
      plannedPrescriptionId: prescriptionId,
      actualMovementId: movementId,
      ...(reasonId ? { reasonId } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    });
    onClose();
  }

  return (
    <div className="substitution-editor">
      <p className="substitution-heading">Sustituir {prescriptionName}</p>
      {catalogs.status === "loading" ? (
        <p className="feeling-hint">Cargando movimientos y motivos…</p>
      ) : null}
      {catalogs.status === "error" ? (
        <p className="feeling-hint" role="alert">
          No se pudieron cargar los movimientos. Revisa la conexión e inténtalo de nuevo.
        </p>
      ) : null}
      {catalogs.status === "ready" ? (
        <div className="substitution-fields">
          <label>
            <span>Movimiento realizado</span>
            <select
              aria-label={`Movimiento realizado en ${prescriptionName}`}
              value={movementId}
              onChange={(event) => setMovementId(event.target.value)}
            >
              <option value="">Selecciona un movimiento</option>
              {catalogs.movements.map((movement) => (
                <option key={movement.id} value={movement.id}>
                  {movement.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Motivo</span>
            <select
              aria-label={`Motivo de la sustitución en ${prescriptionName}`}
              value={reasonId}
              onChange={(event) => setReasonId(event.target.value)}
            >
              <option value="">Sin especificar</option>
              {catalogs.reasons.map((reason) => (
                <option key={reason.id} value={reason.id}>
                  {reason.description}
                </option>
              ))}
            </select>
          </label>
          <label className="substitution-note">
            <span>Nota</span>
            <textarea
              rows={2}
              aria-label={`Nota de la sustitución en ${prescriptionName}`}
              value={note}
              placeholder="Material, molestia o cualquier detalle de la adaptación…"
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      <div className="substitution-actions">
        <button
          type="button"
          className="primary-button"
          disabled={catalogs.status !== "ready" || !movementId}
          onClick={save}
        >
          Guardar sustitución
        </button>
        {substitution ? (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onSave(undefined);
              onClose();
            }}
          >
            Quitar sustitución
          </button>
        ) : null}
        <button type="button" className="link-button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
