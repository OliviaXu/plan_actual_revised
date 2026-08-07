import { describe, expect, it } from "vitest";

import {
  formatDurationMinutes,
  formatHourOfDay,
  formatMinuteOfDay,
  formatZonedTime,
} from "../../src/app/format-time";

describe("formatMinuteOfDay", () => {
  it("formats minutes since midnight as a 12-hour clock time", () => {
    expect(formatMinuteOfDay(0)).toBe("12:00 AM");
    expect(formatMinuteOfDay(9 * 60 + 5)).toBe("9:05 AM");
    expect(formatMinuteOfDay(12 * 60)).toBe("12:00 PM");
    expect(formatMinuteOfDay(23 * 60 + 59)).toBe("11:59 PM");
  });
});

describe("formatHourOfDay", () => {
  it("formats hour markers without minutes", () => {
    expect(formatHourOfDay(0)).toBe("12 AM");
    expect(formatHourOfDay(12)).toBe("12 PM");
    expect(formatHourOfDay(23)).toBe("11 PM");
    expect(formatHourOfDay(24)).toBe("12 AM");
  });
});

describe("formatDurationMinutes", () => {
  it("rounds and formats minute and hour durations", () => {
    expect(formatDurationMinutes(30.4)).toBe("30m");
    expect(formatDurationMinutes(60)).toBe("1h");
    expect(formatDurationMinutes(90)).toBe("1h 30m");
  });
});

describe("formatZonedTime", () => {
  it("formats an instant in the requested time zone", () => {
    expect(
      formatZonedTime(
        new Date("2026-07-15T01:05:00.000Z"),
        "Asia/Tokyo",
      ),
    ).toBe("10:05 AM");
  });
});
