import { isRecord } from "../shared/is-record";
import type {
  ActualEvent,
  EditableEvent,
  RevisedEvent,
} from "./day-event";

type StoredEditableEvent = EditableEvent &
  Partial<
    Pick<
      ActualEvent,
      | "saveDisposition"
      | "calendarEventId"
      | "lastSaveAttemptAt"
      | "lastSaveError"
    >
  >;

export type DayRecord = {
  schemaVersion: 1;
  date: string;
  timezone: string;
  actual: ActualEvent[];
  revised: RevisedEvent[];
  updatedAt: string;
};

export function normalizeDayRecord(value: unknown): DayRecord | null {
  if (!isRecord(value)) return null;
  const valid =
    value.schemaVersion === 1 &&
    isLocalDate(value.date) &&
    isTimeZone(value.timezone) &&
    Array.isArray(value.actual) &&
    value.actual.every(isActualEvent) &&
    (value.revised === undefined ||
      (Array.isArray(value.revised) &&
        value.revised.every(isRevisedEvent))) &&
    typeof value.updatedAt === "string" &&
    Number.isFinite(Date.parse(value.updatedAt));
  if (!valid) return null;

  return {
    ...value,
    revised: value.revised ?? [],
  } as DayRecord;
}

function isActualEvent(value: unknown): value is ActualEvent {
  if (!isEditableEvent(value)) return false;
  return (
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

function isRevisedEvent(value: unknown): value is RevisedEvent {
  return (
    isEditableEvent(value) &&
    value.saveDisposition === undefined &&
    value.calendarEventId === undefined &&
    value.lastSaveAttemptAt === undefined &&
    value.lastSaveError === undefined
  );
}

function isEditableEvent(value: unknown): value is StoredEditableEvent {
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
    (value.sourceCalendarEventId === undefined ||
      (typeof value.sourceCalendarEventId === "string" &&
        value.sourceCalendarEventId.length > 0)) &&
    (value.isSlack === undefined || value.isSlack === true)
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
