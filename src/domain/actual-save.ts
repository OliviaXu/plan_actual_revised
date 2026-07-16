import type { TimedCalendarEvent } from "../calendar/calendar-event";
import type { ActualBlock, DayRecord } from "./day-record";

export function isExactPlanMatch(
  actual: ActualBlock,
  record: DayRecord,
  event: TimedCalendarEvent,
) {
  if (event.isExtensionActual) return false;
  const startTime = Date.parse(event.start);
  const endTime = Date.parse(event.end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return false;
  const start = zonedParts(new Date(startTime), record.timezone);
  const durationMinutes = (endTime - startTime) / 60_000;
  return (
    event.summary === actual.summary &&
    start.date === record.date &&
    start.minutes === actual.startMinutes &&
    durationMinutes === actual.durationMinutes &&
    (event.colorId ?? "") === actual.colorId &&
    (event.timeZone ?? record.timezone) === record.timezone
  );
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const year = read("year");
  const month = read("month");
  const day = read("day");
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    minutes: read("hour") * 60 + read("minute"),
  };
}
