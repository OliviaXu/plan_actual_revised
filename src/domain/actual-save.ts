import type { TimedCalendarEvent } from "../calendar/calendar-event";
import type { ActualBlock, DayRecord } from "./day-record";
import { getCalendarTime } from "../calendar/calendar-time";

export function isExactPlanMatch(
  actual: ActualBlock,
  record: DayRecord,
  event: TimedCalendarEvent,
) {
  if (event.isExtensionActual) return false;
  const startTime = Date.parse(event.start);
  const endTime = Date.parse(event.end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return false;
  const start = getCalendarTime(startTime, record.timezone);
  const durationMinutes = (endTime - startTime) / 60_000;
  return (
    event.summary === actual.summary &&
    start.date === record.date &&
    start.minutesSinceMidnight === actual.startMinutes &&
    durationMinutes === actual.durationMinutes &&
    (event.colorId ?? "") === actual.colorId &&
    (event.timeZone ?? record.timezone) === record.timezone
  );
}
