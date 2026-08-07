import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CalendarEvent,
  CalendarInsertEvent,
} from "../../src/calendar/calendar-event";
import type { ActualEvent } from "../../src/domain/day-event";
import type { DayRecord } from "../../src/domain/day-record";
import {
  runCatchUp,
  type CatchUpDependencies,
} from "../../src/background/run-catch-up";
import type { CatchUpRunResult } from "../../src/shared/catch-up-run-result";

const today = "2026-07-15";
const now = () => new Date("2026-07-15T19:00:00.000Z");

afterEach(() => vi.restoreAllMocks());

function actual(
  id: string,
  saveDisposition: ActualEvent["saveDisposition"] = "unsaved",
): ActualEvent {
  return {
    id,
    summary: id,
    startMinutes: 9 * 60,
    durationMinutes: 30,
    colorId: "8",
    saveDisposition,
  };
}

function record(date: string, actuals: ActualEvent[]): DayRecord {
  return {
    schemaVersion: 1,
    date,
    timezone: "America/Los_Angeles",
    actual: actuals,
    revised: [],
    updatedAt: `${date}T18:00:00.000Z`,
  };
}

function dependencies(records: DayRecord[]) {
  const listDayRecords = vi.fn<CatchUpDependencies["listDayRecords"]>(
    async () => ({ records, invalidKeys: [] }),
  );
  const saveDayRecord = vi.fn<CatchUpDependencies["saveDayRecord"]>(
    async () => undefined,
  );
  const deleteDayRecord = vi.fn<CatchUpDependencies["deleteDayRecord"]>(
    async () => undefined,
  );
  const listCalendarEvents = vi.fn<
    CatchUpDependencies["listCalendarEvents"]
  >(async () => ({
    ok: true,
    value: { events: [] as CalendarEvent[] },
  }));
  const insertCalendarEvent = vi.fn<
    CatchUpDependencies["insertCalendarEvent"]
  >(async (event: CalendarInsertEvent) => ({
    ok: true,
    value: { eventId: event.id },
  }));
  return {
    listDayRecords,
    saveDayRecord,
    deleteDayRecord,
    listCalendarEvents,
    insertCalendarEvent,
    now,
  };
}

