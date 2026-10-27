import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchMovements } from "../catalog/api";
import {
  createManualPersonalRecord,
  decidePersonalRecord,
  fetchComplexes,
  fetchCurrentPersonalRecords,
  fetchPersonalRecordSuggestions,
  fetchPersonalRecords,
  type ComplexCatalogEntry,
  type PersonalRecord,
} from "./api";
import { PersonalRecordsScreen } from "./PersonalRecordsScreen";

vi.mock("./api", () => ({
  createManualPersonalRecord: vi.fn(),
  decidePersonalRecord: vi.fn(),
  fetchComplexes: vi.fn(),
  fetchCurrentPersonalRecords: vi.fn(),
  fetchPersonalRecordSuggestions: vi.fn(),
  fetchPersonalRecords: vi.fn(),
}));

vi.mock("../catalog/api", () => ({
  fetchMovements: vi.fn(),
}));

const currentMock = vi.mocked(fetchCurrentPersonalRecords);
const suggestionsMock = vi.mocked(fetchPersonalRecordSuggestions);
const historyMock = vi.mocked(fetchPersonalRecords);
const complexesMock = vi.mocked(fetchComplexes);
const movementsMock = vi.mocked(fetchMovements);
const createMock = vi.mocked(createManualPersonalRecord);
const decideMock = vi.mocked(decidePersonalRecord);

const movementId = "movement-power-clean";
const complexVersionId = "complex-version-1";

const currentMovement: PersonalRecord = {
  id: "record-current",
  status: "confirmed",
  sourceType: "attempt",
  movement: { id: movementId, code: "power-clean", name: "Power clean" },
  complex: null,
  repetitions: 2,
  loadKg: 85,
  achievedOn: "2026-10-20",
  confirmedAt: "2026-10-20T12:00:00.000Z",
  note: null,
  originAttemptId: "attempt-1",
};

const currentComplex: PersonalRecord = {
  id: "record-complex",
  status: "confirmed",
  sourceType: "manual_historical",
  movement: null,
  complex: {
    id: complexVersionId,
    code: "clean-complex",
    name: "Clean complex",
    versionNumber: 1,
  },
  repetitions: 1,
  loadKg: 100,
  achievedOn: "2026-10-19",
  confirmedAt: "2026-10-19T12:00:00.000Z",
  note: "Buena técnica",
  originAttemptId: null,
};

const suggestion: PersonalRecord = {
  id: "record-suggestion",
  status: "suggested",
  sourceType: "attempt",
  movement: { id: movementId, code: "power-clean", name: "Power clean" },
  complex: null,
  repetitions: 2,
  loadKg: 90,
  achievedOn: "2026-10-22",
  confirmedAt: null,
  note: null,
  originAttemptId: "attempt-2",
  previousLoadKg: 85,
};

const discarded: PersonalRecord = {
  ...suggestion,
  id: "record-discarded",
  status: "discarded",
  loadKg: 88,
  previousLoadKg: null,
};

const complexCatalog: ComplexCatalogEntry = {
  id: "complex-1",
  code: "clean-complex",
  name: "Clean complex",
  versions: [
    {
      id: complexVersionId,
      versionNumber: 1,
      publishedAt: "2026-10-18T12:00:00.000Z",
      steps: [
        {
          position: 1,
          repetitions: 1,
          movement: { id: "movement-clean", code: "power-clean", name: "Power clean" },
        },
        {
          position: 2,
          repetitions: 1,
          movement: { id: "movement-front-squat", code: "front-squat", name: "Front squat" },
        },
      ],
    },
  ],
};

