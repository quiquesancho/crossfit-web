import { useRef, useState } from "react";

import type { CatalogEntry } from "../catalog/api";
import { useMovementNames, useMovements } from "../catalog/movements";
import { movementIdsForAttempts } from "./attempts";
import {
  addDraftBlock,
  deleteExecutionDraft,
  removeDraftBlock,
  saveExecutionDraft,
  synchronizeExecutionDraft,
  updateDraftBlock,
} from "./drafts";
import {
  BLOCK_STATUS_OPTIONS,
  SYNC_STATUS_LABELS,
  blockStatusLabel,
  effectiveBlockStatus,
  hasNoMetrics,
} from "./status";
import { FeelingFields } from "./FeelingFields";
import { DraftBlockMovements } from "./DraftBlockMovements";
import type { BlockExecutionStatus, DraftBlock, ExecutionDraft, Feeling } from "./types";

type SaveState = "saved" | "saving" | "error";

function movementIdsForBlock(block: DraftBlock): string[] {
  const ids = [...(block.movements ?? [])];
  for (const movementId of movementIdsForAttempts(block.attempts)) {
    if (!ids.includes(movementId)) ids.push(movementId);
  }
  return ids;
}

export function ExecutionDraftEditor({
  draft,
  blockTypes,
  onSaved,
  onClose,
  onDeleted,
}: {
  draft: ExecutionDraft;
  blockTypes: CatalogEntry[];
  onSaved: (draft: ExecutionDraft) => void;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [current, setCurrent] = useState(draft);
  const latestDraft = useRef(draft);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [blockTypeId, setBlockTypeId] = useState(blockTypes[0]?.id ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const movementNames = useMovementNames(
    current.snapshot.blocks.flatMap((block) => movementIdsForBlock(block)),
  );
  const { movements, status: movementsStatus } = useMovements();

  function commit(update: (current: ExecutionDraft) => ExecutionDraft) {
    const next = update(latestDraft.current);
    if (next === latestDraft.current) return;
    latestDraft.current = next;
    setCurrent(next);
    setSaveState("saving");
    saveExecutionDraft(next)
      .then((saved) => {
        onSaved(saved);
        setSaveState("saved");
      })
      .catch(() => setSaveState("error"));
  }

  function changeExecutionDate(executionDate: string) {
    if (!executionDate) return;
    commit((current) => ({
      ...current,
      executionDate,
      snapshot: { ...current.snapshot, executionDate },
    }));
  }

  function changeFeeling(feeling: Feeling | undefined) {
    commit((current) => {
      const snapshot = { ...current.snapshot };
      if (feeling) snapshot.feeling = feeling;
      else delete snapshot.feeling;
      return { ...current, snapshot };
    });
  }

  function addBlock() {
    const blockType = blockTypes.find((entry) => entry.id === blockTypeId) ?? blockTypes[0];
    if (!blockType) return;
    commit((current) => addDraftBlock(current, blockType.id, blockType.description));
  }

  function changeBlockStatus(blockId: string, status: BlockExecutionStatus) {
    commit((current) => {
      const block = current.snapshot.blocks.find((entry) => entry.id === blockId);
      if (!block) return current;
      const active = effectiveBlockStatus(block) === status;
      return updateDraftBlock(current, block.id, {
        status: active ? "draft" : status,
        withoutMetrics:
          status === "skipped" || active ? undefined : hasNoMetrics(block),
      });
    });
  }

  function addMovement(blockId: string, movementId: string) {
    if (!movementId) return;
    commit((current) => {
      const block = current.snapshot.blocks.find((entry) => entry.id === blockId);
      if (!block) return current;
      const movements = block.movements ?? [];
      if (movements.includes(movementId)) return current;
      return updateDraftBlock(current, blockId, {
        movements: [...movements, movementId],
      });
    });
  }

  function removeMovement(blockId: string, movementId: string) {
    commit((current) => {
      const block = current.snapshot.blocks.find((entry) => entry.id === blockId);
      if (!block) return current;
      const movements = (block.movements ?? []).filter((id) => id !== movementId);
      const attempts = (block.attempts ?? []).filter(
        (attempt) => attempt.movementId !== movementId,
      );
      return updateDraftBlock(current, blockId, {
        movements: movements.length > 0 ? movements : undefined,
        attempts: attempts.length > 0 ? attempts : undefined,
      });
    });
  }

  async function deleteDraft() {
    try {
      await deleteExecutionDraft(current.id);
      onDeleted();
    } catch {
      setSaveState("error");
    }
  }

  async function synchronize() {
    if (latestDraft.current.snapshot.blocks.length === 0) {
      setSyncError("Añade al menos un bloque antes de sincronizar.");
      return;
    }
    setSyncing(true);
    setSyncError(null);
    try {
      const persisted = await saveExecutionDraft(latestDraft.current);
      latestDraft.current = persisted;
      setCurrent(persisted);
      onSaved(persisted);
      const synchronized = await synchronizeExecutionDraft(persisted.id);
      latestDraft.current = synchronized;
      setCurrent(synchronized);
      onSaved(synchronized);
      setSaveState("saved");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo sincronizar el borrador.";
      setSyncError(message);
      const failed: ExecutionDraft = {
        ...latestDraft.current,
        syncStatus: "error",
        lastError: message,
        updatedAt: new Date().toISOString(),
      };
      latestDraft.current = failed;
      setCurrent(failed);
      onSaved(failed);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section aria-labelledby="draft-editor-title" className="draft-editor">
      <div className="draft-editor-toolbar">
        <button type="button" className="link-button" onClick={onClose}>
          ← Mis registros
        </button>
        <div className="draft-editor-sync">
          <span className={`sync-badge sync-${current.syncStatus}`}>
            {SYNC_STATUS_LABELS[current.syncStatus]}
          </span>
          <button
            type="button"
            className="primary-button"
            disabled={syncing || current.snapshot.blocks.length === 0}
            onClick={() => void synchronize()}
          >
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      {syncError ? (
        <p className="state-panel state-error" role="alert">
          {syncError}
        </p>
      ) : null}

      <p className="eyebrow">Borrador local</p>
      <h2 id="draft-editor-title">{current.title || "Entrenamiento sin título"}</h2>

      <div className="draft-editor-fields">
        <label>
          <span>Título del entrenamiento</span>
          <input
            type="text"
            value={current.title ?? ""}
            placeholder="Entrenamiento libre"
            onChange={(event) =>
              commit((current) => ({
                ...current,
                title: event.target.value || undefined,
              }))
            }
          />
        </label>
        <label>
          <span>Fecha del entrenamiento</span>
          <input
            type="date"
            value={current.executionDate}
            onChange={(event) => changeExecutionDate(event.target.value)}
          />
        </label>
        <label className="draft-editor-note">
          <span>Nota general</span>
          <textarea
            rows={3}
            value={current.snapshot.generalNote ?? ""}
            placeholder="Sensaciones, contexto o cualquier detalle de la sesión…"
            onChange={(event) =>
              commit((current) => ({
                ...current,
                snapshot: {
                  ...current.snapshot,
                  generalNote: event.target.value || undefined,
                },
              }))
            }
          />
        </label>
      </div>

      <FeelingFields feeling={current.snapshot.feeling} onChange={changeFeeling} />

      <div className="draft-editor-blocks">
        <div className="draft-editor-blocks-heading">
          <h3>Bloques</h3>
          <span>{current.snapshot.blocks.length}</span>
        </div>

        {current.snapshot.blocks.length === 0 ? (
          <p className="state-panel draft-editor-empty">
            Añade el primer bloque para empezar a registrar el entrenamiento.
          </p>
        ) : (
          <ul className="draft-block-list">
            {current.snapshot.blocks.map((block) => {
              const status = effectiveBlockStatus(block);
              const withoutMetrics = hasNoMetrics(block);
              const knownType = blockTypes.some((entry) => entry.id === block.blockTypeId);
              return (
                <li className="draft-block" key={block.id}>
                  <div className="draft-block-heading">
                    <span className="block-order">{block.position}</span>
                    <label className="draft-block-type">
                      <span>Tipo de bloque</span>
                      <select
                        aria-label={`Tipo del bloque ${block.position}`}
                        value={block.blockTypeId}
                        onChange={(event) =>
                          commit((current) =>
                            updateDraftBlock(current, block.id, {
                              blockTypeId: event.target.value,
                            }),
                          )
                        }
                      >
                        {knownType ? null : (
                          <option value={block.blockTypeId}>Tipo actual</option>
                        )}
                        {blockTypes.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.description}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="link-button draft-block-remove"
                      aria-label={`Eliminar bloque ${block.position}`}
                      onClick={() =>
                        commit((current) => removeDraftBlock(current, block.id))
                      }
                    >
                      Eliminar
                    </button>
                  </div>

                  <label className="draft-block-title">
                    <span>Título del bloque</span>
                    <input
                      type="text"
                      aria-label={`Título del bloque ${block.position}`}
                      value={block.title}
                      placeholder="Fuerza, WOD, calentamiento…"
                      onChange={(event) =>
                        commit((current) =>
                          updateDraftBlock(current, block.id, {
                            title: event.target.value,
                          }),
                        )
                      }
                    />
                  </label>

                  <fieldset className="block-status-fieldset">
                    <legend>Estado del bloque</legend>
                    <p className="block-status-current" aria-live="polite">
                      <span className={`block-status-badge block-status-${status}`}>
                        {blockStatusLabel(block)}
                      </span>
                    </p>
                    <div className="block-status-options">
                      {BLOCK_STATUS_OPTIONS.map((option) => {
                        const active = status === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            className={`block-status-option block-status-${option.value}${
                              active ? " block-status-option-active" : ""
                            }`}
                            aria-pressed={active}
                            onClick={() => changeBlockStatus(block.id, option.value)}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                      {status === "completed" || status === "partial" ? (
                        <label className="block-metrics-check">
                          <input
                            type="checkbox"
                            checked={withoutMetrics}
                            onChange={(event) =>
                              commit((current) => {
                                const latest = current.snapshot.blocks.find(
                                  (entry) => entry.id === block.id,
                                );
                                if (!latest) return current;
                                return updateDraftBlock(current, latest.id, {
                                  status: effectiveBlockStatus(latest),
                                  withoutMetrics: event.target.checked,
                                });
                              })
                            }
                          />
                          <span>Sin métricas</span>
                        </label>
                      ) : null}
                    </div>
                  </fieldset>

                  <DraftBlockMovements
                    block={block}
                    movementNames={movementNames}
                    movements={movements}
                    movementsStatus={movementsStatus}
                    syncStatus={current.syncStatus}
                    onAdd={(movementId) => addMovement(block.id, movementId)}
                    onRemove={(movementId) => removeMovement(block.id, movementId)}
                    onAttemptsChange={(attempts) =>
                      commit((current) =>
                        updateDraftBlock(current, block.id, { attempts }),
                      )
                    }
                  />

                  <label className="block-notes">
                    <span>Notas del bloque</span>
                    <textarea
                      rows={3}
                      aria-label={`Notas del bloque ${block.position}`}
                      value={block.notes ?? ""}
                      placeholder="Técnica, sensaciones, ajustes o cualquier detalle útil…"
                      onChange={(event) =>
                        commit((current) =>
                          updateDraftBlock(current, block.id, {
                            notes: event.target.value || undefined,
                          }),
                        )
                      }
                    />
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {blockTypes.length > 0 ? (
          <div className="draft-add-block">
            <label>
              <span>Tipo del nuevo bloque</span>
              <select
                value={blockTypeId}
                onChange={(event) => setBlockTypeId(event.target.value)}
              >
                {blockTypes.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.description}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="primary-button" onClick={addBlock}>
              Añadir bloque
            </button>
          </div>
        ) : (
          <p className="draft-editor-hint">
            No se pudieron cargar los tipos de bloque. Puedes seguir editando los bloques
            existentes sin conexión.
          </p>
        )}
      </div>

      <div className="draft-editor-footer">
        <p className="draft-editor-save" aria-live="polite">
          {saveState === "saving"
            ? "Guardando…"
            : saveState === "error"
              ? "No se pudo guardar el borrador."
              : "Guardado en este dispositivo."}
        </p>
        {confirmingDelete ? (
          <div className="draft-delete-confirm">
            <span>¿Eliminar este borrador?</span>
            <button type="button" className="danger-button" onClick={() => void deleteDraft()}>
              Sí, eliminar
            </button>
            <button type="button" className="link-button" onClick={() => setConfirmingDelete(false)}>
              Cancelar
            </button>
          </div>
        ) : (
          <button type="button" className="link-button" onClick={() => setConfirmingDelete(true)}>
            Eliminar borrador
          </button>
        )}
      </div>
    </section>
  );
}
