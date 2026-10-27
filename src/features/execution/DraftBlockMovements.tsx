import { useState } from "react";

import type { Movement } from "../catalog/api";
import { movementIdsForAttempts } from "./attempts";
import { SetAttemptsEditor } from "./SetAttemptsEditor";
import type { DraftBlock, SetAttempt } from "./types";

export function DraftBlockMovements({
  block,
  movementNames,
  movements,
  movementsStatus,
  syncStatus,
  showDuration = false,
  onAdd,
  onRemove,
  onAttemptsChange,
}: {
  block: DraftBlock;
  movementNames: Record<string, string>;
  movements: Movement[];
  movementsStatus: "loading" | "ready" | "error";
  syncStatus: "pending" | "synchronized" | "error";
  showDuration?: boolean;
  onAdd: (movementId: string) => void;
  onRemove: (movementId: string) => void;
  onAttemptsChange: (attempts: SetAttempt[] | undefined) => void;
}) {
  const [selectedMovementId, setSelectedMovementId] = useState("");
  const [confirmingMovementId, setConfirmingMovementId] = useState<string | null>(null);

  if (block.withoutMetrics) {
    return (
      <p className="draft-editor-hint">
        Bloque sin métricas: las series no se guardarán al sincronizar.
      </p>
    );
  }

  const movementIds = [...(block.movements ?? [])];
  for (const movementId of movementIdsForAttempts(block.attempts)) {
    if (!movementIds.includes(movementId)) movementIds.push(movementId);
  }
  const availableMovements = movements.filter(
    (movement) => !movementIds.includes(movement.id),
  );

  function addSelectedMovement() {
    if (!selectedMovementId) return;
    onAdd(selectedMovementId);
    setSelectedMovementId("");
  }

  function removeMovement(movementId: string) {
    onRemove(movementId);
    setConfirmingMovementId(null);
  }

  return (
    <div className="draft-block-movements">
      <div className="draft-block-movements-heading">
        <span>Movimientos</span>
        <span>{movementIds.length}</span>
      </div>

      {movementIds.length === 0 ? (
        <p className="draft-editor-hint">
          Añade un movimiento para registrar sus series.
        </p>
      ) : (
        <ul className="draft-movement-list">
          {movementIds.map((movementId) => {
            const name = movementNames[movementId] ?? "Movimiento";
            return (
              <li className="draft-movement" key={movementId}>
                <div className="draft-movement-heading">
                  <strong className="draft-movement-name">{name}</strong>
                  <span className="draft-movement-actions">
                    {confirmingMovementId === movementId ? (
                      <>
                        <span className="draft-movement-confirm">¿Quitar?</span>
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Confirmar quitar ${name} del bloque ${block.position}`}
                          onClick={() => removeMovement(movementId)}
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          className="link-button"
                          onClick={() => setConfirmingMovementId(null)}
                        >
                          Cancelar
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`Quitar ${name} del bloque ${block.position}`}
                        onClick={() => setConfirmingMovementId(movementId)}
                      >
                        Quitar
                      </button>
                    )}
                  </span>
                </div>
                <SetAttemptsEditor
                  movementId={movementId}
                  prescriptionName={name}
                  actualMovementName={name}
                  unit="kg"
                  showDuration={showDuration}
                  allAttempts={block.attempts}
                  syncStatus={syncStatus}
                  onChange={onAttemptsChange}
                />
              </li>
            );
          })}
        </ul>
      )}

      {movementsStatus === "ready" ? (
        availableMovements.length > 0 ? (
          <div className="draft-add-movement">
            <label>
              <span>Movimiento</span>
              <select
                aria-label={`Movimiento para el bloque ${block.position}`}
                value={selectedMovementId}
                onChange={(event) => setSelectedMovementId(event.target.value)}
              >
                <option value="">Selecciona un movimiento</option>
                {availableMovements.map((movement) => (
                  <option key={movement.id} value={movement.id}>
                    {movement.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              aria-label={`Añadir movimiento al bloque ${block.position}`}
              disabled={!selectedMovementId}
              onClick={addSelectedMovement}
            >
              Añadir movimiento
            </button>
          </div>
        ) : (
          <p className="draft-editor-hint">
            Todos los movimientos del catálogo ya están en este bloque.
          </p>
        )
      ) : movementsStatus === "error" ? (
        <p className="draft-editor-hint">
          No se pudo cargar el catálogo de movimientos. Puedes seguir editando el borrador
          sin conexión.
        </p>
      ) : (
        <p className="draft-editor-hint">Cargando movimientos…</p>
      )}
    </div>
  );
}
