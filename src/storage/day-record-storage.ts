import {
  normalizeDayRecord,
  type DayRecord,
} from "../domain/day-record";

export class DayRecordStorageError extends Error {
  constructor(
    public readonly code:
      | "DAY_RECORD_INVALID"
      | "DAY_RECORD_READ_FAILED"
      | "DAY_RECORD_WRITE_FAILED"
      | "DAY_RECORD_DELETE_FAILED",
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
      "Unable to load local changes.",
    );
  }

  const value = stored[key];
  if (value === undefined) return null;
  const record = normalizeDayRecord(value);
  if (!record || record.date !== date) {
    throw new DayRecordStorageError(
      "DAY_RECORD_INVALID",
      "Stored Actual/Revised blocks use an unsupported or invalid format.",
    );
  }
  return record;
}

export async function saveDayRecord(record: DayRecord): Promise<void> {
  try {
    await chrome.storage.local.set({
      [dayRecordStorageKey(record.date)]: record,
    });
  } catch {
    throw new DayRecordStorageError(
      "DAY_RECORD_WRITE_FAILED",
      "Unable to save local changes.",
    );
  }
}

export async function listDayRecords(): Promise<{
  records: DayRecord[];
  invalidKeys: string[];
}> {
  let stored: Record<string, unknown>;
  try {
    stored = await chrome.storage.local.get(null);
  } catch {
    throw new DayRecordStorageError(
      "DAY_RECORD_READ_FAILED",
      "Unable to load historical local changes.",
    );
  }

  const records: DayRecord[] = [];
  const invalidKeys: string[] = [];
  for (const [key, value] of Object.entries(stored)) {
    if (!key.startsWith("dayRecord:")) continue;
    const record = normalizeDayRecord(value);
    if (!record || key !== dayRecordStorageKey(record.date)) {
      invalidKeys.push(key);
      continue;
    }
    records.push(record);
  }
  return { records, invalidKeys };
}

export async function deleteDayRecord(date: string): Promise<void> {
  try {
    await chrome.storage.local.remove(dayRecordStorageKey(date));
  } catch {
    throw new DayRecordStorageError(
      "DAY_RECORD_DELETE_FAILED",
      "Unable to clean up historical local changes.",
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
