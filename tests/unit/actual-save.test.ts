import { describe, expect, it } from "vitest";

import { isExactPlanMatch } from "../../src/domain/actual-save";
import type { ActualEvent, PlanEvent } from "../../src/domain/day-event";

const actual: ActualEvent = {
  id: "actual-1",
  summary: "Design review",
  startMinutes: 9 * 60,
  durationMinutes: 60,
  colorId: "9",
  saveDisposition: "unsaved",
};
const plan: PlanEvent = {
  id: "plan-1",
  summary: "Design review",
  colorId: "9",
  startMinutes: 9 * 60,
  durationMinutes: 60,
};

describe("isExactPlanMatch", () => {
  it("best-effort matches the shared day-event fields", () => {
    expect(isExactPlanMatch(actual, plan)).toBe(true);
  });

  it.each([
    ["summary", { summary: "Different" }],
    ["start", { startMinutes: 9 * 60 + 5 }],
    ["duration", { durationMinutes: 65 }],
    ["color", { colorId: "8" }],
  ])("does not match when %s differs", (_field, change) => {
    expect(isExactPlanMatch(actual, { ...plan, ...change })).toBe(false);
  });

  it("does not match only the visible portion of a crossing-midnight Plan", () => {
    expect(
      isExactPlanMatch(
        { ...actual, startMinutes: 23 * 60 + 30, durationMinutes: 30 },
        { ...plan, startMinutes: 23 * 60 + 30, durationMinutes: 60 },
      ),
    ).toBe(false);
  });
});
