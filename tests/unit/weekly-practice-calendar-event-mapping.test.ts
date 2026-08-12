import { describe, expect, it } from "vitest";

import type { CalendarEvent } from "../../src/calendar/calendar-event";
import {
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

  it("lets Calendar assign a fresh ID to a private, free Monday practice", () => {
    expect(mapWeeklyPracticeToCalendarEvent({
      mondayDate: "2026-07-13",
      summary: "Practice concise writing",
    })).toEqual({
      summary: "Practice concise writing",
      start: { date: "2026-07-13" },
      end: { date: "2026-07-14" },
      colorId: "4",
      visibility: "private",
      transparency: "transparent",
      reminders: { useDefault: false },
    });
  });

  it("uses the first Monday color match as the canonical practice", () => {
    const events: CalendarEvent[] = [
      allDay("wrong-day", "Manual prior practice", "4", "2026-07-12"),
      allDay("manual", "Manual practice", "4", "2026-07-13"),
      allDay("parpractice20260713", "Extension practice", "9", "2026-07-13"),
    ];
    expect(findWeeklyPracticeCalendarEvent(events, "2026-07-13"))
      .toMatchObject({ id: "manual" });
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
