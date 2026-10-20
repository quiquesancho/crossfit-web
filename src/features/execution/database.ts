import Dexie, { type EntityTable } from "dexie";

import type { ExecutionDraft } from "./types";

export class CrossfitDatabase extends Dexie {
  executionDrafts!: EntityTable<ExecutionDraft, "id">;

  constructor(name = "crossfit") {
    super(name);
    this.version(1).stores({
      executionDrafts: "id, plannedSessionId, executionDate, syncStatus, updatedAt",
    });
  }
}

export const crossfitDatabase = new CrossfitDatabase();
