import { describe, expect, it } from "vitest";

import type {
  AllDayCalendarEvent,
  CalendarEvent,
  TimedCalendarEvent,
} from "../../src/calendar/calendar-event";
import { mapCalendarEventsToPlanEvents } from "../../src/calendar/calendar-event-mapping";

const date = "2026-07-15";
const timeZone = "America/Los_Angeles";

function timedEvent(
  id: string,
  start: string,
  end: string,
  overrides: Partial<TimedCalendarEvent> = {},
): TimedCalendarEvent {
  return {
    kind: "timed",
    id,
    summary: id,
    colorId: "8",
    start,
    end,
    timeZone,
    ...overrides,
  };
}

describe("Calendar to Plan event mapping", () => {
  it("normalizes Calendar fields into the selected day's event shape", () => {
    expect(
      mapCalendarEventsToPlanEvents(
        [
          timedEvent(
            "design-review",
            "2026-07-15T09:00:00-07:00",
            "2026-07-15T10:00:00-07:00",
          ),
          timedEvent(
            "calendar-defaults",
            "2026-07-15T11:00:00-07:00",
            "2026-07-15T11:30:00-07:00",
            { summary: null, colorId: null },
          ),
        ],
        date,
        timeZone,
        [],
      ),
    ).toEqual([
      {
        id: "design-review",
        summary: "design-review",
        colorId: "8",
        startMinutes: 540,
        durationMinutes: 60,
      },
      {
        id: "calendar-defaults",
        summary: "",
        colorId: "",
        startMinutes: 660,
        durationMinutes: 30,
      },
    ]);
  });

  it("keeps only eligible timed Plan events", () => {
    const allDay: AllDayCalendarEvent = {
      kind: "allDay",
      id: "all-day",
      summary: "All day",
      colorId: "8",
      startDate: date,
      endDate: "2026-07-16",
    };
    const events: CalendarEvent[] = [
      allDay,
      timedEvent(
        "extension-actual",
        "2026-07-15T09:00:00-07:00",
        "2026-07-15T10:00:00-07:00",
        { isExtensionActual: true },
      ),
      timedEvent(
        "hidden",
        "2026-07-15T10:00:00-07:00",
        "2026-07-15T11:00:00-07:00",
        { colorId: "2" },
      ),
      timedEvent(
        "visible",
        "2026-07-15T11:00:00-07:00",
        "2026-07-15T12:00:00-07:00",
      ),
    ];

    expect(mapCalendarEventsToPlanEvents(events, date, timeZone, ["2"])).toEqual([
      {
        id: "visible",
        summary: "visible",
        colorId: "8",
        startMinutes: 660,
        durationMinutes: 60,
      },
    ]);
  });

  it("preserves full crossing-midnight intervals and rejects invalid ones", () => {
    expect(
      mapCalendarEventsToPlanEvents(
        [
          timedEvent(
            "from-yesterday",
            "2026-07-14T23:30:00-07:00",
            "2026-07-15T00:30:00-07:00",
          ),
          timedEvent(
            "into-tomorrow",
            "2026-07-15T23:30:00-07:00",
            "2026-07-16T00:30:00-07:00",
          ),
          timedEvent("malformed", "not-a-date", "still-not-a-date"),
          timedEvent(
            "zero",
            "2026-07-15T12:00:00-07:00",
            "2026-07-15T12:00:00-07:00",
          ),
          timedEvent(
            "sub-minute",
            "2026-07-15T12:00:10-07:00",
            "2026-07-15T12:00:50-07:00",
          ),
          timedEvent(
            "outside",
            "2026-07-16T09:00:00-07:00",
            "2026-07-16T10:00:00-07:00",
          ),
        ],
        date,
        timeZone,
        [],
      ),
    ).toEqual([
      {
        id: "from-yesterday",
        summary: "from-yesterday",
        colorId: "8",
        startMinutes: -30,
        durationMinutes: 60,
      },
      {
        id: "into-tomorrow",
        summary: "into-tomorrow",
        colorId: "8",
        startMinutes: 1_410,
        durationMinutes: 60,
      },
    ]);
  });

  it("drops Calendar timestamp seconds at the normalization boundary", () => {
    expect(
      mapCalendarEventsToPlanEvents(
        [
          timedEvent(
            "seconds",
            "2026-07-15T09:00:59-07:00",
            "2026-07-15T10:00:01-07:00",
          ),
        ],
        date,
        timeZone,
        [],
      ),
    ).toEqual([
      {
        id: "seconds",
        summary: "seconds",
        colorId: "8",
        startMinutes: 540,
        durationMinutes: 60,
      },
    ]);
  });
});
