import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../../src/calendar/calendar-event";
import {
  mapDailyFocusToCalendarEvent,
  findDailyFocusCalendarEvent,
} from "../../src/calendar/calendar-event-mapping";

describe("Daily focus Calendar mapping", () => {
  it("lets Calendar assign a fresh ID to a committed focus", () => {
    expect(
      mapDailyFocusToCalendarEvent({
        date: "2026-07-15",
        summary: "Write the difficult proposal",
      }),
    ).toEqual({
      summary: "Write the difficult proposal",
      start: { date: "2026-07-15" },
      end: { date: "2026-07-16" },
      colorId: "5",
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: false },
    });
  });

  it("allows the domain color to be overridden", () => {
    expect(
      mapDailyFocusToCalendarEvent({
        date: "2026-07-15",
        summary: "Write the difficult proposal",
        dailyFocusColorId: "9",
      }),
    ).toMatchObject({ colorId: "9" });
  });

  it("uses the first configured-color all-day event as the canonical focus", () => {
    const events: CalendarEvent[] = [
      {
        kind: "allDay",
        id: "manual-focus",
        summary: "Manual focus",
        colorId: "5",
        startDate: "2026-07-15",
        endDate: "2026-07-16",
      },
      {
        kind: "allDay",
        id: "parfocus20260715",
        summary: "Extension focus",
        colorId: "9",
        startDate: "2026-07-15",
        endDate: "2026-07-16",
      },
    ];

    expect(findDailyFocusCalendarEvent(events, "2026-07-15"))
      .toMatchObject({ id: "manual-focus", summary: "Manual focus" });
  });

  it("uses only the first configured-color all-day event as fallback", () => {
    const events: CalendarEvent[] = [
      {
        kind: "timed",
        id: "timed-color-match",
        summary: "Timed",
        colorId: "5",
        start: "2026-07-15T09:00:00-07:00",
        end: "2026-07-15T10:00:00-07:00",
        timeZone: "America/Los_Angeles",
      },
      {
        kind: "allDay",
        id: "first-focus",
        summary: "First focus",
        colorId: "5",
        startDate: "2026-07-15",
        endDate: "2026-07-16",
      },
      {
        kind: "allDay",
        id: "ignored-focus",
        summary: "Ignored focus",
        colorId: "5",
        startDate: "2026-07-15",
        endDate: "2026-07-16",
      },
    ];

    expect(findDailyFocusCalendarEvent(events, "2026-07-15"))
      .toMatchObject({ id: "first-focus", summary: "First focus" });
  });

  it("allows the fallback identity color to be overridden", () => {
    const events: CalendarEvent[] = [{
      kind: "allDay",
      id: "configured-focus",
      summary: "Configured focus",
      colorId: "9",
      startDate: "2026-07-15",
      endDate: "2026-07-16",
    }];

    expect(findDailyFocusCalendarEvent(events, "2026-07-15", "9"))
      .toMatchObject({ id: "configured-focus" });
  });

  it("does not select a configured-color focus from another date", () => {
    const events: CalendarEvent[] = [{
      kind: "allDay",
      id: "prior-focus",
      summary: "Prior focus",
      colorId: "5",
      startDate: "2026-07-14",
      endDate: "2026-07-15",
    }];

    expect(findDailyFocusCalendarEvent(events, "2026-07-15")).toBeUndefined();
  });
});
