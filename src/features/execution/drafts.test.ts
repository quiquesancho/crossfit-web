import "fake-indexeddb/auto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlannedSession } from "../planning/api";
import { CrossfitDatabase } from "./database";
import {
  createExecutionDraft,
  getOrCreateDraftForSession,
  listPendingExecutionDrafts,
  saveExecutionDraft,
  synchronizeExecutionDraft,
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
