import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../../src/calendar/calendar-event";
import {
  calendarEventIdForWeeklyPractice,
  findWeeklyPracticeCalendarEvent,
  getWeeklyPracticeMonday,
  isWeeklyPracticeVisible,
  mapWeeklyPracticeToCalendarEvent,
} from "../../src/calendar/calendar-event-mapping";

describe("Weekly practice Calendar mapping", () => {
  it.each([
    ["2026-07-13", "2026-07-13"],
    ["2026-07-15", "2026-07-13"],
    ["2026-07-17", "2026-07-13"],
  ])("maps workday %s to Monday %s", (date, monday) => {
    expect(getWeeklyPracticeMonday(date)).toBe(monday);
  });

  it.each([
    ["2026-07-13", true],
    ["2026-07-17", true],
    ["2026-07-18", false],
    ["2026-07-19", false],
  ])("reports visibility for %s", (date, visible) => {
    expect(isWeeklyPracticeVisible(date)).toBe(visible);
  });

  it("maps practice to a private, free, one-day Monday event", () => {
    expect(mapWeeklyPracticeToCalendarEvent({
      mondayDate: "2026-07-13",
      summary: "Practice concise writing",
    })).toEqual({
      id: "parpractice20260713",
      summary: "Practice concise writing",
      start: { date: "2026-07-13" },
      end: { date: "2026-07-14" },
      colorId: "4",
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: false },
    });
    expect(calendarEventIdForWeeklyPractice("2026-07-13")).toBe(
      "parpractice20260713",
    );
  });

  it("prefers the stable Monday ID, then the first Monday color match", () => {
    const events: CalendarEvent[] = [
      allDay("wrong-day", "Manual prior practice", "4", "2026-07-12"),
      allDay("manual", "Manual practice", "4", "2026-07-13"),
      allDay("parpractice20260713", "Extension practice", "9", "2026-07-13"),
    ];
    expect(findWeeklyPracticeCalendarEvent(events, "2026-07-13"))
      .toMatchObject({ id: "parpractice20260713" });
    expect(findWeeklyPracticeCalendarEvent(events.slice(0, 2), "2026-07-13"))
      .toMatchObject({ id: "manual" });
  });
});

function allDay(id: string, summary: string, colorId: string, startDate: string): CalendarEvent {
  return {
    kind: "allDay",
    id,
    summary,
    colorId,
    startDate,
    endDate: startDate === "2026-07-12" ? "2026-07-13" : "2026-07-14",
  };
}
