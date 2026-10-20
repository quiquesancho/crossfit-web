import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOrCreateDraftForSession, saveExecutionDraft } from "../execution/drafts";
import type { ExecutionDraft } from "../execution/types";
import type { PlanningWeek } from "./api";
import { PlanningWeekScreen } from "./PlanningWeekScreen";

vi.mock("../execution/drafts", () => ({
  getOrCreateDraftForSession: vi.fn(),
  saveExecutionDraft: vi.fn(),
}));

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
              details: {
                sets: 5,
                repetitions: 3,
                durationSeconds: 720,
                oneRepMaxPercentage: 75,
                emptyDetail: null,
              },
              notes: "Descansar 90 segundos.",
            },
            {
              id: "back-squat-prescription-id",
              position: 2,
              movement: { id: "back-squat-id", code: "back-squat", name: "Back squat" },
              complex: null,
              details: { repetitions: 10, prescribedWeightKg: 60 },
              notes: null,
            },
            {
              id: "deadlift-prescription-id",
              position: 3,
              movement: { id: "deadlift-id", code: "deadlift", name: "Deadlift" },
              complex: null,
              details: {
                repetitions: 8,
                prescribedWeightKg: 83,
              },
              notes: "Si no puedes con 83 kg, usa tu 55 % de 1RM.",
            },
            {
              id: "complex-prescription-id",
              position: 4,
              movement: null,
              complex: { id: "complex-id", code: "clean-complex", name: "Complejo de clean", versionNumber: 2 },
              details: {},
              notes: null,
            },
          ],
        },
        {
          id: "warmup-block-id",
          position: 2,
          blockType: { id: "warmup-type-id", code: "warmup", description: "Calentamiento" },
          title: "Movilidad y activación",
          instructions: "Preparar hombros y cadera.",
          durationSeconds: 600,
          targetRpe: null,
          prescriptions: [],
        },
      ],
    },
  ],
};