beforeEach(() => {
  currentMock.mockResolvedValue([currentMovement, currentComplex]);
  suggestionsMock.mockResolvedValue([suggestion]);
  historyMock.mockResolvedValue({
    items: [currentMovement, currentComplex, discarded],
    nextCursor: null,
  });
  complexesMock.mockResolvedValue([complexCatalog]);
  movementsMock.mockResolvedValue({
    movements: [
      { id: movementId, code: "power-clean", name: "Power clean", familyCode: "clean" },
    ],
  });
  createMock.mockResolvedValue(currentMovement);
  decideMock.mockResolvedValue(suggestion);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("PersonalRecordsScreen", () => {
  it("renders current records, suggestions and history", async () => {
    render(<PersonalRecordsScreen />);

    expect(await screen.findByText("Sugerencias")).toBeTruthy();
    expect(screen.getByText("90 kg")).toBeTruthy();
    expect(screen.getByText(/Supera 85 kg/)).toBeTruthy();
    expect(screen.getAllByText("Power clean").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Clean complex · v1/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("100 kg").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Descartada")).toBeTruthy();
    expect(screen.getAllByText("Buena técnica").length).toBeGreaterThanOrEqual(1);
  });

  it("confirms a suggestion and reloads the records", async () => {
    render(<PersonalRecordsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    await waitFor(() =>
      expect(decideMock).toHaveBeenCalledWith("record-suggestion", "confirmed"),
    );
    await waitFor(() => expect(currentMock).toHaveBeenCalledTimes(2));
  });

  it("discards a suggestion", async () => {
    render(<PersonalRecordsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Descartar" }));

    await waitFor(() =>
      expect(decideMock).toHaveBeenCalledWith("record-suggestion", "discarded"),
    );
  });

  it("creates a manual movement record", async () => {
    render(<PersonalRecordsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Añadir marca" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Movimiento" }), {
      target: { value: movementId },
    });
    fireEvent.change(screen.getByLabelText("Repeticiones"), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Carga (kg)"), { target: { value: "85" } });
    fireEvent.change(screen.getByLabelText("Observación"), {
      target: { value: "Primera vez" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar marca" }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          movementId,
          repetitions: 2,
          loadKg: 85,
          achievedOn: expect.any(String),
          note: "Primera vez",
        }),
      ),
    );
  });

  it("shows the selected complex steps and creates a complex record", async () => {
    render(<PersonalRecordsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Añadir marca" }));
    fireEvent.click(screen.getByLabelText("Complejo"));
    fireEvent.change(screen.getByLabelText("Complejo y versión"), {
      target: { value: complexVersionId },
    });

    expect((await screen.findAllByText("1 Power clean + 1 Front squat")).length).toBeGreaterThanOrEqual(1);

    fireEvent.change(screen.getByLabelText("Carga (kg)"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar marca" }));

    await waitFor(() =>
      expect(createMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          complexVersionId,
          repetitions: 1,
          loadKg: 100,
        }),
      ),
    );
  });

  it("loads more history", async () => {
    historyMock.mockResolvedValueOnce({
      items: [currentMovement],
      nextCursor: "cursor-1",
    });
    historyMock.mockResolvedValueOnce({
      items: [discarded],
      nextCursor: null,
    });
    render(<PersonalRecordsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Cargar más" }));

    await waitFor(() =>
      expect(historyMock).toHaveBeenLastCalledWith({
        cursor: "cursor-1",
        limit: 10,
      }),
    );
    expect(await screen.findByText("Descartada")).toBeTruthy();
  });

  it("shows an error and retries", async () => {
    currentMock.mockRejectedValueOnce(new Error("offline"));
    render(<PersonalRecordsScreen />);

    expect(
      await screen.findByRole("heading", { name: "No se pudieron cargar las marcas" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));

    await waitFor(() => expect(currentMock).toHaveBeenCalledTimes(2));
  });

  it("shows an empty state when there are no confirmed records", async () => {
    currentMock.mockResolvedValue([]);
    suggestionsMock.mockResolvedValue([]);
    historyMock.mockResolvedValue({ items: [], nextCursor: null });
    render(<PersonalRecordsScreen />);

    expect(await screen.findByText("Todavía no hay marcas confirmadas")).toBeTruthy();
    expect(screen.getByText("Las marcas confirmadas y descartadas aparecerán aquí.")).toBeTruthy();
  });

  it("reports a decision error without losing the list", async () => {
    decideMock.mockRejectedValueOnce(new Error("conflict"));
    render(<PersonalRecordsScreen />);

    fireEvent.click(await screen.findByRole("button", { name: "Confirmar" }));

    expect(await screen.findByText(/No se pudo confirmar la marca/)).toBeTruthy();
    expect(screen.getByText("Sugerencias")).toBeTruthy();
  });
});
