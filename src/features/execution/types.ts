export type SessionExecutionStatus = "draft" | "completed" | "annulled";
export type BlockExecutionStatus =
  | "draft"
  | "completed"
  | "completed_without_metric"
  | "partial"
  | "skipped"
  | "abandoned";

export type PrescriptionExecutionMetric = {
  plannedPrescriptionId: string;
  actualWeightKg?: number;
};

export type BlockExecutionMetrics = {
  rounds?: number;
  extraRepetitions?: number;
  prescriptions?: PrescriptionExecutionMetric[];
};

export type SessionExecutionSnapshot = {
  baseRevision: number;
  plannedSessionId?: string;
  executionDate: string;
  status: SessionExecutionStatus;
  generalNote?: string;
  blocks: Array<{
    id: string;
    plannedBlockId?: string;
    position: number;
    blockTypeId: string;
    title: string;
    status: BlockExecutionStatus;
    withoutMetrics?: boolean;
    notes?: string;
    metrics?: BlockExecutionMetrics;
  }>;
};

export type ExecutionSyncResult = {
  id: string;
  revision: number;
  status: SessionExecutionStatus;
  updatedAt: string;
  result: "persisted" | "unchanged";
};

export type ExecutionDraft = {
  id: string;
  plannedSessionId?: string;
  executionDate: string;
  snapshot: SessionExecutionSnapshot;
  syncStatus: "pending" | "synchronized" | "error";
  updatedAt: string;
  lastError?: string;
};
