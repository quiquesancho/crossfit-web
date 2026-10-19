import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchCatalogEntries, fetchMovements } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("catalog api", () => {
  it("requests catalog entries from the versioned endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ entries: [{ id: "1", code: "wod", description: "Workout of the day" }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchCatalogEntries("block-type");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/catalogs/block-type",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(result.entries).toHaveLength(1);
  });

  it("requests the movement catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          movements: [
            {
              id: "019b4e0a-0000-7000-8000-000000000010",
              code: "power-clean",
              name: "Power clean",
              familyCode: "clean",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMovements();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/catalog/movements",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
    expect(result.movements[0]?.name).toBe("Power clean");
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));

    await expect(fetchMovements()).rejects.toThrow("503");
  });
});
