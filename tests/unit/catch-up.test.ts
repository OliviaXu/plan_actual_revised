import { describe, expect, it } from "vitest";

import { selectCatchUpRecords } from "../../src/domain/catch-up";
import type { DayRecord } from "../../src/domain/day-record";

function dayRecord(date: string, actualCount = 1): DayRecord {
  return {
    schemaVersion: 1,
    date,
    timezone: "America/Los_Angeles",
    actual: Array.from({ length: actualCount }, (_, index) => ({
      id: `${date}-${index}`,
      summary: "Historical Actual",
      startMinutes: 9 * 60,
      durationMinutes: 30,
      colorId: "8",
      saveDisposition: "unsaved",
    })),
    revised: [],
    updatedAt: `${date}T17:00:00.000Z`,
  };
}

describe("selectCatchUpRecords", () => {
  it("retains the two most recent nonempty prior records regardless of gaps", () => {
    const selection = selectCatchUpRecords(
      [
        dayRecord("2026-07-02"),
        dayRecord("2026-07-10"),
        dayRecord("2026-07-14"),
      ],
      "2026-07-15",
    );

    expect(selection.retained.map(({ date }) => date)).toEqual([
      "2026-07-14",
      "2026-07-10",
    ]);
    expect(selection.expired.map(({ date }) => date)).toEqual([
      "2026-07-02",
    ]);
  });

  it("selects deletable historical records without letting them occupy the window", () => {
    const selection = selectCatchUpRecords(
      [dayRecord("2026-07-12", 0), dayRecord("2026-07-13")],
      "2026-07-15",
    );

    expect(selection.deletable.map(({ date }) => date)).toEqual(["2026-07-12"]);
    expect(selection.retained.map(({ date }) => date)).toEqual([
      "2026-07-13",
    ]);
  });

  it("excludes today and future records from catch-up", () => {
    const selection = selectCatchUpRecords(
      [
        dayRecord("2026-07-14"),
        dayRecord("2026-07-15"),
        dayRecord("2026-07-16"),
      ],
      "2026-07-15",
    );

    expect(selection.retained.map(({ date }) => date)).toEqual([
      "2026-07-14",
    ]);
    expect(selection.ignored.map(({ date }) => date)).toEqual([
      "2026-07-15",
      "2026-07-16",
    ]);
  });
});
