import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SetAttemptsEditor } from "./SetAttemptsEditor";
import type { SetAttempt } from "./types";

const attempt: SetAttempt = {
  id: "019b4e0a-0000-7000-8000-000000000071",
  plannedPrescriptionId: "prescription-id",
  position: 1,
  status: "completed",
  repetitions: 3,
};

describe("SetAttemptsEditor", () => {
  afterEach(() => cleanup());

  it("captures technical practice duration only when enabled", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <SetAttemptsEditor
        plannedPrescriptionId="prescription-id"
        prescriptionName="Técnica"
        unit="kg"
        allAttempts={[attempt]}
        onChange={onChange}
      />,
    );

    expect(
      screen.queryByRole("textbox", { name: "Tiempo de práctica de la serie 1 de Técnica" }),
    ).toBeNull();

    rerender(
      <SetAttemptsEditor
        plannedPrescriptionId="prescription-id"
        prescriptionName="Técnica"
        unit="kg"
        showDuration
        allAttempts={[attempt]}
        onChange={onChange}
      />,
    );

    const duration = screen.getByRole("textbox", {
      name: "Tiempo de práctica de la serie 1 de Técnica",
    });
    fireEvent.change(duration, { target: { value: "90" } });
    fireEvent.blur(duration);

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: attempt.id, durationSeconds: 90 }),
    ]);
  });
});
