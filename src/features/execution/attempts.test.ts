import { describe, expect, it } from "vitest";

import {
  attemptSummaryText,
  attemptValueText,
  attemptsForMovement,
  attemptsForPrescription,
  createAttempt,
  duplicateAttempt,
  movementIdsForAttempts,
  nextAttemptPosition,
  removeAttempt,
  summarizeAttempts,
  updateAttempt,
} from "./attempts";
import type { SetAttempt } from "./types";

const prescriptionId = "prescription-id";

function attempt(changes: Partial<SetAttempt>): SetAttempt {
  return {
    id: "attempt-id",
    plannedPrescriptionId: prescriptionId,
    position: 1,
    status: "completed",
    ...changes,
  };
}

describe("set attempt helpers", () => {
  it("filters and orders the attempts of one prescription", () => {
    const attempts = [
      attempt({ id: "second", position: 3 }),
      attempt({ id: "other", plannedPrescriptionId: "other-prescription", position: 2 }),
      attempt({ id: "first", position: 1 }),
    ];

    expect(attemptsForPrescription(attempts, prescriptionId).map(({ id }) => id)).toEqual([
      "first",
      "second",
    ]);
    expect(nextAttemptPosition(attempts)).toBe(4);
  });

  it("filters free-training attempts by movement and keeps their order", () => {
    const attempts = [
      attempt({ id: "power-second", plannedPrescriptionId: undefined, movementId: "power-clean", position: 2 }),
      attempt({ id: "deadlift", plannedPrescriptionId: undefined, movementId: "deadlift", position: 1 }),
      attempt({ id: "power-first", plannedPrescriptionId: undefined, movementId: "power-clean", position: 3 }),
    ];

    expect(attemptsForMovement(attempts, "power-clean").map(({ id }) => id)).toEqual([
      "power-second",
      "power-first",
    ]);
    expect(attemptsForMovement(attempts, "deadlift").map(({ id }) => id)).toEqual(["deadlift"]);
    expect(movementIdsForAttempts(attempts)).toEqual(["deadlift", "power-clean"]);
    expect(movementIdsForAttempts(undefined)).toEqual([]);
  });

  it("creates a movement-anchored attempt without a prescription", () => {
    const created = createAttempt({ movementId: "power-clean" }, [], { repetitions: 3 });

    expect(created).toEqual(
      expect.objectContaining({
        movementId: "power-clean",
        position: 1,
        status: "completed",
        repetitions: 3,
      }),
    );
    expect(created.plannedPrescriptionId).toBeUndefined();
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it("creates an attempt with the default load and repetitions", () => {
    const created = createAttempt({ plannedPrescriptionId: prescriptionId }, [attempt({})], {
      weight: { amount: 60, unit: "kg" },
      repetitions: 4,
    });

    expect(created).toEqual(
      expect.objectContaining({
        plannedPrescriptionId: prescriptionId,
        position: 2,
        status: "completed",
        weight: { amount: 60, unit: "kg" },
        repetitions: 4,
      }),
    );
    expect(created.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it("duplicates an attempt with a new id and position", () => {
    const original = attempt({ id: "original", weight: { amount: 70, unit: "kg" }, repetitions: 2 });
    const copy = duplicateAttempt(original, [original]);

    expect(copy.id).not.toBe(original.id);
    expect(copy).toEqual(
      expect.objectContaining({
        plannedPrescriptionId: prescriptionId,
        position: 2,
        weight: { amount: 70, unit: "kg" },
        repetitions: 2,
      }),
    );
  });

  it("updates and removes attempts without touching other prescriptions", () => {
    const attempts = [
      attempt({ id: "one" }),
      attempt({ id: "other", plannedPrescriptionId: "other-prescription" }),
    ];

    const updated = updateAttempt(attempts, "one", {
      status: "failed",
      repetitions: 0,
      note: "Sin fuerza.",
    });
    expect(updated[0]).toEqual(
      expect.objectContaining({ status: "failed", repetitions: 0, note: "Sin fuerza." }),
    );
    expect(updated[1]).toBe(attempts[1]);

    expect(removeAttempt(updated, "one")).toEqual([attempts[1]]);
  });

  it("describes the value of one attempt as text", () => {
    expect(attemptValueText(attempt({ weight: { amount: 62.5, unit: "kg" }, repetitions: 3 }))).toBe(
      "62,5 kg × 3 reps",
    );
    expect(attemptValueText(attempt({ repetitions: 1 }))).toBe("1 rep");
    expect(attemptValueText(attempt({ weight: { amount: 60, unit: "kg" } }))).toBe("60 kg");
    expect(attemptValueText(attempt({}))).toBe("Sin datos");
  });

  it("summarizes the counted series, repetitions and volume", () => {
    const attempts = [
      attempt({ id: "a", position: 1, repetitions: 5, weight: { amount: 60, unit: "kg" } }),
      attempt({ id: "b", position: 2, repetitions: 5, weight: { amount: 65, unit: "kg" } }),
      attempt({ id: "c", position: 3, status: "failed", repetitions: 3 }),
      attempt({ id: "d", position: 4, status: "partial", repetitions: 2 }),
    ];

    expect(summarizeAttempts(attempts)).toEqual({
      series: 3,
      repetitions: 12,
      volume: [{ amount: 625, unit: "kg" }],
    });
    expect(attemptSummaryText(attempts)).toBe("3 series · 12 repeticiones · Volumen 625 kg");
    expect(attemptSummaryText([])).toBeNull();
  });
});
