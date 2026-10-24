import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlannedSession } from "../planning/api";
import { CrossfitDatabase } from "./database";
import {
  addDraftBlock,
  createExecutionDraft,
  createFreeTrainingDraft,
  deleteExecutionDraft,
  findDraftForSession,
  getOrCreateDraftForSession,
  listExecutionDrafts,
  listPendingExecutionDrafts,
  removeDraftBlock,
  saveExecutionDraft,
  synchronizeExecutionDraft,
  updateDraftBlock,
} from "./drafts";
import { isUuidV7 } from "./uuid";

const session: PlannedSession = {
  id: "019b4e0a-0000-7000-8000-000000000041",
  externalId: "session-1",
  plannedDate: "2026-10-20",
  title: "Fuerza",
  objective: null,
  durationSeconds: 3600,
  targetRpe: 7,
  blocks: [
    {
      id: "019b4e0a-0000-7000-8000-000000000042",
      position: 1,
      blockType: { id: "019b4e0a-0000-7000-8000-000000000003", code: "strength", description: "Fuerza" },
      title: "Power clean",
      instructions: null,
      durationSeconds: 1200,
      targetRpe: 7,
      prescriptions: [],
    },
  ],
};

const databases: CrossfitDatabase[] = [];
function testDatabase() {
  const database = new CrossfitDatabase(`crossfit-test-${databases.length}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(databases.splice(0).map((database) => database.delete()));
});

describe("offline execution drafts", () => {
  it("copies a planned session into a client-owned UUIDv7 snapshot", () => {
    const draft = createExecutionDraft(session, new Date("2026-10-20T13:00:00Z"));

    expect(isUuidV7(draft.id)).toBe(true);
    expect(isUuidV7(draft.snapshot.blocks[0]!.id)).toBe(true);
    expect(draft).toEqual(
      expect.objectContaining({
        plannedSessionId: session.id,
        executionDate: session.plannedDate,
        syncStatus: "pending",
        updatedAt: "2026-10-20T13:00:00.000Z",
      }),
    );
    expect(draft.snapshot.blocks[0]).toEqual(
      expect.objectContaining({ plannedBlockId: session.blocks[0]!.id, status: "draft" }),
    );
  });

  it("reuses an existing draft for the same planned session", async () => {
    const database = testDatabase();
    const first = await getOrCreateDraftForSession(session, database);
    const second = await getOrCreateDraftForSession(session, database);

    expect(second.id).toBe(first.id);
    expect(await database.executionDrafts.count()).toBe(1);
  });

  it("marks local edits as pending", async () => {
    const database = testDatabase();
    const draft = createExecutionDraft(session);
    await database.executionDrafts.add({ ...draft, syncStatus: "synchronized" });

    await saveExecutionDraft({ ...draft, snapshot: { ...draft.snapshot, generalNote: "Actualizado" } }, database);

    await expect(database.executionDrafts.get(draft.id)).resolves.toEqual(
      expect.objectContaining({ syncStatus: "pending", lastError: undefined }),
    );
  });

  it("synchronizes a complete snapshot and stores the server revision", async () => {
    const database = testDatabase();
    const draft = createExecutionDraft(session);
    await database.executionDrafts.add(draft);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: draft.id,
          revision: 1,
          status: "draft",
          updatedAt: "2026-10-20T13:05:00.000Z",
          result: "persisted",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const synchronized = await synchronizeExecutionDraft(draft.id, database);

    expect(synchronized.syncStatus).toBe("synchronized");
    expect(synchronized.snapshot.baseRevision).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/session-executions/${draft.id}`,
      expect.objectContaining({ method: "PUT", body: JSON.stringify(draft.snapshot) }),
    );
  });

  it("retains failed drafts for retry", async () => {
    const database = testDatabase();
    const draft = createExecutionDraft(session);
    await database.executionDrafts.add(draft);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(synchronizeExecutionDraft(draft.id, database)).rejects.toThrow("503");

    await expect(listPendingExecutionDrafts(database)).resolves.toEqual([
      expect.objectContaining({ id: draft.id, syncStatus: "error", lastError: expect.stringContaining("503") }),
    ]);
  });

  it("reports an unknown draft before contacting the API", async () => {
    const database = testDatabase();
    await expect(synchronizeExecutionDraft("missing", database)).rejects.toThrow("not found");
  });
});

