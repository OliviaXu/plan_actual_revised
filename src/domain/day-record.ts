import { isRecord } from "../shared/is-record";
import type { ActualEvent } from "./day-event";

export type DayRecord = {
  schemaVersion: 1;
  date: string;
  timezone: string;
  actual: ActualEvent[];
  updatedAt: string;
};

export function isDayRecord(value: unknown): value is DayRecord {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    isLocalDate(value.date) &&
    isTimeZone(value.timezone) &&
    Array.isArray(value.actual) &&
    value.actual.every(isActualEvent) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt))
  );
}

function isActualEvent(value: unknown): value is ActualEvent {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.summary === "string" &&
    Number.isInteger(value.startMinutes) &&
    (value.startMinutes as number) >= 0 &&
    (value.startMinutes as number) < 24 * 60 &&
    Number.isInteger(value.durationMinutes) &&
    (value.durationMinutes as number) > 0 &&
    typeof value.colorId === "string" &&
    (value.isSlack === undefined || value.isSlack === true) &&
    (value.saveDisposition === undefined ||
      value.saveDisposition === "unsaved" ||
      value.saveDisposition === "calendarSaved" ||
      value.saveDisposition === "planMatched") &&
    (value.calendarEventId === undefined ||
      typeof value.calendarEventId === "string") &&
    (value.lastSaveAttemptAt === undefined ||
      (typeof value.lastSaveAttemptAt === "string" &&
        Number.isFinite(Date.parse(value.lastSaveAttemptAt)))) &&
    (value.lastSaveError === undefined || isSaveError(value.lastSaveError))
  );
}

function isSaveError(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

function isLocalDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
