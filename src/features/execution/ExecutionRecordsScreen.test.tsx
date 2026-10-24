import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlannedSession } from "../planning/api";
import { crossfitDatabase } from "./database";
import { createExecutionDraft, createFreeTrainingDraft } from "./drafts";
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
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ entries: blockTypes }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
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
});
