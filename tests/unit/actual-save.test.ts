import { describe, expect, it } from "vitest";

import { isExactPlanMatch } from "../../src/domain/actual-save";
import type { ActualBlock, DayRecord } from "../../src/domain/day-record";
import type { TimedCalendarEvent } from "../../src/calendar/calendar-event";

const record: DayRecord = {
  schemaVersion: 1,
  date: "2026-07-15",
  timezone: "America/Los_Angeles",
  actual: [],
  updatedAt: "2026-07-15T19:00:00.000Z",
};
const actual: ActualBlock = {
  id: "actual-1",
  summary: "Design review",
  startMinutes: 9 * 60,
  durationMinutes: 60,
  colorId: "9",
  saveDisposition: "unsaved",
};
const plan: TimedCalendarEvent = {
  kind: "timed",
  id: "plan-1",
  summary: "Design review",
  colorId: "9",
  start: "2026-07-15T09:00:00-07:00",
  end: "2026-07-15T10:00:00-07:00",
  timeZone: "America/Los_Angeles",
};

describe("isExactPlanMatch", () => {
  it("matches every Actual-representable field", () => {
    expect(isExactPlanMatch(actual, record, plan)).toBe(true);
  });

  it.each([
    ["summary", { summary: "Different" }],
    ["start", { start: "2026-07-15T09:05:00-07:00" }],
    ["duration", { end: "2026-07-15T10:05:00-07:00" }],
    ["color", { colorId: "8" }],
    ["timezone", { timeZone: "America/Denver" }],
    ["date", { start: "2026-07-16T09:00:00-07:00", end: "2026-07-16T10:00:00-07:00" }],
  ])("does not match when %s differs", (_field, change) => {
    expect(isExactPlanMatch(actual, record, { ...plan, ...change })).toBe(false);
  });

  it("does not treat an extension-owned Actual as a Plan match", () => {
    expect(
      isExactPlanMatch(actual, record, { ...plan, isExtensionActual: true }),
    ).toBe(false);
  });

  it("ignores a malformed Calendar timestamp", () => {
    expect(
      isExactPlanMatch(actual, record, { ...plan, start: "not-a-date" }),
    ).toBe(false);
  });
});
