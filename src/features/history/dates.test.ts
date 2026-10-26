import { describe, expect, it } from "vitest";

import {
  formatDayLong,
  formatMonthTitle,
  isSameMonth,
  isToday,
  monthGrid,
  monthStartOf,
  shiftMonth,
} from "./dates";

describe("history dates", () => {
  it("finds the first day of the month", () => {
    expect(monthStartOf("2026-10-26")).toBe("2026-10-01");
  });

  it("moves across year boundaries", () => {
    expect(shiftMonth("2026-12-01", 1)).toBe("2027-01-01");
    expect(shiftMonth("2026-01-01", -1)).toBe("2025-12-01");
  });

  it("builds a Monday-first grid that covers the whole month", () => {
    const grid = monthGrid("2026-10-01");

    expect(grid[0]).toBe("2026-09-28");
    expect(grid.at(-1)).toBe("2026-11-01");
    expect(grid.length % 7).toBe(0);
    expect(grid).toContain("2026-10-01");
    expect(grid).toContain("2026-10-31");
  });

  it("keeps a short February grid to four weeks when it starts on Monday", () => {
    const grid = monthGrid("2027-02-01");

    expect(grid.length).toBe(28);
    expect(grid[0]).toBe("2027-02-01");
  });

  it("compares months and formats Spanish labels", () => {
    expect(isSameMonth("2026-10-31", "2026-10-01")).toBe(true);
    expect(isSameMonth("2026-11-01", "2026-10-01")).toBe(false);
    expect(formatMonthTitle("2026-10-01")).toMatch(/octubre.*2026/i);
    expect(formatDayLong("2026-10-01")).toMatch(/jueves.*1.*octubre/i);
  });

  it("detects today using local dates", () => {
    expect(isToday("2026-10-26", new Date(2026, 9, 26, 12))).toBe(true);
    expect(isToday("2026-10-25", new Date(2026, 9, 26, 12))).toBe(false);
  });
});