describe("execution draft library", () => {
  it("finds a saved draft without creating another one", async () => {
    const database = testDatabase();

    await expect(findDraftForSession(session.id, database)).resolves.toBeUndefined();

    const draft = await getOrCreateDraftForSession(session, database);

    await expect(findDraftForSession(session.id, database)).resolves.toEqual(draft);
    expect(await database.executionDrafts.count()).toBe(1);
  });

  it("ignores completed executions when looking for a draft", async () => {
    const database = testDatabase();
    const draft = createExecutionDraft(session);
    await database.executionDrafts.add({
      ...draft,
      snapshot: { ...draft.snapshot, status: "completed" },
    });

    await expect(findDraftForSession(session.id, database)).resolves.toBeUndefined();
  });

  it("creates a free training draft without a planned session", () => {
    const draft = createFreeTrainingDraft("  ", "2026-10-22", new Date("2026-10-22T08:00:00Z"));

    expect(isUuidV7(draft.id)).toBe(true);
    expect(draft.title).toBe("Entrenamiento libre");
    expect(draft.plannedSessionId).toBeUndefined();
    expect(draft.executionDate).toBe("2026-10-22");
    expect(draft.snapshot).toEqual({
      baseRevision: 0,
      executionDate: "2026-10-22",
      status: "draft",
      blocks: [],
    });
  });

  it("adds, updates and removes blocks keeping positions contiguous", () => {
    const draft = createFreeTrainingDraft("Libre", "2026-10-22");
    const withStrength = addDraftBlock(draft, "type-strength", "Fuerza");
    const withWod = addDraftBlock(withStrength, "type-wod", "WOD");

    expect(withWod.snapshot.blocks.map((block) => [block.position, block.title])).toEqual([
      [1, "Fuerza"],
      [2, "WOD"],
    ]);
    expect(isUuidV7(withWod.snapshot.blocks[0]!.id)).toBe(true);

    const updated = updateDraftBlock(withWod, withWod.snapshot.blocks[1]!.id, {
      status: "partial",
      withoutMetrics: true,
      notes: "Corté la última ronda.",
    });
    expect(updated.snapshot.blocks[1]).toEqual(
      expect.objectContaining({
        status: "partial",
        withoutMetrics: true,
        notes: "Corté la última ronda.",
      }),
    );

    const removed = removeDraftBlock(updated, withWod.snapshot.blocks[0]!.id);
    expect(removed.snapshot.blocks).toEqual([
      expect.objectContaining({ position: 1, title: "WOD" }),
    ]);
  });

  it("lists stored drafts from the most recently updated", async () => {
    const database = testDatabase();
    const older = {
      ...createFreeTrainingDraft("Antigua", "2026-10-20"),
      updatedAt: "2026-10-20T10:00:00.000Z",
    };
    const newer = {
      ...createFreeTrainingDraft("Reciente", "2026-10-21"),
      updatedAt: "2026-10-21T10:00:00.000Z",
    };
    await database.executionDrafts.bulkAdd([older, newer]);

    await expect(listExecutionDrafts(database)).resolves.toEqual([
      expect.objectContaining({ title: "Reciente" }),
      expect.objectContaining({ title: "Antigua" }),
    ]);
  });

  it("returns the saved draft and can delete it", async () => {
    const database = testDatabase();
    const draft = createFreeTrainingDraft("Libre", "2026-10-22");
    await database.executionDrafts.add(draft);

    const saved = await saveExecutionDraft(
      { ...draft, snapshot: { ...draft.snapshot, generalNote: "Nota" } },
      database,
    );
    expect(saved.snapshot.generalNote).toBe("Nota");
    expect(saved.syncStatus).toBe("pending");

    await deleteExecutionDraft(draft.id, database);
    await expect(database.executionDrafts.count()).resolves.toBe(0);
  });
});
