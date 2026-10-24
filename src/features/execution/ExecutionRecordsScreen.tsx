import { useEffect, useState, type FormEvent } from "react";

import { fetchCatalogEntries, type CatalogEntry } from "../catalog/api";
import { formatSessionDate, todayIsoDate } from "../planning/dates";
import {
  createFreeTrainingDraft,
  deleteExecutionDraft,
  listExecutionDrafts,
  saveExecutionDraft,
  synchronizeExecutionDraft,
} from "./drafts";
import { ExecutionDraftEditor } from "./ExecutionDraftEditor";
import { SYNC_STATUS_LABELS } from "./status";
import type { ExecutionDraft } from "./types";

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function blockCountLabel(count: number): string {
  return count === 1 ? "1 bloque" : `${count} bloques`;
}

export function ExecutionRecordsScreen({
  onOpenPlannedDraft,
}: {
  onOpenPlannedDraft: (draft: ExecutionDraft) => void;
}) {
  const [drafts, setDrafts] = useState<ExecutionDraft[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [blockTypes, setBlockTypes] = useState<CatalogEntry[]>([]);
  const [editing, setEditing] = useState<ExecutionDraft | null>(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(todayIsoDate());
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    listExecutionDrafts()
      .then((stored) => {
        if (active) setDrafts(stored);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setDrafts([]);
        setLoadError(error instanceof Error ? error.message : "Error desconocido");
      });

    fetchCatalogEntries("block-type", controller.signal)
      .then((catalog) => {
        if (active) setBlockTypes(catalog.entries);
      })
      .catch(() => {
        if (active) setBlockTypes([]);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  function replaceDraft(saved: ExecutionDraft) {
    setDrafts((current) =>
      (current ?? []).map((draft) => (draft.id === saved.id ? saved : draft)),
    );
  }

  async function refreshDrafts() {
    try {
      setDrafts(await listExecutionDrafts());
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudieron cargar los registros.");
    }
  }

  async function startFreeTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    try {
      const draft = createFreeTrainingDraft(title, date || todayIsoDate());
      const saved = await saveExecutionDraft(draft);
      setDrafts((current) => [saved, ...(current ?? [])]);
      setCreating(false);
      setTitle("");
      setDate(todayIsoDate());
      setEditing(saved);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo crear el entrenamiento.");
    }
  }

  async function removeDraft(id: string) {
    setActionError(null);
    try {
      await deleteExecutionDraft(id);
      setDrafts((current) => (current ?? []).filter((draft) => draft.id !== id));
      setConfirmingId(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "No se pudo eliminar el borrador.");
    }
  }

  async function synchronizeDraft(id: string) {
    setActionError(null);
    setSyncingId(id);
    try {
      replaceDraft(await synchronizeExecutionDraft(id));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "No se pudo sincronizar el registro.",
      );
      await refreshDrafts();
    } finally {
      setSyncingId(null);
    }
  }

  if (editing) {
    return (
      <ExecutionDraftEditor
        key={editing.id}
        draft={editing}
        blockTypes={blockTypes}
        onSaved={replaceDraft}
        onClose={() => {
          setEditing(null);
          void refreshDrafts();
        }}
        onDeleted={() => {
          setEditing(null);
          void refreshDrafts();
        }}
      />
    );
  }

  return (
    <section aria-labelledby="records-title">
      <div className="week-toolbar">
        <div>
          <p className="eyebrow">Ejecución</p>
          <h2 id="records-title">Mis registros</h2>
        </div>
        <button type="button" className="primary-button" onClick={() => setCreating(true)}>
          Nuevo entrenamiento libre
        </button>
      </div>

      {creating ? (
        <form className="free-training-form" onSubmit={(event) => void startFreeTraining(event)}>
          <div>
            <p className="eyebrow">Entrenamiento libre</p>
            <h3>Crea la sesión y añade sus bloques</h3>
          </div>
          <label>
            <span>Título</span>
            <input
              type="text"
              value={title}
              placeholder="Entrenamiento libre"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            <span>Fecha</span>
            <input
              type="date"
              value={date}
              required
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <div className="free-training-actions">
            <button type="submit" className="primary-button">
              Crear y editar
            </button>
            <button type="button" className="link-button" onClick={() => setCreating(false)}>
              Cancelar
            </button>
          </div>
        </form>
      ) : null}

      {actionError ? (
        <p className="state-panel state-error" role="alert">
          {actionError}
        </p>
      ) : null}

      {drafts === null && !loadError ? <p className="state-panel">Cargando registros…</p> : null}

      {loadError ? (
        <div className="state-panel state-error" role="alert">
          <h3>No se pudieron cargar los registros</h3>
          <p>{loadError}</p>
        </div>
      ) : null}

      {drafts !== null && drafts.length === 0 && !loadError ? (
        <div className="state-panel">
          <h3>Todavía no hay registros</h3>
          <p>
            Registra una sesión desde la planificación semanal o crea un entrenamiento libre.
          </p>
        </div>
      ) : null}

      {drafts !== null && drafts.length > 0 ? (
        <ul className="record-list">
          {drafts.map((draft) => (
            <li className="record-card" key={draft.id}>
              <div className="record-main">
                <p className="session-date">{formatSessionDate(draft.executionDate)}</p>
                <h3>{draft.title || "Entrenamiento sin título"}</h3>
                <p className="record-meta">
                  <span>{draft.plannedSessionId ? "Desde la planificación" : "Entrenamiento libre"}</span>
                  <span>{blockCountLabel(draft.snapshot.blocks.length)}</span>
                  <span>Actualizado {formatUpdatedAt(draft.updatedAt)}</span>
                </p>
              </div>

              <span className={`sync-badge sync-${draft.syncStatus}`}>
                {SYNC_STATUS_LABELS[draft.syncStatus]}
              </span>

              <div className="record-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    if (draft.plannedSessionId) onOpenPlannedDraft(draft);
                    else setEditing(draft);
                  }}
                >
                  {draft.plannedSessionId ? "Abrir en la planificación" : "Editar"}
                </button>
                {draft.syncStatus !== "synchronized" ? (
                  <button
                    type="button"
                    className="link-button"
                    aria-label={`Sincronizar ${draft.title || "entrenamiento"}`}
                    disabled={syncingId === draft.id || draft.snapshot.blocks.length === 0}
                    title={
                      draft.snapshot.blocks.length === 0
                        ? "Añade al menos un bloque antes de sincronizar."
                        : undefined
                    }
                    onClick={() => void synchronizeDraft(draft.id)}
                  >
                    {syncingId === draft.id ? "Sincronizando…" : "Sincronizar"}
                  </button>
                ) : null}
                {confirmingId === draft.id ? (
                  <span className="record-delete-confirm">
                    <span>¿Eliminar?</span>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => void removeDraft(draft.id)}
                    >
                      Sí, eliminar
                    </button>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => setConfirmingId(null)}
                    >
                      Cancelar
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setConfirmingId(draft.id)}
                  >
                    Eliminar
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
