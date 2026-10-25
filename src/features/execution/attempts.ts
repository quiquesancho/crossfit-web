import type { SetAttempt, SetAttemptStatus, WeightValue } from "./types";
import { createUuidV7 } from "./uuid";

export type AttemptDefaultValues = {
  weight?: WeightValue;
  repetitions?: number;
};

export type AttemptSummary = {
  series: number;
  repetitions: number;
  volume: Array<{ amount: number; unit: string }>;
};

export function attemptsForPrescription(
  attempts: SetAttempt[] | undefined,
  plannedPrescriptionId: string,
): SetAttempt[] {
  return (attempts ?? [])
    .filter((attempt) => attempt.plannedPrescriptionId === plannedPrescriptionId)
    .sort((left, right) => left.position - right.position);
}

export function nextAttemptPosition(attempts: SetAttempt[] | undefined): number {
  return (attempts ?? []).reduce((highest, attempt) => Math.max(highest, attempt.position), 0) + 1;
}

export function createAttempt(
  plannedPrescriptionId: string,
  attempts: SetAttempt[] | undefined,
  defaults: AttemptDefaultValues = {},
): SetAttempt {
  const attempt: SetAttempt = {
    id: createUuidV7(),
    plannedPrescriptionId,
    position: nextAttemptPosition(attempts),
    status: "completed",
  };
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
  for (const attempt of counted) {
    if (attempt.repetitions !== undefined) repetitions += attempt.repetitions;
    if (attempt.weight && attempt.repetitions !== undefined) {
      const current = volumeByUnit.get(attempt.weight.unit) ?? 0;
      volumeByUnit.set(attempt.weight.unit, current + attempt.weight.amount * attempt.repetitions);
    }
  }
  return {
    series: counted.length,
    repetitions,
    volume: [...volumeByUnit.entries()].map(([unit, amount]) => ({ amount, unit })),
  };
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
  return parts.join(" · ");
}

function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1).replace(".", ",");
}