describe("runCatchUp", () => {
  it("returns before Calendar work when there are no unsaved historical blocks", async () => {
    const empty = record("2026-07-13", []);
    const terminal = record("2026-07-14", [actual("saved", "calendarSaved")]);
    const current = record(today, [actual("today")]);
    const future = record("2026-07-16", [actual("future")]);
    const deps = dependencies([empty, terminal, current, future]);

    await expect(runCatchUp(today, deps)).resolves.toEqual({
      saved: 0,
      failed: 0,
      discarded: 0,
    });
    expect(deps.listCalendarEvents).not.toHaveBeenCalled();
    expect(deps.insertCalendarEvent).not.toHaveBeenCalled();
    expect(deps.deleteDayRecord.mock.calls).toEqual([
      ["2026-07-13"],
      ["2026-07-14"],
    ]);
  });

  it("saves, matches, and persists each retained block outcome immediately", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const historical = record("2026-07-14", [
      actual("matching"),
      actual("inserting"),
      actual("already-saved", "calendarSaved"),
      actual("already-matched", "planMatched"),
    ]);
    const deps = dependencies([historical]);
    deps.listCalendarEvents.mockResolvedValueOnce({
      ok: true,
      value: {
        events: [{
          kind: "timed",
          id: "plan-match",
          summary: "matching",
          colorId: "8",
          start: "2026-07-14T09:00:00-07:00",
          end: "2026-07-14T09:30:00-07:00",
          timeZone: "America/Los_Angeles",
        }],
      },
    });

    const result = await runCatchUp(today, deps);

    expect(result).toEqual({
      saved: 1,
      failed: 0,
      discarded: 0,
    });
    expect(info).toHaveBeenCalledWith("calendar-catch-up-diagnostics", {
      affectedDayCount: 1,
      matched: 1,
      invalidRecordCount: 0,
      storageErrorCount: 0,
    });
    expect(deps.listCalendarEvents).toHaveBeenCalledOnce();
    expect(deps.insertCalendarEvent).toHaveBeenCalledOnce();
    expect(deps.saveDayRecord.mock.calls.map(([saved]) =>
      saved.actual.map((event: ActualEvent) => event.saveDisposition)
    )).toEqual([
      ["planMatched", "unsaved", "calendarSaved", "planMatched"],
      ["planMatched", "calendarSaved", "calendarSaved", "planMatched"],
    ]);
    expect(deps.deleteDayRecord).toHaveBeenCalledWith("2026-07-14");
  });

  it("keeps a retained insert failure pending with normalized attempt details", async () => {
    const historical = record("2026-07-14", [actual("pending")]);
    const deps = dependencies([historical]);
    deps.insertCalendarEvent.mockResolvedValueOnce({
      ok: false,
      error: { code: "CALENDAR_INSERT_FAILED", message: "Response lost." },
    });

    await expect(runCatchUp(today, deps)).resolves.toMatchObject({
      failed: 1,
      discarded: 0,
    });
    expect(deps.saveDayRecord).toHaveBeenCalledWith(expect.objectContaining({
      actual: [expect.objectContaining({
        id: "pending",
        saveDisposition: "unsaved",
        lastSaveAttemptAt: now().toISOString(),
        lastSaveError: {
          code: "CALENDAR_INSERT_FAILED",
          message: "Response lost.",
        },
      })],
    }));
    expect(deps.deleteDayRecord).not.toHaveBeenCalled();
  });

  it("retains an expired record when its historical Calendar read fails", async () => {
    const deps = dependencies([
      record("2026-07-14", [actual("recent-1")]),
      record("2026-07-13", [actual("recent-2")]),
      record("2026-07-12", [actual("expired")]),
    ]);
    deps.listCalendarEvents
      .mockResolvedValueOnce({ ok: true, value: { events: [] } })
      .mockResolvedValueOnce({ ok: true, value: { events: [] } })
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "AUTH_NOT_CONNECTED", message: "Connect Calendar." },
      });

    const result: CatchUpRunResult = await runCatchUp(today, deps);

    expect(result.failed).toBe(1);
    expect(result.discarded).toBe(0);
    expect(deps.deleteDayRecord).not.toHaveBeenCalledWith("2026-07-12");
    expect(deps.saveDayRecord).toHaveBeenCalledWith(expect.objectContaining({
      date: "2026-07-12",
      actual: [expect.objectContaining({
        lastSaveError: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar.",
        },
      })],
    }));
  });

  it("processes an expired block once, then deletes and counts a failed insert as discarded", async () => {
    const deps = dependencies([
      record("2026-07-14", [actual("recent-1")]),
      record("2026-07-13", [actual("recent-2")]),
      record("2026-07-12", [actual("expired")]),
    ]);
    deps.insertCalendarEvent.mockImplementation(async (event) =>
      event.summary.includes("expired")
        ? {
            ok: false as const,
            error: { code: "CALENDAR_INSERT_FAILED", message: "No response." },
          }
        : { ok: true as const, value: { eventId: event.id } },
    );

    const result = await runCatchUp(today, deps);

    expect(result).toMatchObject({ saved: 2, failed: 0, discarded: 1 });
    expect(deps.insertCalendarEvent).toHaveBeenCalledTimes(3);
    expect(deps.deleteDayRecord.mock.calls.filter(
      ([date]) => date === "2026-07-12",
    )).toHaveLength(1);
  });

  it("continues with other days after one day cannot complete", async () => {
    const deps = dependencies([
      record("2026-07-14", [actual("first")]),
      record("2026-07-13", [actual("second")]),
    ]);
    deps.listCalendarEvents
      .mockResolvedValueOnce({
        ok: false,
        error: { code: "CALENDAR_LIST_FAILED", message: "Rate limited." },
      })
      .mockResolvedValueOnce({ ok: true, value: { events: [] } });

    await expect(runCatchUp(today, deps)).resolves.toMatchObject({
      saved: 1,
      failed: 1,
    });
    expect(deps.listCalendarEvents).toHaveBeenCalledTimes(2);
    expect(deps.insertCalendarEvent).toHaveBeenCalledOnce();
  });

  it("logs invalid records without returning them or deleting them", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies([]);
    deps.listDayRecords.mockResolvedValueOnce({
      records: [],
      invalidKeys: ["dayRecord:invalid"],
    });

    const result = await runCatchUp(today, deps);

    expect(result).not.toHaveProperty("invalidRecordCount");
    expect(info).toHaveBeenCalledWith("calendar-catch-up-diagnostics", {
      affectedDayCount: 0,
      matched: 0,
      invalidRecordCount: 1,
      storageErrorCount: 0,
    });
    expect(deps.deleteDayRecord).not.toHaveBeenCalled();
  });

  it("logs a failed disposition write and preserves the record", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies([
      record("2026-07-14", [actual("saved-externally")]),
    ]);
    deps.saveDayRecord.mockRejectedValueOnce(new Error("write unavailable"));

    const result = await runCatchUp(today, deps);

    expect(result).toMatchObject({ saved: 1 });
    expect(result).not.toHaveProperty("storageErrorCount");
    expect(info).toHaveBeenCalledWith("calendar-catch-up-diagnostics", {
      affectedDayCount: 1,
      matched: 0,
      invalidRecordCount: 0,
      storageErrorCount: 1,
    });
    expect(deps.deleteDayRecord).not.toHaveBeenCalled();
  });

  it("logs a failed cleanup without claiming the record was removed", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const deps = dependencies([
      record("2026-07-14", [actual("terminal", "calendarSaved")]),
    ]);
    deps.deleteDayRecord.mockRejectedValueOnce(new Error("delete unavailable"));

    const result = await runCatchUp(today, deps);

    expect(result).not.toHaveProperty("storageErrorCount");
    expect(info).toHaveBeenCalledWith("calendar-catch-up-diagnostics", {
      affectedDayCount: 0,
      matched: 0,
      invalidRecordCount: 0,
      storageErrorCount: 1,
    });
  });
});
