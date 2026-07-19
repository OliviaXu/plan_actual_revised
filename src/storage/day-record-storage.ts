import { isDayRecord, type DayRecord } from "../domain/day-record";

export class DayRecordStorageError extends Error {
  constructor(
    public readonly code:
      | "DAY_RECORD_INVALID"
      | "DAY_RECORD_READ_FAILED"
      | "DAY_RECORD_WRITE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "DayRecordStorageError";
  }
}

export function dayRecordStorageKey(date: string) {
  return `dayRecord:${date}`;
}

export async function loadDayRecord(date: string): Promise<DayRecord | null> {
  const key = dayRecordStorageKey(date);
  let stored: Record<string, unknown>;
  try {
    stored = await chrome.storage.local.get(key);
  } catch {
    throw new DayRecordStorageError(
      "DAY_RECORD_READ_FAILED",
      "Unable to load Actuals from local storage.",
    );
  }

  const value = stored[key];
  if (value === undefined) return null;
  if (!isDayRecord(value) || value.date !== date) {
    throw new DayRecordStorageError(
      "DAY_RECORD_INVALID",
      "Stored Actuals use an unsupported or invalid format.",
    );
  }
  return value;
}

export async function saveDayRecord(record: DayRecord): Promise<void> {
  try {
    await chrome.storage.local.set({
      [dayRecordStorageKey(record.date)]: record,
    });
  } catch {
    throw new DayRecordStorageError(
      "DAY_RECORD_WRITE_FAILED",
      "Unable to save Actual locally.",
    );
  }
}

export function createDayRecordWriteQueue(
  write: (record: DayRecord) => Promise<void> = saveDayRecord,
) {
  let previousWrite: Promise<void> | undefined;

  return (record: DayRecord) => {
    const currentWrite = previousWrite
      ? previousWrite.catch(() => undefined).then(() => write(record))
      : write(record);
    previousWrite = currentWrite;
    return currentWrite;
  };
}
