import { apiPut } from "../../shared/api/client";
import type { ExecutionSyncResult, SessionExecutionSnapshot } from "./types";

export function synchronizeExecution(
  executionId: string,
  snapshot: SessionExecutionSnapshot,
  signal?: AbortSignal,
) {
  return apiPut<ExecutionSyncResult>(`/session-executions/${encodeURIComponent(executionId)}`, snapshot, signal);
}
