import { describe, expect, it } from "vitest";
import * as calendarTime from "../../src/calendar/calendar-time";

import {
  formatMinuteOfDay,
  getCalendarDayRange,
  getCalendarTime,
} from "../../src/calendar/calendar-time";

describe("Calendar time", () => {
  it("formats minutes since midnight as a 12-hour clock time", () => {
    expect(formatMinuteOfDay(0)).toBe("12:00 AM");
    expect(formatMinuteOfDay(9 * 60 + 5)).toBe("9:05 AM");
    expect(formatMinuteOfDay(12 * 60)).toBe("12:00 PM");
    expect(formatMinuteOfDay(23 * 60 + 59)).toBe("11:59 PM");
  });

  it("derives local date, clock fields, and minutes since midnight", () => {
    expect(
      getCalendarTime(
        new Date("2026-07-15T01:00:00.000Z"),
        "Asia/Tokyo",
      ),
    ).toEqual({
      date: "2026-07-15",
      hour: 10,
      minute: 0,
      minutesSinceMidnight: 600,
    });
  });

  it("does not hide the instant-to-local-date conversion behind a day-range wrapper", () => {
    expect(calendarTime).not.toHaveProperty("getCalendarDay");
  });

  it("builds a Calendar-local day range from an instant's local date", () => {
    const instant = new Date("2026-07-15T01:00:00.000Z");
    const timeZone = "Asia/Tokyo";

    expect(
      getCalendarDayRange(getCalendarTime(instant, timeZone).date, timeZone),
    ).toEqual({
      date: "2026-07-15",
      timeMin: "2026-07-14T15:00:00.000Z",
      timeMax: "2026-07-15T15:00:00.000Z",
    });
  });

  it("preserves a known Calendar date in UTC+14", () => {
    expect(getCalendarDayRange("2026-07-15", "Pacific/Kiritimati")).toEqual({
      date: "2026-07-15",
      timeMin: "2026-07-14T10:00:00.000Z",
      timeMax: "2026-07-15T10:00:00.000Z",
    });
  });

  it("uses DST-aware day boundaries", () => {
    expect(
      getCalendarDayRange("2026-03-08", "America/Los_Angeles"),
    ).toEqual({
      date: "2026-03-08",
      timeMin: "2026-03-08T08:00:00.000Z",
      timeMax: "2026-03-09T07:00:00.000Z",
    });
  });
});
