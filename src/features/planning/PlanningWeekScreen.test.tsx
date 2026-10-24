import { fireEvent, render, screen, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  findDraftForSession,
  getOrCreateDraftForSession,
  saveExecutionDraft,
  synchronizeExecutionDraft,
} from "../execution/drafts";
import type { ExecutionDraft } from "../execution/types";
import type { PlanningWeek } from "./api";
import { PlanningWeekScreen } from "./PlanningWeekScreen";

vi.mock("../execution/drafts", () => ({
  findDraftForSession: vi.fn().mockResolvedValue(undefined),
  getOrCreateDraftForSession: vi.fn(),
  saveExecutionDraft: vi.fn(),
  synchronizeExecutionDraft: vi.fn(),
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
                oneRepMaxPercentage: 75,
                weightUnit: "kg",
                emptyDetail: null,
              },
              notes: "Descansar 90 segundos.",
            },
            {
              id: "back-squat-prescription-id",
              position: 2,
              movement: { id: "back-squat-id", code: "back-squat", name: "Back squat" },
              complex: null,
              details: { repetitions: 10, prescribedWeight: { amount: 60, unit: "kg" } },
              notes: null,
            },
            {
              id: "deadlift-prescription-id",
              position: 3,
              movement: { id: "deadlift-id", code: "deadlift", name: "Deadlift" },
              complex: null,
              details: {
                repetitions: 8,
                prescribedWeight: { amount: 83, unit: "kg" },
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
        {
          id: "wod-block-id",
          position: 3,
          blockType: { id: "wod-type-id", code: "wod", description: "WOD" },
          title: "AMRAP 12 minutos",
          instructions: "Mantener un ritmo constante.",
          durationSeconds: 720,
          targetRpe: 8,
          prescriptions: [
            {
              id: "amrap-format-id",
              position: 1,
              movement: null,
              complex: null,
              details: { format: "amrap", durationSeconds: 720 },
              notes: null,
            },
            {
              id: "wod-back-squat-id",
              position: 2,
              movement: { id: "back-squat-id", code: "back-squat", name: "Back squat" },
              complex: null,
              details: { repetitions: 10, prescribedWeight: { amount: 60, unit: "kg" } },
              notes: "Peso obligatorio: 60 kg.",
            },
            {
              id: "wod-deadlift-id",
              position: 3,
              movement: { id: "deadlift-id", code: "deadlift", name: "Deadlift" },
              complex: null,
              details: { repetitions: 8, prescribedWeight: { amount: 83, unit: "kg" } },
              notes: "Si no puedes con 83 kg, usa tu 55 % de 1RM.",
            },
          ],
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

function createFormatWeek(details: Record<string, unknown>): PlanningWeek {
  return {
    ...week,
    sessions: [
      {
        ...week.sessions[0]!,
        title: "Formatos de WOD",
        objective: null,
        blocks: [
          {
            id: `format-block-${String(details.format)}`,
            position: 1,
            blockType: { id: "wod-type-id", code: "wod", description: "WOD" },
            title: "Bloque de prueba",
            instructions: null,
            durationSeconds: null,
            targetRpe: 8,
            prescriptions: [
              {
                id: `format-prescription-${String(details.format)}`,
                position: 1,
                movement: null,
                complex: null,
                details,
                notes: null,
              },
              {
                id: `format-movement-${String(details.format)}`,
                position: 2,
                movement: { id: "back-squat-id", code: "back-squat", name: "Back squat" },
                complex: null,
                details: { repetitions: 10, prescribedWeight: { amount: 60, unit: "kg" } },
                notes: null,
              },
            ],
          },
        ],
      },
    ],
  };
}

function loadValues(): string[] {
  return screen.getAllByText("Carga").map((label) => {
    const cell = label.parentElement;
    return cell?.querySelector(".load-value")?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  });
}

const catalogResponses: Record<string, unknown> = {
  "/catalogs/recovery": {
    entries: [
      { id: "recovery-good", code: "good", description: "Buena", displayOrder: 4 },
    ],
  },
  "/catalogs/technique-quality": {
    entries: [
      { id: "technique-good", code: "good", description: "Buena", displayOrder: 3 },
    ],
  },
  "/catalogs/limitation": {
    entries: [
      { id: "limitation-technique", code: "technique", description: "Técnica", displayOrder: 1 },
    ],
  },
  "/catalogs/substitution-reason": {
    entries: [
      { id: "reason-equipment", code: "equipment", description: "Material no disponible", displayOrder: 2 },
    ],
  },
  "/catalog/movements": {
    movements: [
      { id: "burpee-id", code: "burpee", name: "Burpee", familyCode: "gymnastics" },
      { id: "row-id", code: "row", name: "Remo", familyCode: "monostructural" },
    ],
  },
};

function stubApi(fetchMock?: ReturnType<typeof vi.fn>) {
  const mock =
    fetchMock ??
    vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const catalogPath = Object.keys(catalogResponses).find((path) => url.includes(path));
      const payload = catalogPath ? catalogResponses[catalogPath] : week;
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
  vi.stubGlobal("fetch", mock);
  return mock;
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
    expect(screen.getAllByText("Carga")).toHaveLength(3);
    expect(loadValues()).toEqual(expect.arrayContaining(["75 %", "60 kg", "83 kg"]));
    expect(screen.queryByText("75 % de tu 1RM")).toBeNull();
    expect(screen.queryByText("de tu 1RM")).toBeNull();
    expect(screen.getByText("Descansar 90 segundos.")).toBeDefined();
    expect(screen.getByText("Si no puedes con 83 kg, usa tu 55 % de 1RM.")).toBeDefined();
    expect(screen.queryByText("Peso del entrenamiento")).toBeNull();
    expect(screen.queryByText("% de tu 1RM")).toBeNull();
    expect(screen.queryByText("Carga técnica estable")).toBeNull();
    expect(screen.queryByText("emptyDetail")).toBeNull();
    expect(screen.getByText("Complejo de clean · v2")).toBeDefined();
  });

  it("renders the AMRAP block format without a format-only prescription", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "WOD: AMRAP 12 minutos" }));

    expect(screen.getByText("AMRAP")).toBeDefined();
    expect(screen.getByText("12 min")).toBeDefined();
    expect(screen.queryByText("Formato")).toBeNull();
    expect(screen.getAllByText("Carga")).toHaveLength(2);
    expect(loadValues()).toEqual(["60 kg", "83 kg"]);
    expect(screen.getByText("Peso obligatorio: 60 kg.")).toBeDefined();
    expect(screen.getByText("Si no puedes con 83 kg, usa tu 55 % de 1RM.")).toBeDefined();
  });

  it.each([
    ["AMRAP", { format: "amrap", durationSeconds: 720 }, ["AMRAP", "12 min"]],
    [
      "EMOM",
      { format: "emom", intervalSeconds: 60, durationSeconds: 600 },
      ["EMOM", "10 rondas", "cada 1 min"],
    ],
    [
      "E2MOM",
      { format: "e2mom", durationSeconds: 1200 },
      ["E2MOM", "10 rondas", "cada 2 min"],
    ],
    ["For Time con cap", { format: "for_time", timeCapSeconds: 900 }, ["For Time", "Cap 15 min"]],
    ["For Time sin cap", { format: "for_time" }, ["For Time", "Sin límite"]],
    [
      "Rounds For Time",
      { format: "rounds_for_time", rounds: 5, timeCapSeconds: 1200 },
      ["Rounds For Time", "5 rondas", "Cap 20 min"],
    ],
    ["formato desconocido", { format: "chipper", durationSeconds: 900 }, ["Chipper", "15 min"]],
  ])("renders %s workout format details", async (_name, details, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(createFormatWeek(details)), { status: 200 })),
    );
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Formatos de WOD")).toBeDefined());
    fireEvent.click(screen.getByText("Formatos de WOD"));
    fireEvent.click(screen.getByRole("button", { name: "WOD: Bloque de prueba" }));

    for (const text of expected) {
      expect(screen.getAllByText(text).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("Formato")).toBeNull();
    expect(screen.getByText("Carga")).toBeDefined();
    expect(loadValues()).toContain("60 kg");
  });

  it("reads legacy prescribedWeightKg details", async () => {
    const legacyWeek = structuredClone(week);
    legacyWeek.sessions[0]!.blocks[2]!.prescriptions[2]!.details = {
      repetitions: 8,
      prescribedWeightKg: 83,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(legacyWeek), { status: 200 })),
    );
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "WOD: AMRAP 12 minutos" }));

    expect(loadValues()).toEqual(["60 kg", "83 kg"]);
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

    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    expect(getOrCreateDraftForSession).toHaveBeenCalledWith(week.sessions[0]);
  });

  it("hydrates a saved draft when the planned session is opened", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(findDraftForSession).mockResolvedValueOnce(createDraft());
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());

    fireEvent.click(screen.getByText("Power clean y AMRAP"));

    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    expect(findDraftForSession).toHaveBeenCalledWith("session-id");
  });

  it("synchronizes the planned draft and shows the server state", async () => {
    const draft = createDraft();
    const synchronized: ExecutionDraft = {
      ...draft,
      syncStatus: "synchronized",
      snapshot: { ...draft.snapshot, baseRevision: 1 },
      updatedAt: "2026-10-20T13:05:00.000Z",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(findDraftForSession).mockResolvedValueOnce(draft);
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    vi.mocked(synchronizeExecutionDraft).mockResolvedValueOnce(synchronized);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));

    fireEvent.click(await screen.findByRole("button", { name: "Sincronizar" }));

    await waitFor(() => expect(screen.getByText("Sincronizado")).toBeDefined());
    expect(synchronizeExecutionDraft).toHaveBeenCalledWith(draft.id);
    expect(screen.getByText("Registro sincronizado con el servidor.")).toBeDefined();
  });

  it("opens the focused session passed by the records screen", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" focusSessionId="session-id" />);

    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    const details = screen.getByText("Power clean y AMRAP").closest("details");
    expect(details?.hasAttribute("open")).toBe(true);
  });

  it("stores personal block notes in the offline draft", async () => {
    const draft = createDraft();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(draft);
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
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
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
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

  it("stores the actual weight used for a percentage-based prescription", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));
    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));

    const weight = await screen.findByRole("textbox", { name: "Peso usado en Power clean" });
    const prescription = weight.closest(".prescription");
    const details = prescription?.querySelector("dl");
    expect(details).not.toBeNull();
    expect(details?.contains(weight)).toBe(true);
    expect(within(details as HTMLElement).getByText("Repeticiones")).toBeDefined();
    expect(within(details as HTMLElement).getByText("Carga")).toBeDefined();
    expect(screen.queryByText("Cargas usadas")).toBeNull();
    const loadValue = details?.querySelector(".load-value");
    expect(loadValue?.querySelector(".load-amount")?.textContent).toBe("75");
    expect(loadValue?.querySelector(".load-unit")?.textContent).toBe("%");
    expect(loadValue?.textContent?.replace(/\s+/g, " ").trim()).toBe("75 %");
    const loadCell = weight.closest(".prescription-load");
    expect(loadCell?.querySelector(".load-unit")?.textContent).toBe("kg");
    fireEvent.change(weight, { target: { value: "55" } });
    fireEvent.blur(weight);
    expect((weight as HTMLInputElement).value).toBe("55");

    await waitFor(() =>
      expect(saveExecutionDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({
            blocks: expect.arrayContaining([
              expect.objectContaining({
                plannedBlockId: "block-id",
                metrics: expect.objectContaining({
                  prescriptions: expect.arrayContaining([
                    expect.objectContaining({
                      plannedPrescriptionId: "prescription-id",
                      actualWeight: { amount: 55, unit: "kg" },
                    }),
                  ]),
                }),
              }),
            ]),
          }),
        }),
      ),
    );
  });

  it("switches a load between RX and scaled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));
    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));

    const backSquat = await screen.findByRole("textbox", { name: "Peso usado en Back squat" });
    const card = backSquat.closest(".prescription") as HTMLElement;
    const rxToggle = within(card).getByRole("button", {
      name: "Tipo de carga en Back squat: RX",
    });
    expect(rxToggle.getAttribute("aria-pressed")).toBe("true");
    expect(rxToggle.className).toContain("load-status-toggle-rx");

    fireEvent.click(rxToggle);
    const scaledToggle = await within(card).findByRole("button", {
      name: "Tipo de carga en Back squat: Escalado",
    });
    expect(scaledToggle.getAttribute("aria-pressed")).toBe("false");
    expect(scaledToggle.className).toContain("load-status-toggle-scaled");
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              plannedBlockId: "block-id",
              metrics: expect.objectContaining({
                prescriptions: expect.arrayContaining([
                  expect.objectContaining({
                    plannedPrescriptionId: "back-squat-prescription-id",
                    loadStatus: "scaled",
                  }),
                ]),
              }),
            }),
          ]),
        }),
      }),
    );

    fireEvent.change(backSquat, { target: { value: "50" } });
    fireEvent.blur(backSquat);
    await waitFor(() =>
      expect(saveExecutionDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({
            blocks: expect.arrayContaining([
              expect.objectContaining({
                plannedBlockId: "block-id",
                metrics: expect.objectContaining({
                  prescriptions: expect.arrayContaining([
                    expect.objectContaining({
                      plannedPrescriptionId: "back-squat-prescription-id",
                      actualWeight: { amount: 50, unit: "kg" },
                      loadStatus: "scaled",
                    }),
                  ]),
                }),
              }),
            ]),
          }),
        }),
      ),
    );

    fireEvent.click(scaledToggle);
    await waitFor(() =>
      expect(
        within(card).getByRole("button", { name: "Tipo de carga en Back squat: RX" }),
      ).toBeDefined(),
    );
    expect((backSquat as HTMLInputElement).value).toBe("60");
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              plannedBlockId: "block-id",
              metrics: expect.objectContaining({
                prescriptions: expect.arrayContaining([
                  expect.objectContaining({
                    plannedPrescriptionId: "back-squat-prescription-id",
                    actualWeight: { amount: 60, unit: "kg" },
                    loadStatus: "rx",
                  }),
                ]),
              }),
            }),
          ]),
        }),
      }),
    );
  });

  it("follows the API eligibility flag instead of inferring it from details", async () => {
    const eligibilityWeek = structuredClone(week);
    const prescriptions = eligibilityWeek.sessions[0]!.blocks[0]!.prescriptions;
    prescriptions[0]!.allowsActualWeight = false;
    prescriptions[1]!.allowsActualWeight = true;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(eligibilityWeek), { status: 200 })),
    );
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));
    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));

    expect(
      screen.queryByRole("textbox", { name: "Peso usado en Power clean" }),
    ).toBeNull();
    expect(
      await screen.findByRole("textbox", { name: "Peso usado en Back squat" }),
    ).toBeDefined();
  });

  it("stores AMRAP rounds and repetitions from the current round", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "WOD: AMRAP 12 minutos" }));
    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));

    const rounds = await screen.findByRole("textbox", { name: "Rondas completadas" });
    const extraRepetitions = screen.getByRole("textbox", {
      name: "Repeticiones de la ronda en curso",
    });
    fireEvent.change(rounds, { target: { value: "5" } });
    fireEvent.blur(rounds);
    fireEvent.change(extraRepetitions, { target: { value: "12" } });
    fireEvent.blur(extraRepetitions);

    await waitFor(() => expect(screen.getByText("5 rondas + 12 repeticiones")).toBeDefined());
    expect(saveExecutionDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        snapshot: expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              plannedBlockId: "wod-block-id",
              metrics: expect.objectContaining({ rounds: 5, extraRepetitions: 12 }),
            }),
          ]),
        }),
      }),
    );
  });

  it("hides load and AMRAP fields when the block is marked without metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));
    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));
    expect(
      await screen.findByRole("textbox", { name: "Peso usado en Power clean" }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("checkbox", { name: "Sin métricas" }));

    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Peso usado en Power clean" })).toBeNull(),
    );
    expect(
      screen.queryByRole("button", { name: /Tipo de carga en Power clean/ }),
    ).toBeNull();
  });

  it("marks a completed block as done without metrics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(week), { status: 200 })));
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
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
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
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
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
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
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
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

  it("stores session feelings in the offline draft", async () => {
    stubApi();
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());

    fireEvent.click(screen.getByText("Sensaciones y RPE"));
    const rpe = await screen.findByLabelText("RPE de la sesión");
    fireEvent.change(rpe, { target: { value: "8" } });
    fireEvent.blur(rpe);
    fireEvent.change(await screen.findByLabelText("Recuperación"), {
      target: { value: "recovery-good" },
    });
    fireEvent.change(screen.getByLabelText("Nota de la sesión"), {
      target: { value: "Buenas sensaciones." },
    });

    await waitFor(() =>
      expect(saveExecutionDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({
            feeling: expect.objectContaining({
              rpe: 8,
              recoveryId: "recovery-good",
              note: "Buenas sensaciones.",
            }),
          }),
        }),
      ),
    );
  });

  it("stores the RPE of a completed block", async () => {
    stubApi();
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));
    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));

    const rpe = await screen.findByLabelText("RPE del bloque");
    fireEvent.change(rpe, { target: { value: "9" } });
    fireEvent.blur(rpe);

    await waitFor(() =>
      expect(saveExecutionDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({
            blocks: expect.arrayContaining([
              expect.objectContaining({
                plannedBlockId: "block-id",
                feeling: expect.objectContaining({ rpe: 9 }),
              }),
            ]),
          }),
        }),
      ),
    );
  });

  it("stores a movement substitution in the offline draft", async () => {
    stubApi();
    vi.mocked(getOrCreateDraftForSession).mockResolvedValueOnce(createDraft());
    vi.mocked(saveExecutionDraft).mockImplementation(async (value) => value);
    render(<PlanningWeekScreen initialWeekStart="2026-10-19" />);
    await waitFor(() => expect(screen.getByText("Semana de fuerza")).toBeDefined());
    fireEvent.click(screen.getByText("Power clean y AMRAP"));
    fireEvent.click(screen.getByRole("button", { name: "Registrar sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Sincronizar" })).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Fuerza: Power clean" }));

    const prescription = screen
      .getAllByRole("button", { name: "Sustituir movimiento" })[0]!
      .closest(".prescription") as HTMLElement;
    fireEvent.click(within(prescription).getByRole("button", { name: "Sustituir movimiento" }));

    const movement = await screen.findByLabelText("Movimiento realizado en Power clean");
    fireEvent.change(movement, { target: { value: "burpee-id" } });
    fireEvent.change(screen.getByLabelText("Motivo de la sustitución en Power clean"), {
      target: { value: "reason-equipment" },
    });
    fireEvent.change(screen.getByLabelText("Nota de la sustitución en Power clean"), {
      target: { value: "No había barra libre." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar sustitución" }));

    await waitFor(() =>
      expect(saveExecutionDraft).toHaveBeenLastCalledWith(
        expect.objectContaining({
          snapshot: expect.objectContaining({
            blocks: expect.arrayContaining([
              expect.objectContaining({
                plannedBlockId: "block-id",
                substitutions: [
                  expect.objectContaining({
                    plannedPrescriptionId: "prescription-id",
                    actualMovementId: "burpee-id",
                    reasonId: "reason-equipment",
                    note: "No había barra libre.",
                  }),
                ],
              }),
            ]),
          }),
        }),
      ),
    );
    expect(screen.getByText("Sustitución registrada")).toBeDefined();
  });
});
