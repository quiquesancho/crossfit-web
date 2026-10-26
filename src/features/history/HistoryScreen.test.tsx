import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchCalendar, fetchExecutionHistory, type ExecutionSummary } from "./api";
import { HistoryScreen } from "./HistoryScreen";

vi.mock("./api", () => ({
  fetchCalendar: vi.fn(),
  fetchExecutionHistory: vi.fn(),
}));

const calendarMock = vi.mocked(fetchCalendar);
const historyMock = vi.mocked(fetchExecutionHistory);

const plannedExecution: ExecutionSummary = {
  id: "execution-1",
  executionDate: "2026-10-20",
  status: "completed",
  origin: "planned",
  title: "Fuerza y WOD",
  plannedSessionId: "session-1",
  blockCount: 3,
  rpe: 8,
  revision: 2,
  updatedAt: "2026-10-20T13:00:00.000Z",
};

const freeExecution: ExecutionSummary = {
  id: "execution-2",
  executionDate: "2026-10-22",
  status: "draft",
  origin: "free",
  title: "Entrenamiento libre",
  plannedSessionId: null,
  blockCount: 2,
  rpe: null,
  revision: 1,
  updatedAt: "2026-10-22T18:30:00.000Z",
};

const extraExecution: ExecutionSummary = {
  ...freeExecution,
  id: "execution-3",
  executionDate: "2026-10-24",
};

beforeEach(() => {
  calendarMock.mockResolvedValue({
    days: [
      {
        date: "2026-10-20",
        planned: [
          { id: "session-1", title: "Fuerza y WOD", objective: "Mantener una técnica sólida." },
        ],
        executions: [plannedExecution],
      },
      { date: "2026-10-22", planned: [], executions: [freeExecution] },
    ],
  });
  historyMock.mockResolvedValue({
    items: [plannedExecution, freeExecution],
    nextCursor: "cursor-1",
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HistoryScreen", () => {
  it("renders the month calendar, the selected day and the history list", async () => {
    render(<HistoryScreen initialDate="2026-10-20" onOpenPlannedSession={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Historial" })).toBeTruthy();
    expect(screen.getByText(/octubre.*2026/i)).toBeTruthy();

    await waitFor(() => expect(calendarMock).toHaveBeenCalledWith("2026-09-28", "2026-11-01", expect.anything()));
    expect(await screen.findByText("Mantener una técnica sólida.")).toBeTruthy();

    const dayPanel = screen.getByRole("region", { name: /día seleccionado|martes/i });
    expect(within(dayPanel).getAllByText("Fuerza y WOD").length).toBeGreaterThanOrEqual(1);
    expect(within(dayPanel).getAllByText("Finalizada")).toHaveLength(1);

    await waitFor(() => expect(screen.getByText("Últimos registros")).toBeTruthy());
    expect(screen.getAllByText("Entrenamiento libre")).toHaveLength(1);
  });

  it("opens a planned session from the day panel and from the history", async () => {
    const onOpen = vi.fn();
    render(<HistoryScreen initialDate="2026-10-20" onOpenPlannedSession={onOpen} />);

    fireEvent.click(await screen.findByRole("button", { name: "Ver sesión" }));
    expect(onOpen).toHaveBeenLastCalledWith("session-1", "2026-10-20");

    const openButtons = await screen.findAllByRole("button", { name: "Abrir en la planificación" });
    fireEvent.click(openButtons[0]!);
    expect(onOpen).toHaveBeenLastCalledWith("session-1", "2026-10-20");
  });

  it("loads the next history page with the opaque cursor", async () => {
    historyMock.mockResolvedValueOnce({
      items: [plannedExecution, freeExecution],
      nextCursor: "cursor-1",
    });
    historyMock.mockResolvedValueOnce({ items: [extraExecution], nextCursor: null });

    render(<HistoryScreen initialDate="2026-10-20" onOpenPlannedSession={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Cargar más" }));

    await waitFor(() =>
      expect(historyMock).toHaveBeenLastCalledWith({ cursor: "cursor-1", limit: 10 }),
    );
    expect(await screen.findByText("24 oct", { exact: false })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cargar más" })).toBeNull();
  });

  it("shows the empty states when there is no content", async () => {
    calendarMock.mockResolvedValue({ days: [] });
    historyMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<HistoryScreen initialDate="2026-10-20" onOpenPlannedSession={vi.fn()} />);

    expect(await screen.findByText("Todavía no hay ejecuciones sincronizadas")).toBeTruthy();
    expect(screen.getByText("Sin sesión planificada para este día.")).toBeTruthy();
  });

  it("shows a calendar error without hiding the history", async () => {
    calendarMock.mockRejectedValue(new Error("API request failed with status 503"));

    render(<HistoryScreen initialDate="2026-10-20" onOpenPlannedSession={vi.fn()} />);

    expect((await screen.findAllByText("No se pudo cargar el calendario.")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Últimos registros")).toBeTruthy();
  });
});
