import { describe, expect, it } from "vitest";

import { currentWeekStart, formatSessionDate, formatWeekRange, shiftWeek } from "./dates";

describe("planning dates", () => {
  it("finds Monday for the current local week", () => {
    expect(currentWeekStart(new Date(2026, 9, 21, 18))).toBe("2026-10-19");
  });

  it("moves by complete calendar weeks", () => {
    expect(shiftWeek("2026-10-19", -1)).toBe("2026-10-12");
    expect(shiftWeek("2026-10-19", 1)).toBe("2026-10-26");
  });

  it("formats week ranges and session dates in Spanish", () => {
    expect(formatWeekRange("2026-10-19")).toMatch(/19 oct.*25 oct/i);
    expect(formatSessionDate("2026-10-20")).toMatch(/martes.*20.*octubre/i);
  });
});
