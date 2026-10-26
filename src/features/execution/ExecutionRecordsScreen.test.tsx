import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlannedSession } from "../planning/api";
import { crossfitDatabase } from "./database";
import {
  addDraftBlock,
  createExecutionDraft,
  createFreeTrainingDraft,
  updateDraftBlock,
} from "./drafts";
import { ExecutionRecordsScreen } from "./ExecutionRecordsScreen";

const blockTypes = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    code: "warmup",
    description: "Calentamiento",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    code: "strength",
    description: "Fuerza",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    code: "wod",
    description: "WOD",
  },
];

const movements = [
  {
    id: "019b4e0a-0000-7000-8000-000000000010",
    code: "power-clean",
    name: "Power clean",
    familyCode: "weightlifting",
  },
  {
    id: "019b4e0a-0000-7000-8000-000000000011",
    code: "deadlift",
    name: "Deadlift",
    familyCode: "weightlifting",
  },
];

const powerCleanId = movements[0]!.id;

function jsonResponse(payload: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function stubCatalogs() {
  const mock = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    return jsonResponse(
      url.includes("/catalog/movements") ? { movements } : { entries: blockTypes },
    );
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const plannedSession: PlannedSession = {
  id: "019b4e0a-0000-7000-8000-000000000041",
  externalId: "session-1",
  plannedDate: "2026-10-20",
  title: "Power clean y AMRAP",
  objective: null,
  durationSeconds: null,
  targetRpe: null,
  blocks: [],
};

beforeEach(() => {
  stubCatalogs();
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await crossfitDatabase.executionDrafts.clear();
});

describe("ExecutionRecordsScreen", () => {
  it("lists planned and free drafts and opens planned ones in the planning screen", async () => {
    const planned = createExecutionDraft(plannedSession);
    const free = createFreeTrainingDraft("Sesión libre", "2026-10-22");
    await crossfitDatabase.executionDrafts.bulkAdd([planned, free]);
    const onOpenPlannedDraft = vi.fn();

    render(<ExecutionRecordsScreen onOpenPlannedDraft={onOpenPlannedDraft} />);

    await waitFor(() => expect(screen.getByText("Sesión libre")).toBeDefined());
    expect(screen.getByText("Power clean y AMRAP")).toBeDefined();
    expect(screen.getByText("Desde la planificación")).toBeDefined();
    expect(screen.getByText("Entrenamiento libre")).toBeDefined();
    expect(screen.getAllByText("Pendiente de sincronizar")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Abrir en la planificación" }));

    expect(onOpenPlannedDraft).toHaveBeenCalledWith(
      expect.objectContaining({ id: planned.id, plannedSessionId: plannedSession.id }),
    );
  });

  it("creates a free training and stores block edits locally", async () => {
    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Todavía no hay registros")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Nuevo entrenamiento libre" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Sesión de prueba" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear y editar" }));

    expect(await screen.findByRole("heading", { name: "Sesión de prueba" })).toBeDefined();
    expect(
      screen.getByText("Añade el primer bloque para empezar a registrar el entrenamiento."),
    ).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Añadir bloque" }));

    const blockTitle = await screen.findByLabelText("Título del bloque 1");
    expect((blockTitle as HTMLInputElement).value).toBe("Calentamiento");

    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));
    const withoutMetrics = await screen.findByRole("checkbox", { name: "Sin métricas" });
    fireEvent.click(withoutMetrics);
    fireEvent.change(screen.getByLabelText("Notas del bloque 1"), {
      target: { value: "Buena técnica." },
    });

    await waitFor(async () => {
      const [stored] = await crossfitDatabase.executionDrafts.toArray();
      expect(stored?.snapshot.blocks[0]).toEqual(
        expect.objectContaining({
          title: "Calentamiento",
          status: "completed",
          withoutMetrics: true,
          notes: "Buena técnica.",
        }),
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "← Mis registros" }));

    await waitFor(() => expect(screen.getByText("Sesión de prueba")).toBeDefined());
    expect(screen.getByText("1 bloque")).toBeDefined();
  });

  it("stores session feelings in a free training", async () => {
    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Todavía no hay registros")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Nuevo entrenamiento libre" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Sesión con sensaciones" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear y editar" }));
    expect(await screen.findByRole("heading", { name: "Sesión con sensaciones" })).toBeDefined();

    fireEvent.click(screen.getByText("Sensaciones y RPE"));
    const rpe = await screen.findByLabelText("RPE de la sesión");
    fireEvent.change(rpe, { target: { value: "6" } });
    fireEvent.blur(rpe);
    fireEvent.change(screen.getByLabelText("Nota de la sesión"), {
      target: { value: "Sesión suave." },
    });

    await waitFor(async () => {
      const [stored] = await crossfitDatabase.executionDrafts.toArray();
      expect(stored?.snapshot.feeling).toEqual(
        expect.objectContaining({ rpe: 6, note: "Sesión suave." }),
      );
    });
  });

  it("deletes a draft after confirmation", async () => {
    const free = createFreeTrainingDraft("Para borrar", "2026-10-22");
    await crossfitDatabase.executionDrafts.add(free);

    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Para borrar")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, eliminar" }));

    await waitFor(() => expect(screen.getByText("Todavía no hay registros")).toBeDefined());
    await expect(crossfitDatabase.executionDrafts.count()).resolves.toBe(0);
  });

  it("synchronizes a pending draft from the records list", async () => {
    const free = addDraftBlock(
      createFreeTrainingDraft("Sincronizable", "2026-10-22"),
      blockTypes[1]!.id,
      "Fuerza",
    );
    await crossfitDatabase.executionDrafts.add(free);
    const fetchMock = vi.fn().mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: free.id,
              revision: 1,
              status: "draft",
              updatedAt: "2026-10-22T10:05:00.000Z",
              result: "persisted",
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ entries: blockTypes }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Sincronizable")).toBeDefined());

    fireEvent.click(await screen.findByRole("button", { name: "Sincronizar Sincronizable" }));

    await waitFor(() => expect(screen.getByText("Sincronizado")).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/session-executions/${free.id}`),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("disables synchronization for a draft without blocks", async () => {
    const free = createFreeTrainingDraft("Vacío", "2026-10-22");
    await crossfitDatabase.executionDrafts.add(free);

    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Vacío")).toBeDefined());

    const button = await screen.findByRole("button", { name: "Sincronizar Vacío" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("adds catalogue movements and stores their series in the draft", async () => {
    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Todavía no hay registros")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Nuevo entrenamiento libre" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Fuerza libre" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear y editar" }));
    expect(await screen.findByRole("heading", { name: "Fuerza libre" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Añadir bloque" }));

    const picker = await screen.findByLabelText("Movimiento para el bloque 1");
    fireEvent.change(picker, { target: { value: powerCleanId } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir movimiento al bloque 1" }));

    expect(await screen.findByText("Series de Power clean")).toBeDefined();
    expect(screen.getByText("Sin series registradas.")).toBeDefined();
    expect(screen.getByText("Movimientos")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Añadir primera serie" }));
    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));
    const repetitions = screen.getByLabelText("Repeticiones de la serie 1 de Power clean");
    fireEvent.change(repetitions, { target: { value: "3" } });
    fireEvent.blur(repetitions);
    const weight = screen.getByLabelText("Peso usado en la serie 1 de Power clean");
    fireEvent.change(weight, { target: { value: "80" } });
    fireEvent.blur(weight);

    await waitFor(async () => {
      const [stored] = await crossfitDatabase.executionDrafts.toArray();
      expect(stored?.snapshot.blocks[0]?.attempts).toEqual([
        expect.objectContaining({
          movementId: powerCleanId,
          position: 1,
          status: "completed",
          repetitions: 3,
          weight: { amount: 80, unit: "kg" },
        }),
      ]);
    });
    expect(screen.getByText("1 serie · 3 repeticiones · Volumen 240 kg")).toBeDefined();
  });

  it("hides movement series when the block is marked without metrics", async () => {
    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Todavía no hay registros")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Nuevo entrenamiento libre" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Fuerza libre" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear y editar" }));
    expect(await screen.findByRole("heading", { name: "Fuerza libre" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Añadir bloque" }));

    const picker = await screen.findByLabelText("Movimiento para el bloque 1");
    fireEvent.change(picker, { target: { value: powerCleanId } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir movimiento al bloque 1" }));
    expect(await screen.findByText("Series de Power clean")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Realizado" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "Sin métricas" }));

    expect(
      screen.getByText(
        "Bloque sin métricas: las series no se guardarán al sincronizar.",
      ),
    ).toBeDefined();
    expect(screen.queryByText("Series de Power clean")).toBeNull();
  });

  it("removes a movement and its series after confirmation", async () => {
    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Todavía no hay registros")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Nuevo entrenamiento libre" }));
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Fuerza libre" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear y editar" }));
    expect(await screen.findByRole("heading", { name: "Fuerza libre" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Añadir bloque" }));

    const picker = await screen.findByLabelText("Movimiento para el bloque 1");
    fireEvent.change(picker, { target: { value: powerCleanId } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir movimiento al bloque 1" }));
    expect(await screen.findByText("Series de Power clean")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Quitar Power clean del bloque 1" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(screen.getByText("Series de Power clean")).toBeDefined();

    fireEvent.click(
      screen.getByRole("button", { name: "Quitar Power clean del bloque 1" }),
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "Confirmar quitar Power clean del bloque 1",
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("Añade un movimiento para registrar sus series."),
      ).toBeDefined(),
    );
    await waitFor(async () => {
      const [stored] = await crossfitDatabase.executionDrafts.toArray();
      expect(stored?.snapshot.blocks[0]?.attempts).toBeUndefined();
    });
  });

  it("synchronizes movement series and shows them read-only", async () => {
    const base = addDraftBlock(
      createFreeTrainingDraft("Fuerza libre", "2026-10-22"),
      blockTypes[1]!.id,
      "Fuerza",
    );
    const blockId = base.snapshot.blocks[0]!.id;
    const draft = updateDraftBlock(base, blockId, {
      status: "completed",
      movements: [powerCleanId],
      attempts: [
        {
          id: "019b4e0a-0000-7000-8000-000000000071",
          movementId: powerCleanId,
          position: 1,
          status: "completed",
          repetitions: 3,
          weight: { amount: 80, unit: "kg" },
        },
      ],
    });
    await crossfitDatabase.executionDrafts.add(draft);

    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return jsonResponse({
          id: draft.id,
          revision: 1,
          status: "draft",
          updatedAt: "2026-10-22T10:05:00.000Z",
          result: "persisted",
        });
      }
      const url = typeof input === "string" ? input : input.toString();
      return jsonResponse(
        url.includes("/catalog/movements") ? { movements } : { entries: blockTypes },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ExecutionRecordsScreen onOpenPlannedDraft={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("Fuerza libre")).toBeDefined());

    fireEvent.click(await screen.findByRole("button", { name: "Sincronizar Fuerza libre" }));
    await waitFor(() => expect(screen.getByText("Sincronizado")).toBeDefined());

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
    const body = JSON.parse(String(put?.[1]?.body)) as {
      blocks: Array<{ movements?: string[]; attempts?: Array<Record<string, unknown>> }>;
    };
    expect(body.blocks[0]).not.toHaveProperty("movements");
    expect(body.blocks[0]?.attempts).toEqual([
      expect.objectContaining({
        movementId: powerCleanId,
        repetitions: 3,
        weight: { amount: 80, unit: "kg" },
      }),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Editar" }));
    expect(await screen.findByText("Series de Power clean")).toBeDefined();
    expect(screen.getByText("80 kg × 3 reps")).toBeDefined();
    expect(
      screen.queryByLabelText("Repeticiones de la serie 1 de Power clean"),
    ).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Editar series de Power clean" }));
    expect(
      screen.getByLabelText("Repeticiones de la serie 1 de Power clean"),
    ).toBeDefined();
  });
});