function createDraft(): ExecutionDraft {
  return {
    id: "draft-id",
    plannedSessionId: "session-id",
    executionDate: "2026-10-20",
    syncStatus: "pending",
    updatedAt: "2026-10-20T10:00:00.000Z",
    snapshot: {
      baseRevision: 0,
      plannedSessionId: "session-id",
      executionDate: "2026-10-20",
      status: "draft",
      blocks: week.sessions[0]!.blocks.map((block, index) => ({
        id: `execution-block-${index}`,
        plannedBlockId: block.id,
        position: block.position,
        blockTypeId: block.blockType.id,
        title: block.title,
        status: "draft",
      })),
    },
  };
}

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
    expect(screen.getByText("1 h 5 min")).toBeDefined();

    const details = screen.getByText("Power clean y AMRAP").closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    expect(details?.hasAttribute("open")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));
    expect(screen.getByText("5")).toBeDefined();
    expect(screen.getAllByText("Peso del entrenamiento")).toHaveLength(2);
    expect(screen.getByText("60 kg")).toBeDefined();
    expect(screen.getByText("83 kg")).toBeDefined();
    expect(screen.getByText("% de tu 1RM")).toBeDefined();
    expect(screen.getByText("75 %")).toBeDefined();
    expect(screen.getByText("Si no puedes con 83 kg, usa tu 55 % de 1RM.")).toBeDefined();
    expect(screen.queryByText("Si no puedes")).toBeNull();
    expect(screen.queryByText("emptyDetail")).toBeNull();
    expect(screen.getByText("Complejo de clean · v2")).toBeDefined();
  });

  it("keeps only one training block open at a time", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));

    const strength = screen.getByRole("button", { name: "Fuerza: Power clean" });
    const warmup = screen.getByRole("button", { name: "Calentamiento: Movilidad y activación" });
    expect(strength.getAttribute("aria-expanded")).toBe("false");
    expect(warmup.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(strength);
    expect(strength.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(warmup);
    expect(strength.getAttribute("aria-expanded")).toBe("false");
    expect(warmup.getAttribute("aria-expanded")).toBe("true");
    expect(screen.queryByText("Completar todas las series con buena técnica.")).toBeNull();
    expect(screen.getByText("Preparar hombros y cadera.")).toBeDefined();
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
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));

    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    expect(getOrCreateDraftForSession).toHaveBeenCalledWith(week.sessions[0]);
  });

  it("stores personal block notes in the offline draft", async () => {
    const draft = createDraft();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(draft);
    vi.mocked(saveExecutionDraft).mockResolvedValue(undefined);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));

    fireEvent.change(screen.getByLabelText("Mis notas para este bloque"), {
      target: { value: "Mantener los codos altos." },
    });

    await waitFor(() => expect(saveExecutionDraft).toHaveBeenCalledTimes(1));
    expect(saveExecutionDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ plannedBlockId: "block-id", notes: "Mantener los codos altos." }),
          ]),
        }),
      }),
    );
  });

  it("stores the selected block status in the offline draft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockResolvedValue(undefined);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));

    expect(screen.queryByRole("button", { name: "Sin registrar" })).toBeNull();
    expect(screen.getByText("Sin registrar")).toBeDefined();

    const partialStatus = screen.getByRole("button", { name: "Parcial" });
    expect(partialStatus.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(partialStatus);

    await waitFor(() => expect(partialStatus.getAttribute("aria-pressed")).toBe("true"));
    expect(saveExecutionDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([expect.objectContaining({ plannedBlockId: "block-id", status: "partial" })]),
        }),
      }),
    );

    fireEvent.click(partialStatus);
    await waitFor(() => expect(partialStatus.getAttribute("aria-pressed")).toBe("false"));
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([expect.objectContaining({ plannedBlockId: "block-id", status: "draft" })]),
        }),
      }),
    );
  });

  it("marks a completed block as done without metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockResolvedValue(undefined);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));
    expect(screen.queryByRole("checkbox", { name: "Sin métricas" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));
    const withoutMetrics = await screen.findByRole("checkbox", { name: "Sin métricas" });
    expect((withoutMetrics as HTMLInputElement).checked).toBe(false);
    fireEvent.click(withoutMetrics);

    await waitFor(() => expect((withoutMetrics as HTMLInputElement).checked).toBe(true));
    expect(screen.getByRole("button", { name: "Realizado" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getAllByText("Realizado sin métricas").length).toBeGreaterThan(0);
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ plannedBlockId: "block-id", status: "completed", withoutMetrics: true }),
          ]),
        }),
      }),
    );

    fireEvent.click(withoutMetrics);
    await waitFor(() => expect((withoutMetrics as HTMLInputElement).checked).toBe(false));
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([expect.objectContaining({ plannedBlockId: "block-id", status: "completed" })]),
        }),
      }),
    );
  });

  it("marks a partial block as done without metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockResolvedValue(undefined);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));

    fireEvent.click(screen.getByRole("button", { name: "Parcial" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Sin métricas" }));

    expect(screen.getAllByText("Parcial sin métricas").length).toBeGreaterThan(0);
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ plannedBlockId: "block-id", status: "partial", withoutMetrics: true }),
          ]),
        }),
      }),
    );
  });

  it("does not offer metrics controls for a skipped block", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockResolvedValue(undefined);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));

    fireEvent.click(screen.getByRole("button", { name: "Omitido" }));
    expect(screen.queryByRole("checkbox", { name: "Sin métricas" })).toBeNull();
    expect(screen.getAllByText("Omitido").length).toBeGreaterThan(0);
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([expect.objectContaining({ plannedBlockId: "block-id", status: "skipped" })]),
        }),
      }),
    );
  });

  it("normalizes a legacy completed block when metrics are re-enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    const legacyDraft = createDraft();
    legacyDraft.snapshot.blocks[0] = {
      ...legacyDraft.snapshot.blocks[0]!,
      status: "completed_without_metric",
    };
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(legacyDraft);
    vi.mocked(saveExecutionDraft).mockResolvedValue(undefined);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Borrador preparado" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));

    const checkbox = screen.getByRole("checkbox", { name: "Sin métricas" });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);

    await waitFor(() => expect((checkbox as HTMLInputElement).checked).toBe(false));
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              plannedBlockId: "block-id",
              status: "completed",
              withoutMetrics: false,
            }),
          ]),
        }),
      }),
    );
  });
});
