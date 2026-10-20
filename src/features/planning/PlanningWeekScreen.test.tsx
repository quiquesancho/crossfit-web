import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOrCreateDraftForSession } from "../execution/drafts";
import type { PlanningWeek } from "./api";
import { PlanningWeekScreen } from "./PlanningWeekScreen";

vi.mock("../execution/drafts", () => ({ getOrCreateDraftForSession: vi.fn() }));

const week: PlanningWeek = {
  id: "week-id",
  trainingPlanId: "plan-id",
  planVersionId: "version-id",
  planTitle: "Planificación de ejemplo",
  weekStart: "2026-10-19",
  title: "Semana de fuerza",
  priorities: "Técnica y ritmo sostenible",
  sessions: [
    {
      id: "session-id",
      externalId: "session-1",
      plannedDate: "2026-10-20",
      title: "Power clean y AMRAP",
      objective: "Mantener una técnica sólida.",
      durationSeconds: 3900,
      targetRpe: 7,
      blocks: [
        {
          id: "block-id",
          position: 1,
          blockType: { id: "type-id", code: "strength", description: "Fuerza" },
          title: "Power clean",
          instructions: "Completar todas las series con buena técnica.",
          durationSeconds: 1200,
          targetRpe: 7,
          prescriptions: [
            {
              id: "prescription-id",
              position: 1,
              movement: { id: "movement-id", code: "power-clean", name: "Power clean" },
              complex: null,
              details: { sets: 5, repetitions: 3, durationSeconds: 720 },
              notes: "Descansar 90 segundos.",
            },
            {
              id: "complex-prescription-id",
              position: 2,
              movement: null,
              complex: { id: "complex-id", code: "clean-complex", name: "Complejo de clean", versionNumber: 2 },
              details: {},
              notes: null,
            },
          ],
        },
      ],
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("PlanningWeekScreen", () => {
  it("renders the complete published week", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));

    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);

    expect(screen.getByText("Cargando planificación…")).toBeDefined();
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    expect(screen.getByText("Técnica y ritmo sostenible")).toBeDefined();
    expect(screen.getAllByText("Power clean").length).toBeGreaterThan(0);
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getByText("Complejo de clean · v2")).toBeDefined();
    expect(screen.getByText("1 h 5 min")).toBeDefined();

    const details = screen.getByText("Power clean y AMRAP").closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    expect(details?.hasAttribute("open")).toBe(true);
  });

  it("navigates to the following week", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana sin planificación")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Semana siguiente" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/v1/planning/weeks/2026-10-26",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("shows service errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByText(/status 503/)).toBeDefined();
  });

  it("distinguishes a published week without sessions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...week, sessions: [] }), { status: 200 })),
    );
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);

    await waitFor(() => expect(screen.getByText(/no contiene sesiones/)).toBeDefined());
  });

  it("creates an offline draft from a planned session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce({ id: "draft-id" } as never);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));

    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    expect(getOrCreateDraftForSession).toHaveBeenCalledWith(week.sessions[0]);
  });
});
