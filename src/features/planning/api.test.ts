import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../shared/api/client";
import { fetchPlanningWeek } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("planning api", () => {
  it("requests a planning week from the versioned endpoint", async () => {
    const payload = { id: "week-id", weekStart: "2026-10-19", sessions: [] };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPlanningWeek("2026-10-19")).resolves.toEqual(payload);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/planning/weeks/2026-10-19",
      expect.objectContaining({ headers: { Accept: "application/json" } }),
    );
  });

  it("maps a missing planning week to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(fetchPlanningWeek("2026-10-26")).resolves.toBeNull();
  });

  it("preserves other API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const error = await fetchPlanningWeek("2026-10-19").catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(503);
  });
});
