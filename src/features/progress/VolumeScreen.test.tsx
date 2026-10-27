import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchVolume, type VolumeResponse } from "./api";
import { VolumeScreen } from "./VolumeScreen";

vi.mock("./api", () => ({
  fetchVolume: vi.fn(),
}));

vi.mock("../planning/dates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../planning/dates")>();
  return { ...actual, todayIsoDate: () => "2026-10-27" };
});

const fetchVolumeMock = vi.mocked(fetchVolume);

const movementResponse: VolumeResponse = {
  from: "2026-09-30",
  to: "2026-10-27",
  groupBy: "movement",
  totals: {
    repetitions: 120,
    technicalRepetitions: 80,
    durationSeconds: 600,
    technicalDurationSeconds: 420,
    volumeKg: 5400.5,
    technicalVolumeKg: 3200,
    sessions: 4,
    lastPracticedOn: "2026-10-26",
  },
  items: [
    {
      movement: { id: "movement-id", code: "power-clean", name: "Power clean" },
      family: { id: "family-id", code: "clean", name: "Clean" },
      repetitions: 40,
      technicalRepetitions: 24,
      durationSeconds: 0,
      technicalDurationSeconds: 0,
      volumeKg: 3400,
      technicalVolumeKg: 2040,
      sessions: 3,
      lastPracticedOn: "2026-10-26",
    },
  ],
};

const familyResponse: VolumeResponse = {
  ...movementResponse,
  groupBy: "family",
  items: [
    {
      movement: null,
      family: { id: "family-id", code: "clean", name: "Clean" },
      repetitions: 40,
      technicalRepetitions: 24,
      durationSeconds: 0,
      technicalDurationSeconds: 0,
      volumeKg: 3400,
      technicalVolumeKg: 2040,
      sessions: 3,
      lastPracticedOn: "2026-10-26",
    },
  ],
};

describe("VolumeScreen", () => {
  beforeEach(() => {
    fetchVolumeMock.mockReset();
    fetchVolumeMock.mockImplementation(({ groupBy }) =>
      Promise.resolve(groupBy === "family" ? familyResponse : movementResponse),
    );
  });

  afterEach(() => cleanup());

  it("loads the default four-week movement volume", async () => {
    render(<VolumeScreen />);

    await waitFor(() =>
      expect(fetchVolumeMock).toHaveBeenCalledWith(
        { from: "2026-09-30", to: "2026-10-27", groupBy: "movement" },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText("Power clean")).toBeTruthy();
    expect(screen.getByText("120")).toBeTruthy();
    expect(screen.getByText("80 en práctica técnica")).toBeTruthy();
    expect(screen.getByText("5400,5 kg")).toBeTruthy();
    expect(screen.getByText("60% técnico")).toBeTruthy();
  });

  it("switches to family grouping", async () => {
    render(<VolumeScreen />);
    await screen.findByText("Power clean");

    fireEvent.click(screen.getByRole("button", { name: "Por familia" }));

    await waitFor(() =>
      expect(fetchVolumeMock).toHaveBeenLastCalledWith(
        { from: "2026-09-30", to: "2026-10-27", groupBy: "family" },
        expect.any(AbortSignal),
      ),
    );
    expect(await screen.findByText("Clean")).toBeTruthy();
    expect(screen.getByText("Familia de movimientos")).toBeTruthy();
  });

  it("changes the preset range", async () => {
    render(<VolumeScreen />);
    await screen.findByText("Power clean");

    fireEvent.click(screen.getByRole("button", { name: "12 semanas" }));

    await waitFor(() =>
      expect(fetchVolumeMock).toHaveBeenLastCalledWith(
        { from: "2026-08-05", to: "2026-10-27", groupBy: "movement" },
        expect.any(AbortSignal),
      ),
    );
  });

  it("rounds fractional seconds without showing 60 seconds", async () => {
    fetchVolumeMock.mockResolvedValue({
      ...movementResponse,
      totals: {
        ...movementResponse.totals,
        durationSeconds: 119.6,
        technicalDurationSeconds: 119.6,
      },
      items: [
        {
          ...movementResponse.items[0],
          durationSeconds: 119.6,
          technicalDurationSeconds: 119.6,
        },
      ],
    });

    render(<VolumeScreen />);

    expect(await screen.findAllByText("2 min")).toHaveLength(2);
    expect(screen.queryByText(/60 s/)).toBeNull();
  });

  it("shows an empty state when there is no volume", async () => {
    fetchVolumeMock.mockResolvedValue({
      ...movementResponse,
      totals: {
        repetitions: 0,
        technicalRepetitions: 0,
        durationSeconds: 0,
        technicalDurationSeconds: 0,
        volumeKg: 0,
        technicalVolumeKg: 0,
        sessions: 0,
        lastPracticedOn: null,
      },
      items: [],
    });

    render(<VolumeScreen />);

    expect(await screen.findByText("Sin volumen en este periodo")).toBeTruthy();
    expect(screen.getByText("Sin tiempo")).toBeTruthy();
  });

  it("shows an error with retry", async () => {
    fetchVolumeMock.mockRejectedValue(new Error("network"));

    render(<VolumeScreen />);

    expect(await screen.findByText("No se pudo cargar el volumen")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeTruthy();
  });
});
