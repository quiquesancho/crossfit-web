import type { PlannedSession } from "../planning/api";
import { synchronizeExecution } from "./api";
import { crossfitDatabase, type CrossfitDatabase } from "./database";
import type { ExecutionDraft } from "./types";
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
    plannedSessionId: session.id,
    executionDate: session.plannedDate,
    snapshot,
    syncStatus: "pending",
    updatedAt: now.toISOString(),
  };
}

export async function getOrCreateDraftForSession(
  session: PlannedSession,
  database: CrossfitDatabase = crossfitDatabase,
): Promise<ExecutionDraft> {
  const existing = await database.executionDrafts
    .where("plannedSessionId")
    .equals(session.id)
    .filter((draft) => draft.snapshot.status === "draft")
    .last();
  if (existing) return existing;

  const draft = createExecutionDraft(session);
  await database.executionDrafts.add(draft);
  return draft;
}

export async function saveExecutionDraft(
  draft: ExecutionDraft,
  database: CrossfitDatabase = crossfitDatabase,
): Promise<void> {
  await database.executionDrafts.put({
    ...draft,
    plannedSessionId: draft.snapshot.plannedSessionId,
    executionDate: draft.snapshot.executionDate,
    syncStatus: "pending",
    updatedAt: new Date().toISOString(),
    lastError: undefined,
  });
}

export async function synchronizeExecutionDraft(
  id: string,
  database: CrossfitDatabase = crossfitDatabase,
  signal?: AbortSignal,
): Promise<ExecutionDraft> {
  const draft = await database.executionDrafts.get(id);
  if (!draft) throw new Error("Execution draft not found.");

  try {
    const result = await synchronizeExecution(draft.id, draft.snapshot, signal);
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
