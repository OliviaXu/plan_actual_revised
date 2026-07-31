import { describe, expect, it, vi } from "vitest";

import type {
  ActualEvent,
  RevisedEvent,
} from "../../src/domain/day-event";
import type { DayRecord } from "../../src/domain/day-record";
import {
  appendEditableEvent,
  moveEditableEvent,
} from "../../src/domain/day-record-edit";

const actual: ActualEvent = {
  id: "actual",
  summary: "Actual",
  startMinutes: 600,
  durationMinutes: 30,
  colorId: "8",
  saveDisposition: "unsaved",
};

const revised: RevisedEvent = {
  id: "revised",
  summary: "Revised",
  startMinutes: 660,
  durationMinutes: 30,
  colorId: "9",
};

describe("appendEditableEvent", () => {
  it("creates the canonical day record when appending the first Actual", () => {
    expect(
      appendEditableEvent({
        record: undefined,
        day: {
          date: "2026-07-15",
          timeZone: "America/Los_Angeles",
        },
        addition: { column: "actual", event: actual },
        updatedAt: "2026-07-15T17:00:00.000Z",
      }),
    ).toEqual({
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [actual],
      revised: [],
      updatedAt: "2026-07-15T17:00:00.000Z",
    });
  });

  it("appends a Revised without changing existing Actuals", () => {
    const record: DayRecord = {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: [actual],
      revised: [],
      updatedAt: "2026-07-15T16:00:00.000Z",
    };

    expect(
      appendEditableEvent({
        record,
        day: {
          date: "2026-07-15",
          timeZone: "America/Los_Angeles",
        },
        addition: { column: "revised", event: revised },
        updatedAt: "2026-07-15T17:00:00.000Z",
      }),
    ).toEqual({
      ...record,
      actual: [actual],
      revised: [revised],
      updatedAt: "2026-07-15T17:00:00.000Z",
    });
  });
});

describe("moveEditableEvent", () => {
  function dayRecord(
    actualEvents: ActualEvent[] = [actual],
    revisedEvents: RevisedEvent[] = [revised],
  ): DayRecord {
    return {
      schemaVersion: 1,
      date: "2026-07-15",
      timezone: "America/Los_Angeles",
      actual: actualEvents,
      revised: revisedEvents,
      updatedAt: "2026-07-15T16:00:00.000Z",
    };
  }

  it.each([
    {
      name: "untouched unsaved",
      event: { ...actual, saveDisposition: "unsaved" } as ActualEvent,
      expectedId: "actual",
      expectedCreateCalls: 0,
    },
    {
      name: "plan-matched",
      event: {
        ...actual,
        saveDisposition: "planMatched",
        lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
      } as ActualEvent,
      expectedId: "actual",
      expectedCreateCalls: 0,
    },
    {
      name: "Calendar-saved",
      event: {
        ...actual,
        saveDisposition: "calendarSaved",
        calendarEventId: "calendar-event",
        lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
      } as ActualEvent,
      expectedId: "fresh-id",
      expectedCreateCalls: 1,
    },
    {
      name: "previously attempted unsaved",
      event: {
        ...actual,
        saveDisposition: "unsaved",
        lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
        lastSaveError: { code: "FAILED", message: "Ambiguous" },
      } as ActualEvent,
      expectedId: "fresh-id",
      expectedCreateCalls: 1,
    },
  ])(
    "moves a $name Actual to Revised with Calendar-safe identity",
    ({ event, expectedId, expectedCreateCalls }) => {
      const createId = vi.fn(() => "fresh-id");
      const moved = moveEditableEvent({
        record: dayRecord([{
          ...event,
          sourceCalendarEventId: "plan-source",
          isSlack: true,
        }], []),
        sourceColumn: "actual",
        sourceEventId: event.id,
        targetColumn: "revised",
        startMinutes: 720,
        updatedAt: "2026-07-15T17:00:00.000Z",
        createId,
      });

      expect(moved).toEqual({
        ...dayRecord([], []),
        actual: [],
        revised: [{
          id: expectedId,
          summary: "Actual",
          startMinutes: 720,
          durationMinutes: 30,
          colorId: "8",
          sourceCalendarEventId: "plan-source",
          isSlack: true,
        }],
        updatedAt: "2026-07-15T17:00:00.000Z",
      });
      expect(createId).toHaveBeenCalledTimes(expectedCreateCalls);
    },
  );

  it("moves Revised to Actual with the same identity and unsaved state", () => {
    const source: RevisedEvent = {
      ...revised,
      sourceCalendarEventId: "plan-source",
      isSlack: true,
    };

    expect(
      moveEditableEvent({
        record: dayRecord([], [source]),
        sourceColumn: "revised",
        sourceEventId: source.id,
        targetColumn: "actual",
        startMinutes: 735,
        updatedAt: "2026-07-15T17:00:00.000Z",
        createId: vi.fn(() => "unused-id"),
      }),
    ).toEqual({
      ...dayRecord([], []),
      actual: [{
        ...source,
        startMinutes: 735,
        saveDisposition: "unsaved",
      }],
      revised: [],
      updatedAt: "2026-07-15T17:00:00.000Z",
    });
  });

  it("repositions Revised in place without changing its identity", () => {
    const otherRevised: RevisedEvent = {
      ...revised,
      id: "other-revised",
      summary: "Other revised",
    };
    const moved = moveEditableEvent({
      record: dayRecord([], [revised, otherRevised]),
      sourceColumn: "revised",
      sourceEventId: revised.id,
      targetColumn: "revised",
      startMinutes: 750,
      updatedAt: "2026-07-15T17:00:00.000Z",
      createId: vi.fn(() => "unused-id"),
    });

    expect(moved?.revised).toEqual([
      otherRevised,
      { ...revised, startMinutes: 750 },
    ]);
    expect(moved?.updatedAt).toBe("2026-07-15T17:00:00.000Z");
  });

  it("repositions a Calendar-saved Actual as a fresh unsaved insert", () => {
    const source: ActualEvent = {
      ...actual,
      saveDisposition: "calendarSaved",
      calendarEventId: "calendar-event",
      lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
      sourceCalendarEventId: "plan-source",
    };

    expect(
      moveEditableEvent({
        record: dayRecord([source], []),
        sourceColumn: "actual",
        sourceEventId: source.id,
        targetColumn: "actual",
        startMinutes: 780,
        updatedAt: "2026-07-15T17:00:00.000Z",
        createId: () => "fresh-id",
      }),
    ).toEqual({
      ...dayRecord([], []),
      actual: [{
        id: "fresh-id",
        summary: "Actual",
        startMinutes: 780,
        durationMinutes: 30,
        colorId: "8",
        sourceCalendarEventId: "plan-source",
        isSlack: undefined,
        saveDisposition: "unsaved",
      }],
      revised: [],
      updatedAt: "2026-07-15T17:00:00.000Z",
    });
  });

  it("returns no record for a same-position drop or missing source", () => {
    const record = dayRecord();
    const common = {
      record,
      sourceColumn: "actual" as const,
      targetColumn: "actual" as const,
      startMinutes: actual.startMinutes,
      updatedAt: "2026-07-15T17:00:00.000Z",
      createId: vi.fn(() => "unused-id"),
    };

    expect(
      moveEditableEvent({ ...common, sourceEventId: actual.id }),
    ).toBeNull();
    expect(
      moveEditableEvent({ ...common, sourceEventId: "missing" }),
    ).toBeNull();
  });
});
