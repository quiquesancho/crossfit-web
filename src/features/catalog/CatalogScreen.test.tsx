import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

import { CatalogScreen } from "./CatalogScreen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CatalogScreen", () => {
  it("shows catalog entries and movements once loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        const body = url.endsWith("/catalogs/block-type")
          ? { entries: [{ id: "1", code: "wod", description: "Workout of the day" }] }
          : { movements: [{ code: "power-clean", name: "Power clean", familyCode: "clean" }] };
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      }),
    );

    render(<CatalogScreen />);

    expect(screen.getByText("Cargando…")).toBeDefined();
    await waitFor(() => expect(screen.getByText(/Power clean/)).toBeDefined());
    expect(screen.getByText(/Workout of the day/)).toBeDefined();
  });

  it("shows an error when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    render(<CatalogScreen />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
  });
});
