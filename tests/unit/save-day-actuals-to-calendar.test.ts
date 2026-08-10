import { describe, expect, it, vi } from "vitest";

import { saveDayActualsToCalendar } from "../../src/workflows/save-day-actuals-to-calendar";
import type { CalendarEvent } from "../../src/calendar/calendar-event";
import { calendarEventIdForActual } from "../../src/calendar/calendar-event-mapping";
import type { ActualEvent } from "../../src/domain/day-event";
import type { DayRecord } from "../../src/domain/day-record";

const now = () => new Date("2026-07-15T19:00:00.000Z");

function actual(
  id: string,
  summary: string,
  startMinutes: number,
  saveDisposition: ActualEvent["saveDisposition"] = "unsaved",
): ActualEvent {
  return {
    id,
    summary,
    startMinutes,
    durationMinutes: 60,
    colorId: "9",
    saveDisposition,
  };
}

function dayRecord(actuals: ActualEvent[]): DayRecord {
  return {
    schemaVersion: 1,
    date: "2026-07-15",
    timezone: "America/Los_Angeles",
    actual: actuals,
    revised: [],
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

describe("saveDayActualsToCalendar workflow", () => {
  it("reconciles an existing deterministic Actual ID without another insert", async () => {
    const candidate = actual("candidate", "Calendar insert", 660);
    const calendarEventId = calendarEventIdForActual(candidate.id);
    const insertCalendarEvent = vi.fn();

    const result = await saveDayActualsToCalendar({
      record: dayRecord([candidate]),
      now,
      listCalendarEvents: vi.fn().mockResolvedValue({
        ok: true,
        value: {
          events: [{
            kind: "timed",
            id: calendarEventId,
            summary: "[Actual] Calendar insert",
            colorId: "9",
            start: "2026-07-15T11:00:00-07:00",
            end: "2026-07-15T12:00:00-07:00",
            timeZone: "America/Los_Angeles",
            isExtensionActual: true,
          }],
        },
      }),
      insertCalendarEvent,
      persistDayRecord: vi.fn(),
    });

    expect(result).toMatchObject({ saved: 1, matched: 0, failed: 0 });
    expect(result.record.actual[0]).toMatchObject({
      saveDisposition: "calendarSaved",
      calendarEventId,
    });
    expect(insertCalendarEvent).not.toHaveBeenCalled();
  });

  it("owns filtering, matching, insertion, and ordered per-block persistence", async () => {
    const record = dayRecord([
      actual("matched", "Plan match", 540),
      actual("saved", "Calendar insert", 660),
      actual("failed", "Failed insert", 780),
      actual("terminal", "Already saved", 840, "calendarSaved"),
    ]);
    const persisted: DayRecord[] = [];
    const listCalendarEvents = vi.fn().mockResolvedValue({
      ok: true,
      value: { events: [timedPlanEvent()] },
    });
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

    const result = await saveDayActualsToCalendar({
      record,
      now,
      listCalendarEvents,
      insertCalendarEvent,
      persistDayRecord: async (nextRecord) => {
        persisted.push(structuredClone(nextRecord));
      },
    });

    expect(listCalendarEvents).toHaveBeenCalledWith();
    expect(result).toMatchObject({
      status: "completed",
      saved: 1,
      matched: 1,
      failed: 1,
    });
    expect(insertCalendarEvent).toHaveBeenCalledTimes(2);
    expect(persisted.map((snapshot) =>
      snapshot.actual.map((event) => event.saveDisposition)
    )).toEqual([
      ["planMatched", "unsaved", "unsaved", "calendarSaved"],
      ["planMatched", "calendarSaved", "unsaved", "calendarSaved"],
      ["planMatched", "calendarSaved", "unsaved", "calendarSaved"],
    ]);
  });

  it.each([
    ["summary", { summary: "Different" }],
    ["start", { start: "2026-07-15T09:05:00-07:00" }],
    ["duration", { end: "2026-07-15T10:05:00-07:00" }],
    ["color", { colorId: "8" }],
  ])("inserts an Actual when the Plan %s differs", async (_field, change) => {
    const insertCalendarEvent = vi.fn().mockResolvedValue({
      ok: true,
      value: { eventId: "calendar-saved" },
    });

    const result = await saveDayActualsToCalendar({
      record: dayRecord([actual("candidate", "Plan match", 540)]),
      now,
      listCalendarEvents: vi.fn().mockResolvedValue({
        ok: true,
        value: { events: [{ ...timedPlanEvent(), ...change }] },
      }),
      insertCalendarEvent,
      persistDayRecord: vi.fn(),
    });

    expect(result).toMatchObject({ saved: 1, matched: 0 });
    expect(insertCalendarEvent).toHaveBeenCalledOnce();
  });

  it("preserves Revised blocks in every Calendar disposition snapshot", async () => {
    const record: DayRecord = {
      ...dayRecord([actual("saved", "Calendar insert", 660)]),
      revised: [{
        id: "revised-1",
        summary: "Revised plan",
        startMinutes: 780,
        durationMinutes: 30,
        colorId: "6",
        sourceCalendarEventId: "plan-1",
      }],
    };
    const persistDayRecord = vi.fn();

    await saveDayActualsToCalendar({
      record,
      now,
      listCalendarEvents: vi.fn().mockResolvedValue({
        ok: true,
        value: { events: [] },
      }),
      insertCalendarEvent: vi.fn().mockResolvedValue({
        ok: true,
        value: { eventId: "calendar-saved" },
      }),
      persistDayRecord,
    });

    expect(persistDayRecord).toHaveBeenCalledWith(
      expect.objectContaining({ revised: record.revised }),
    );
  });

  it("persists a Plan lookup failure on every eligible block", async () => {
    const record = dayRecord([
      actual("first", "First", 540),
      actual("second", "Second", 600),
    ]);
    const persisted: DayRecord[] = [];

    const result = await saveDayActualsToCalendar({
      record,
      now,
      listCalendarEvents: vi.fn().mockResolvedValue({
        ok: false,
        error: { code: "LIST_FAILED", message: "Calendar unavailable." },
      }),
      insertCalendarEvent: vi.fn(),
      persistDayRecord: async (nextRecord) => {
        persisted.push(structuredClone(nextRecord));
      },
    });

    expect(result).toMatchObject({
      status: "planLookupFailed",
      failed: 2,
      error: { code: "LIST_FAILED", message: "Calendar unavailable." },
    });
    expect(persisted).toHaveLength(2);
    expect(persisted[1]?.actual).toMatchObject([
      { lastSaveError: { code: "LIST_FAILED" } },
      { lastSaveError: { code: "LIST_FAILED" } },
    ]);
  });

  it("returns without Calendar or persistence work when the day has no unsaved blocks", async () => {
    const record = dayRecord([
      actual("saved", "Saved", 540, "calendarSaved"),
      actual("matched", "Matched", 600, "planMatched"),
    ]);
    const listCalendarEvents = vi.fn();
    const persistDayRecord = vi.fn();

    await expect(saveDayActualsToCalendar({
      record,
      now,
      listCalendarEvents,
      insertCalendarEvent: vi.fn(),
      persistDayRecord,
    })).resolves.toMatchObject({
      status: "nothingToSave",
      record,
      saved: 0,
      matched: 0,
      failed: 0,
    });
    expect(listCalendarEvents).not.toHaveBeenCalled();
    expect(persistDayRecord).not.toHaveBeenCalled();
  });

  it("uses the Slack prefix while keeping the standard Actual metadata", async () => {
    const slackActual = {
      ...actual("slack-intention", "Check release channel", 720),
      isSlack: true as const,
    };
    const insertCalendarEvent = vi.fn().mockResolvedValue({
      ok: true,
      value: { eventId: "calendar-slack-intention" },
    });

    await saveDayActualsToCalendar({
      record: dayRecord([slackActual]),
      now,
      listCalendarEvents: vi.fn().mockResolvedValue({
        ok: true,
        value: { events: [] },
      }),
      insertCalendarEvent,
      persistDayRecord: vi.fn(),
    });

    expect(insertCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: "[s] Check release channel",
        extendedProperties: {
          private: { planActualRevisedActual: "true" },
        },
      }),
    );
  });
});
