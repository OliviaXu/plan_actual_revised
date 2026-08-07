import { describe, expect, it } from "vitest";

import { formatMinuteOfDay } from "../../src/app/format-time";

describe("formatMinuteOfDay", () => {
  it("formats minutes since midnight as a 12-hour clock time", () => {
    expect(formatMinuteOfDay(0)).toBe("12:00 AM");
    expect(formatMinuteOfDay(9 * 60 + 5)).toBe("9:05 AM");
    expect(formatMinuteOfDay(12 * 60)).toBe("12:00 PM");
    expect(formatMinuteOfDay(23 * 60 + 59)).toBe("11:59 PM");
  });
});
