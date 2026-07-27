import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DayRecordStorageError,
  createDayRecordWriteQueue,
  dayRecordStorageKey,
  deleteDayRecord,
  listDayRecords,
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
  const get = vi.fn(async (key: string | null) =>
    key === null ? { ...values } : { [key]: values[key] },
  );
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(values, items);
  });
  const remove = vi.fn(async (key: string) => {
    delete values[key];
  });
  vi.stubGlobal("chrome", { storage: { local: { get, set, remove } } });
  return { get, remove, set, values };
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

  it("round trips a Slack Actual in the existing record version", async () => {
    const storage = mockStorage();
    const slackRecord = {
      ...record,
      actual: [{ ...record.actual[0], isSlack: true as const }],
    };

    await saveDayRecord(slackRecord);

    await expect(loadDayRecord(slackRecord.date)).resolves.toEqual(
      slackRecord,
    );
    expect(storage.set).toHaveBeenCalledWith({
      "dayRecord:2026-07-15": slackRecord,
    });
  });

  it.each([
    { ...record, schemaVersion: 2 },
    { ...record, actual: [{ ...record.actual[0], durationMinutes: 0 }] },
    { ...record, actual: [{ ...record.actual[0], isSlack: false }] },
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

  it("lists valid daily records while isolating malformed day-record keys", async () => {
    const malformedKey = "dayRecord:2026-07-14";
    mockStorage({
      [malformedKey]: { ...record, date: "not-a-date" },
      [dayRecordStorageKey(record.date)]: record,
      "unrelated:key": { untouched: true },
    });

    await expect(listDayRecords()).resolves.toEqual({
      records: [record],
      invalidKeys: [malformedKey],
    });
  });

  it("does not mistake a failed inventory read for an empty inventory", async () => {
    const storage = mockStorage();
    storage.get.mockRejectedValueOnce(new Error("read unavailable"));

    await expect(listDayRecords()).rejects.toMatchObject({
      code: "DAY_RECORD_READ_FAILED",
    });
  });

  it("deletes only the requested daily record", async () => {
    const key = dayRecordStorageKey(record.date);
    const storage = mockStorage({ [key]: record, "unrelated:key": true });

    await deleteDayRecord(record.date);

    expect(storage.remove).toHaveBeenCalledWith(key);
    expect(storage.values).toEqual({ "unrelated:key": true });
  });

  it("surfaces failed deletes through the storage boundary", async () => {
    const storage = mockStorage();
    storage.remove.mockRejectedValueOnce(new Error("delete unavailable"));

    await expect(deleteDayRecord(record.date)).rejects.toMatchObject({
      code: "DAY_RECORD_DELETE_FAILED",
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
