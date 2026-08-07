import { describe, expect, it } from "vitest";
import * as zonedTime from "../../src/shared/zoned-time";

import {
  getZonedDayRange,
  getZonedTime,
} from "../../src/shared/zoned-time";

describe("Zoned time", () => {
  it("derives local date, clock fields, and minutes since midnight", () => {
    expect(
      getZonedTime(
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
    expect(zonedTime).not.toHaveProperty("getCalendarTime");
  });

  it("builds a Calendar-local day range from an instant's local date", () => {
    const instant = new Date("2026-07-15T01:00:00.000Z");
    const timeZone = "Asia/Tokyo";

    expect(
      getZonedDayRange(getZonedTime(instant, timeZone).date, timeZone),
    ).toEqual({
      start: new Date("2026-07-14T15:00:00.000Z"),
      end: new Date("2026-07-15T15:00:00.000Z"),
    });
  });

  it("preserves a known local date in UTC+14", () => {
    expect(getZonedDayRange("2026-07-15", "Pacific/Kiritimati")).toEqual({
      start: new Date("2026-07-14T10:00:00.000Z"),
      end: new Date("2026-07-15T10:00:00.000Z"),
    });
  });

  it("uses DST-aware day boundaries", () => {
    expect(
      getZonedDayRange("2026-03-08", "America/Los_Angeles"),
    ).toEqual({
      start: new Date("2026-03-08T08:00:00.000Z"),
      end: new Date("2026-03-09T07:00:00.000Z"),
    });
  });
});
