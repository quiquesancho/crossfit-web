import type { BlockExecutionStatus, DraftBlock, ExecutionDraft } from "./types";

export const BLOCK_STATUS_OPTIONS: Array<{
  value: Exclude<BlockExecutionStatus, "draft" | "completed_without_metric" | "abandoned">;
  label: string;
}> = [
  { value: "completed", label: "Realizado" },
  { value: "partial", label: "Parcial" },
  { value: "skipped", label: "Omitido" },
];

export const BLOCK_STATUS_LABELS: Record<BlockExecutionStatus, string> = {
  draft: "Sin registrar",
  completed: "Realizado",
  completed_without_metric: "Realizado sin métricas",
  partial: "Parcial",
  skipped: "Omitido",
  abandoned: "Abandonado",
};

export const SYNC_STATUS_LABELS: Record<ExecutionDraft["syncStatus"], string> = {
  pending: "Pendiente de sincronizar",
  synchronized: "Sincronizado",
  error: "Error de sincronización",
};

export function effectiveBlockStatus(block: DraftBlock): BlockExecutionStatus {
  return block.status === "completed_without_metric" ? "completed" : block.status;
}

export function hasNoMetrics(block: DraftBlock): boolean {
  return block.withoutMetrics ?? block.status === "completed_without_metric";
}

export function blockStatusLabel(block: DraftBlock): string {
  const status = effectiveBlockStatus(block);
  if (hasNoMetrics(block) && (status === "completed" || status === "partial")) {
    return `${BLOCK_STATUS_LABELS[status]} sin métricas`;
  }
  return BLOCK_STATUS_LABELS[status];
}
