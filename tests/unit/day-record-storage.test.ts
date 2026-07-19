import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DayRecordStorageError,
  createDayRecordWriteQueue,
  dayRecordStorageKey,
  loadDayRecord,
  saveDayRecord,
} from "../../src/storage/day-record-storage";
import type { DayRecord } from "../../src/domain/day-record";

const record: DayRecord = {
  schemaVersion: 1,
  date: "2026-07-15",
  timezone: "America/Los_Angeles",
  actual: [
    {
      id: "actual-1",
      summary: "Actual",
      startMinutes: 720,
      durationMinutes: 30,
      colorId: "8",
    },
  ],
  updatedAt: "2026-07-15T19:00:00.000Z",
};

function mockStorage(initial: Record<string, unknown> = {}) {
  const values = { ...initial };
  const get = vi.fn(async (key: string) => ({ [key]: values[key] }));
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(values, items);
  });
  vi.stubGlobal("chrome", { storage: { local: { get, set } } });
  return { get, set, values };
}

afterEach(() => vi.unstubAllGlobals());

describe("day record storage", () => {
  it("uses one namespaced key per local date", () => {
    expect(dayRecordStorageKey("2026-07-15")).toBe("dayRecord:2026-07-15");
  });

  it("returns null when the local date has no record", async () => {
    mockStorage();
    await expect(loadDayRecord("2026-07-15")).resolves.toBeNull();
  });

  it("round trips a valid version-one record", async () => {
    const storage = mockStorage();
    await saveDayRecord(record);
    await expect(loadDayRecord(record.date)).resolves.toEqual(record);
    expect(storage.set).toHaveBeenCalledWith({
      "dayRecord:2026-07-15": record,
    });
  });

  it.each([
    { ...record, schemaVersion: 2 },
    { ...record, actual: [{ ...record.actual[0], durationMinutes: 0 }] },
    { ...record, date: "July 15" },
  ])("rejects malformed or unsupported stored data without overwriting it", async (raw) => {
    const storage = mockStorage({ "dayRecord:2026-07-15": raw });
    await expect(loadDayRecord("2026-07-15")).rejects.toBeInstanceOf(
      DayRecordStorageError,
    );
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.values["dayRecord:2026-07-15"]).toEqual(raw);
  });

  it("normalizes Chrome storage read and write failures", async () => {
    const storage = mockStorage();
    storage.get.mockRejectedValueOnce(new Error("read unavailable"));
    await expect(loadDayRecord("2026-07-15")).rejects.toMatchObject({
      code: "DAY_RECORD_READ_FAILED",
    });

    storage.set.mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(saveDayRecord(record)).rejects.toMatchObject({
      code: "DAY_RECORD_WRITE_FAILED",
    });
  });

  it("serializes record writes and continues after a rejected write", async () => {
    let rejectFirstWrite: ((reason?: unknown) => void) | undefined;
    const write = vi.fn((nextRecord: DayRecord) => {
      if (nextRecord.updatedAt === "2026-07-15T19:01:00.000Z") {
        return new Promise<void>((_resolve, reject) => {
          rejectFirstWrite = reject;
        });
      }
      return Promise.resolve();
    });
    const enqueue = createDayRecordWriteQueue(write);
    const first = enqueue({
      ...record,
      updatedAt: "2026-07-15T19:01:00.000Z",
    });
    const secondRecord = {
      ...record,
      updatedAt: "2026-07-15T19:02:00.000Z",
    };
    const second = enqueue(secondRecord);

    expect(write).toHaveBeenCalledTimes(1);
    rejectFirstWrite?.(new Error("quota exceeded"));
    await expect(first).rejects.toThrow("quota exceeded");
    await expect(second).resolves.toBeUndefined();
    expect(write).toHaveBeenNthCalledWith(2, secondRecord);
  });
});
