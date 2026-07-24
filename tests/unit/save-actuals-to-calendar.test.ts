import { describe, expect, it, vi } from "vitest";

import { saveActualsToCalendar } from "../../src/app/workflows/save-actuals-to-calendar";
import type { CalendarEvent } from "../../src/calendar/calendar-event";
import type { ActualEvent } from "../../src/domain/day-event";
import type { DayRecord } from "../../src/domain/day-record";

const now = () => new Date("2026-07-15T19:00:00.000Z");

function actual(
  id: string,
  summary: string,
  startMinutes: number,
): ActualEvent {
  return {
    id,
    summary,
    startMinutes,
    durationMinutes: 60,
    colorId: "9",
    saveDisposition: "unsaved",
  };
}

function dayRecord(actuals: ActualEvent[]): DayRecord {
  return {
    schemaVersion: 1,
    date: "2026-07-15",
    timezone: "America/Los_Angeles",
    actual: actuals,
    updatedAt: "2026-07-15T18:00:00.000Z",
  };
}

function timedPlanEvent(): CalendarEvent {
  return {
    kind: "timed",
    id: "plan-match",
    summary: "Plan match",
    colorId: "9",
    start: "2026-07-15T09:00:00-07:00",
    end: "2026-07-15T10:00:00-07:00",
    timeZone: "America/Los_Angeles",
  };
}

describe("saveActualsToCalendar", () => {
  it("persists an ordered snapshot after every match, insert, and failure", async () => {
    const record = dayRecord([
      actual("matched", "Plan match", 540),
      actual("saved", "Calendar insert", 660),
      actual("failed", "Failed insert", 780),
    ]);
    const persisted: DayRecord[] = [];
    const insertCalendarEvent = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        value: { eventId: "calendar-saved" },
      })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "INSERT_FAILED", message: "Response lost." },
      });

    const result = await saveActualsToCalendar({
      record,
      now,
      listCalendarEvents: vi.fn().mockResolvedValue({
        ok: true,
        value: { events: [timedPlanEvent()] },
      }),
      insertCalendarEvent,
      persistDayRecord: async (nextRecord) => {
        persisted.push(structuredClone(nextRecord));
      },
    });

    expect(result.summary).toBe("Saved 1, 1 matched Plan, Failed 1");
    expect(insertCalendarEvent).toHaveBeenCalledTimes(2);
    expect(
      persisted.map((snapshot) =>
        snapshot.actual.map((event) => event.saveDisposition),
      ),
    ).toEqual([
      ["planMatched", "unsaved", "unsaved"],
      ["planMatched", "calendarSaved", "unsaved"],
      ["planMatched", "calendarSaved", "unsaved"],
    ]);
    expect(result.record.actual).toMatchObject([
      { id: "matched", saveDisposition: "planMatched" },
      {
        id: "saved",
        saveDisposition: "calendarSaved",
        calendarEventId: "calendar-saved",
      },
      {
        id: "failed",
        saveDisposition: "unsaved",
        lastSaveError: { code: "INSERT_FAILED", message: "Response lost." },
      },
    ]);
  });

  it("reports a Plan refresh failure after persisting its attempt details", async () => {
    const record = dayRecord([actual("unsaved", "Unsaved", 540)]);
    const persistDayRecord = vi.fn();

    const result = await saveActualsToCalendar({
      record,
      now,
      listCalendarEvents: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "LIST_FAILED", message: "Calendar unavailable." },
      }),
      insertCalendarEvent: vi.fn(),
      persistDayRecord,
    });

    expect(result).toMatchObject({
      record: {
        actual: [{
          id: "unsaved",
          saveDisposition: "unsaved",
          lastSaveError: {
            code: "LIST_FAILED",
            message: "Calendar unavailable.",
          },
        }],
      },
      summary: "Failed 1: Calendar unavailable.",
    });
    expect(persistDayRecord).toHaveBeenCalledOnce();
  });
});
