import type { PlannedSession } from "../planning/api";
import { synchronizeExecution } from "./api";
import { crossfitDatabase, type CrossfitDatabase } from "./database";
import type { DraftBlock, DraftBlockChanges, ExecutionDraft, SessionExecutionSnapshot } from "./types";
import { createUuidV7 } from "./uuid";

export function createExecutionDraft(session: PlannedSession, now = new Date()): ExecutionDraft {
  const snapshot = {
    baseRevision: 0,
    plannedSessionId: session.id,
    executionDate: session.plannedDate,
    status: "draft" as const,
    blocks: session.blocks.map((block) => ({
      id: createUuidV7(),
      plannedBlockId: block.id,
      position: block.position,
      blockTypeId: block.blockType.id,
      title: block.title,
      status: "draft" as const,
    })),
  };
  return {
    id: createUuidV7(),
    title: session.title,
    plannedSessionId: session.id,
    executionDate: session.plannedDate,
    snapshot,
    syncStatus: "pending",
    updatedAt: now.toISOString(),
  };
}

export function createFreeTrainingDraft(
  title: string,
  executionDate: string,
  now = new Date(),
): ExecutionDraft {
  return {
    id: createUuidV7(),
    title: title.trim() || "Entrenamiento libre",
    executionDate,
    snapshot: {
      baseRevision: 0,
      executionDate,
      status: "draft",
      blocks: [],
    },
    syncStatus: "pending",
    updatedAt: now.toISOString(),
  };
}

export async function findDraftForSession(
  plannedSessionId: string,
  database: CrossfitDatabase = crossfitDatabase,
): Promise<ExecutionDraft | undefined> {
  return database.executionDrafts
    .where("plannedSessionId")
    .equals(plannedSessionId)
    .filter((draft) => draft.snapshot.status === "draft")
    .last();
}

export async function getOrCreateDraftForSession(
  session: PlannedSession,
  database: CrossfitDatabase = crossfitDatabase,
): Promise<ExecutionDraft> {
  const existing = await findDraftForSession(session.id, database);
  if (existing) return existing;

  const draft = createExecutionDraft(session);
  await database.executionDrafts.add(draft);
  return draft;
}

export async function saveExecutionDraft(
  draft: ExecutionDraft,
  database: CrossfitDatabase = crossfitDatabase,
): Promise<ExecutionDraft> {
  const saved: ExecutionDraft = {
    ...draft,
    plannedSessionId: draft.snapshot.plannedSessionId,
    executionDate: draft.snapshot.executionDate,
    syncStatus: "pending",
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  };
  await database.executionDrafts.put(saved);
  return saved;
}

export async function deleteExecutionDraft(
  id: string,
  database: CrossfitDatabase = crossfitDatabase,
): Promise<void> {
  await database.executionDrafts.delete(id);
}

export async function listExecutionDrafts(
  database: CrossfitDatabase = crossfitDatabase,
): Promise<ExecutionDraft[]> {
  const drafts = await database.executionDrafts.orderBy("updatedAt").reverse().toArray();
  return drafts;
}

export function addDraftBlock(
  draft: ExecutionDraft,
  blockTypeId: string,
  title: string,
): ExecutionDraft {
  const position =
    draft.snapshot.blocks.reduce((highest, block) => Math.max(highest, block.position), 0) + 1;
  const block: DraftBlock = {
    id: createUuidV7(),
    position,
    blockTypeId,
    title,
    status: "draft",
  };
  return {
    ...draft,
    snapshot: {
      ...draft.snapshot,
      blocks: [...draft.snapshot.blocks, block],
    },
  };
}

export function updateDraftBlock(
  draft: ExecutionDraft,
  blockId: string,
  changes: DraftBlockChanges,
): ExecutionDraft {
  return {
    ...draft,
    snapshot: {
      ...draft.snapshot,
      blocks: draft.snapshot.blocks.map((block) =>
        block.id === blockId ? { ...block, ...changes } : block,
      ),
    },
  };
}

export function removeDraftBlock(draft: ExecutionDraft, blockId: string): ExecutionDraft {
  return {
    ...draft,
    snapshot: {
      ...draft.snapshot,
      blocks: draft.snapshot.blocks
        .filter((block) => block.id !== blockId)
        .map((block, index) => ({ ...block, position: index + 1 })),
    },
  };
}

export function snapshotForSync(snapshot: SessionExecutionSnapshot): SessionExecutionSnapshot {
  return {
    ...snapshot,
    blocks: snapshot.blocks.map((block) => {
      // The movement list only lives in the local draft: the API persists the
      // movements through their attempts and rejects unsupported block keys.
      const rest = { ...block };
      delete rest.movements;
      const recorded =
        rest.status === "completed" ||
        rest.status === "partial" ||
        rest.status === "completed_without_metric";
      if (!recorded || rest.withoutMetrics || rest.status === "completed_without_metric") {
        const withoutMetrics = { ...rest };
        delete withoutMetrics.metrics;
        delete withoutMetrics.attempts;
        return withoutMetrics;
      }
      const attempts =
        rest.attempts && rest.attempts.length > 0 ? rest.attempts : undefined;
      if (!rest.metrics) return { ...rest, attempts };

      const prescriptions = rest.metrics.prescriptions
        ?.map((item) => {
          const { actualWeightKg, ...itemRest } = item;
          if (
            itemRest.actualWeight === undefined &&
            typeof actualWeightKg === "number" &&
            Number.isFinite(actualWeightKg)
          ) {
            return { ...itemRest, actualWeight: { amount: actualWeightKg, unit: "kg" } };
          }
          return itemRest;
        })
        .filter((item) => item.actualWeight !== undefined || item.loadStatus !== undefined);

      return {
        ...rest,
        metrics: {
          ...rest.metrics,
          prescriptions:
            prescriptions && prescriptions.length > 0 ? prescriptions : undefined,
        },
        attempts,
      };
    }),
  };
}

export async function synchronizeExecutionDraft(
  id: string,
  database: CrossfitDatabase = crossfitDatabase,
  signal?: AbortSignal,
): Promise<ExecutionDraft> {
  const draft = await database.executionDrafts.get(id);
  if (!draft) throw new Error("Execution draft not found.");
  if (draft.snapshot.blocks.length === 0) {
    throw new Error("Añade al menos un bloque antes de sincronizar.");
  }

  try {
    const result = await synchronizeExecution(draft.id, snapshotForSync(draft.snapshot), signal);
    const synchronized: ExecutionDraft = {
      ...draft,
      snapshot: { ...draft.snapshot, baseRevision: result.revision },
      syncStatus: "synchronized",
      updatedAt: result.updatedAt,
      lastError: undefined,
    };
    await database.executionDrafts.put(synchronized);
    return synchronized;
  } catch (error) {
    if (signal?.aborted) throw error;
    const failed: ExecutionDraft = {
      ...draft,
      syncStatus: "error",
      updatedAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : "Error desconocido",
    };
    await database.executionDrafts.put(failed);
    throw error;
  }
}

export function listPendingExecutionDrafts(database: CrossfitDatabase = crossfitDatabase) {
  return database.executionDrafts.where("syncStatus").anyOf("pending", "error").toArray();
}
