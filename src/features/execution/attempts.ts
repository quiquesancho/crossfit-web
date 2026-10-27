import type { SetAttempt, SetAttemptStatus, WeightValue } from "./types";
import { createUuidV7 } from "./uuid";

export type AttemptDefaultValues = {
  weight?: WeightValue;
  repetitions?: number;
};

/** An attempt belongs to exactly one planned prescription or one free-training movement. */
export type AttemptAnchor =
  | { plannedPrescriptionId: string }
  | { movementId: string };

export type AttemptSummary = {
  series: number;
  repetitions: number;
  durationSeconds: number;
  volume: Array<{ amount: number; unit: string }>;
};

export function attemptMatchesAnchor(attempt: SetAttempt, anchor: AttemptAnchor): boolean {
  return "plannedPrescriptionId" in anchor
    ? attempt.plannedPrescriptionId === anchor.plannedPrescriptionId
    : attempt.movementId === anchor.movementId;
}

export function attemptsForAnchor(
  attempts: SetAttempt[] | undefined,
  anchor: AttemptAnchor,
): SetAttempt[] {
  return (attempts ?? [])
    .filter((attempt) => attemptMatchesAnchor(attempt, anchor))
    .sort((left, right) => left.position - right.position);
}

export function attemptsForPrescription(
  attempts: SetAttempt[] | undefined,
  plannedPrescriptionId: string,
): SetAttempt[] {
  return attemptsForAnchor(attempts, { plannedPrescriptionId });
}

export function attemptsForMovement(
  attempts: SetAttempt[] | undefined,
  movementId: string,
): SetAttempt[] {
  return attemptsForAnchor(attempts, { movementId });
}

/** Movement ids used in a block, in the order their first series appears. */
export function movementIdsForAttempts(attempts: SetAttempt[] | undefined): string[] {
  const ordered = [...(attempts ?? [])].sort((left, right) => left.position - right.position);
  const ids: string[] = [];
  for (const attempt of ordered) {
    if (attempt.movementId && !ids.includes(attempt.movementId)) ids.push(attempt.movementId);
  }
  return ids;
}

export function nextAttemptPosition(attempts: SetAttempt[] | undefined): number {
  return (attempts ?? []).reduce((highest, attempt) => Math.max(highest, attempt.position), 0) + 1;
}

export function createAttempt(
  anchor: AttemptAnchor,
  attempts: SetAttempt[] | undefined,
  defaults: AttemptDefaultValues = {},
): SetAttempt {
  const attempt: SetAttempt = {
    id: createUuidV7(),
    position: nextAttemptPosition(attempts),
    status: "completed",
  };
  if ("plannedPrescriptionId" in anchor) {
    attempt.plannedPrescriptionId = anchor.plannedPrescriptionId;
  } else {
    attempt.movementId = anchor.movementId;
  }
  if (defaults.weight) attempt.weight = { ...defaults.weight };
  if (defaults.repetitions !== undefined) attempt.repetitions = defaults.repetitions;
  return attempt;
}

export function duplicateAttempt(
  attempt: SetAttempt,
  attempts: SetAttempt[] | undefined,
): SetAttempt {
  const copy: SetAttempt = {
    id: createUuidV7(),
    position: nextAttemptPosition(attempts),
    status: attempt.status,
  };
  if (attempt.plannedPrescriptionId) copy.plannedPrescriptionId = attempt.plannedPrescriptionId;
  if (attempt.movementId) copy.movementId = attempt.movementId;
  if (attempt.complexVersionId) copy.complexVersionId = attempt.complexVersionId;
  if (attempt.weight) copy.weight = { ...attempt.weight };
  if (attempt.repetitions !== undefined) copy.repetitions = attempt.repetitions;
  if (attempt.durationSeconds !== undefined) copy.durationSeconds = attempt.durationSeconds;
  if (attempt.note !== undefined) copy.note = attempt.note;
  return copy;
}

export function updateAttempt(
  attempts: SetAttempt[] | undefined,
  id: string,
  changes: Partial<Omit<SetAttempt, "id">>,
): SetAttempt[] {
  return (attempts ?? []).map((attempt) => {
    if (attempt.id !== id) return attempt;
    const next: SetAttempt = { ...attempt, ...changes };
    if (next.weight === undefined) delete next.weight;
    if (next.repetitions === undefined) delete next.repetitions;
    if (next.durationSeconds === undefined) delete next.durationSeconds;
    if (next.note === undefined) delete next.note;
    if (next.plannedPrescriptionId === undefined) delete next.plannedPrescriptionId;
    if (next.movementId === undefined) delete next.movementId;
    if (next.complexVersionId === undefined) delete next.complexVersionId;
    return next;
  });
}

export function removeAttempt(attempts: SetAttempt[] | undefined, id: string): SetAttempt[] {
  return (attempts ?? []).filter((attempt) => attempt.id !== id);
}

const COUNTED_STATUSES = new Set<SetAttemptStatus>(["completed", "partial"]);

export function summarizeAttempts(attempts: SetAttempt[] | undefined): AttemptSummary {
  const counted = (attempts ?? []).filter((attempt) => COUNTED_STATUSES.has(attempt.status));
  const volumeByUnit = new Map<string, number>();
  let repetitions = 0;
  let durationSeconds = 0;
  for (const attempt of counted) {
    if (attempt.repetitions !== undefined) repetitions += attempt.repetitions;
    if (attempt.durationSeconds !== undefined) durationSeconds += attempt.durationSeconds;
    if (attempt.weight && attempt.repetitions !== undefined) {
      const current = volumeByUnit.get(attempt.weight.unit) ?? 0;
      volumeByUnit.set(attempt.weight.unit, current + attempt.weight.amount * attempt.repetitions);
    }
  }
  return {
    series: counted.length,
    repetitions,
    durationSeconds,
    volume: [...volumeByUnit.entries()].map(([unit, amount]) => ({ amount, unit })),
  };
}

export function attemptValueText(attempt: SetAttempt): string {
  const parts: string[] = [];
  if (attempt.weight) {
    parts.push(`${formatAmount(attempt.weight.amount)} ${attempt.weight.unit}`);
  }
  if (attempt.repetitions !== undefined) {
    parts.push(`${attempt.repetitions} ${attempt.repetitions === 1 ? "rep" : "reps"}`);
  }
  if (attempt.durationSeconds !== undefined) {
    parts.push(`${formatAmount(attempt.durationSeconds)} s`);
  }
  return parts.length > 0 ? parts.join(" × ") : "Sin datos";
}

export function attemptSummaryText(attempts: SetAttempt[] | undefined): string | null {
  const summary = summarizeAttempts(attempts);
  if (summary.series === 0) return null;
  const parts = [
    `${summary.series} ${summary.series === 1 ? "serie" : "series"}`,
    `${summary.repetitions} ${summary.repetitions === 1 ? "repetición" : "repeticiones"}`,
  ];
  const volume = summary.volume.map(({ amount, unit }) => `${formatAmount(amount)} ${unit}`);
  if (volume.length > 0) parts.push(`Volumen ${volume.join(" + ")}`);
  if (summary.durationSeconds > 0) {
    parts.push(`Práctica ${formatAmount(summary.durationSeconds)} s`);
  }
  return parts.join(" · ");
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(".", ",");
}
