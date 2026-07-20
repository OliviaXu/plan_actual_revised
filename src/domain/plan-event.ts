import type { CalendarEvent } from "../calendar/calendar-event";
import {
  getCalendarDayRange,
  getCalendarTime,
} from "../calendar/calendar-time";
import type { PlanEvent } from "./day-event";

const MILLISECONDS_PER_MINUTE = 60_000;

export function toPlanEvents(
  events: CalendarEvent[],
  date: string,
  timeZone: string,
  hiddenColorIds: string[],
): PlanEvent[] {
  const day = getCalendarDayRange(date, timeZone);
  const dayStart = new Date(day.timeMin);
  const dayEnd = new Date(day.timeMax);

  return events.flatMap((event) => {
    if (
      event.kind !== "timed" ||
      event.isExtensionActual ||
      hiddenColorIds.includes(event.colorId ?? "")
    ) {
      return [];
    }

    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);
    const startTime = Math.floor(
      eventStart.getTime() / MILLISECONDS_PER_MINUTE,
    ) * MILLISECONDS_PER_MINUTE;
    const endTime = Math.floor(
      eventEnd.getTime() / MILLISECONDS_PER_MINUTE,
    ) * MILLISECONDS_PER_MINUTE;
    if (
      !Number.isFinite(startTime) ||
      !Number.isFinite(endTime) ||
      endTime <= startTime ||
      endTime <= dayStart.getTime() ||
      startTime >= dayEnd.getTime()
    ) {
      return [];
    }

    const start = getCalendarTime(startTime, timeZone);
    const dayOffset =
      (Date.parse(`${start.date}T00:00:00Z`) -
        Date.parse(`${date}T00:00:00Z`)) /
      (24 * 60 * MILLISECONDS_PER_MINUTE);

    return [{
      id: event.id,
      summary: event.summary ?? "",
      colorId: event.colorId ?? "",
      startMinutes:
        dayOffset * 24 * 60 + start.minutesSinceMidnight,
      durationMinutes: (endTime - startTime) / MILLISECONDS_PER_MINUTE,
    }];
  });
}
