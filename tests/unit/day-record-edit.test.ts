import { describe, expect, it } from "vitest";

import type {
  ActualEvent,
  RevisedEvent,
} from "../../src/domain/day-event";
import type { DayRecord } from "../../src/domain/day-record";
import { appendEditableEvent } from "../../src/domain/day-record-edit";

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
