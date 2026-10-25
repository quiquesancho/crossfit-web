export type SessionExecutionStatus = "draft" | "completed" | "annulled";
export type BlockExecutionStatus =
  | "draft"
  | "completed"
  | "completed_without_metric"
  | "partial"
  | "skipped"
  | "abandoned";

export type WeightValue = {
  amount: number;
  unit: string;
};

export type LoadStatus = "rx" | "scaled";

export type SetAttemptStatus = "completed" | "partial" | "failed" | "skipped";

export type SetAttempt = {
  id: string;
  plannedPrescriptionId?: string;
  position: number;
  movementId?: string;
  complexVersionId?: string;
  status: SetAttemptStatus;
  note?: string;
  weight?: WeightValue;
  repetitions?: number;
};

export type PrescriptionExecutionMetric = {
  plannedPrescriptionId: string;
  actualWeight?: WeightValue;
  /** Legacy drafts stored the amount with the unit encoded in the field name. */
  actualWeightKg?: number;
  loadStatus?: LoadStatus;
};

export type BlockExecutionMetrics = {
  rounds?: number;
  extraRepetitions?: number;
  prescriptions?: PrescriptionExecutionMetric[];
};

export type Feeling = {
  id: string;
  rpe?: number;
  pain?: number;
  recoveryId?: string;
  techniqueQualityId?: string;
  limitationId?: string;
  note?: string;
};

export type Substitution = {
  id: string;
  plannedPrescriptionId: string;
  actualMovementId: string;
  reasonId?: string;
  note?: string;
};

export type SessionExecutionSnapshot = {
  baseRevision: number;
  plannedSessionId?: string;
  executionDate: string;
  status: SessionExecutionStatus;
  generalNote?: string;
  feeling?: Feeling;
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
    feeling?: Feeling;
    substitutions?: Substitution[];
    attempts?: SetAttempt[];
  }>;
};

export type DraftBlock = SessionExecutionSnapshot["blocks"][number];

export type DraftBlockChanges = Partial<
  Pick<DraftBlock, "blockTypeId" | "title" | "status" | "withoutMetrics" | "notes">
>;


export type ExecutionSyncResult = {
  id: string;
  revision: number;
  status: SessionExecutionStatus;
  updatedAt: string;
  result: "persisted" | "unchanged";
};

export type ExecutionDraft = {
  id: string;
  /** Local label for the session. Planned drafts copy the planned session title. */
  title?: string;
  plannedSessionId?: string;
  executionDate: string;
  snapshot: SessionExecutionSnapshot;
  syncStatus: "pending" | "synchronized" | "error";
  updatedAt: string;
  lastError?: string;
};
