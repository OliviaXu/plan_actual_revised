import { DateTime } from "luxon";

import type { ActualEvent, PlanEvent } from "../domain/day-event";
import { getZonedDayRange, getZonedTime } from "../shared/zoned-time";
import type { CalendarEvent, CalendarInsertEvent } from "./calendar-event";

const MILLISECONDS_PER_MINUTE = 60_000;

export type ActualCalendarEventInput = {
  actual: ActualEvent;
  date: string;
  timezone: string;
  summaryPrefix: string;
  defaultColorId: string;
};

export function calendarEventIdForActual(blockId: string) {
  return `par${blockId.toLowerCase().replace(/-/g, "")}`;
}

export function mapActualToCalendarEvent(
  input: ActualCalendarEventInput,
): CalendarInsertEvent {
  return {
    id: calendarEventIdForActual(input.actual.id),
    summary: `${input.summaryPrefix} ${input.actual.summary}`.trim(),
    start: {
      dateTime: localDateTime(
        input.date,
        input.actual.startMinutes,
        input.timezone,
      ),
      timeZone: input.timezone,
    },
    end: {
      dateTime: localDateTime(
        input.date,
        input.actual.startMinutes + input.actual.durationMinutes,
        input.timezone,
      ),
      timeZone: input.timezone,
    },
    colorId: input.actual.colorId || input.defaultColorId,
    attendees: [],
    reminders: { useDefault: false },
    extendedProperties: {
      private: { planActualRevisedActual: "true" },
    },
  };
}

export function mapCalendarEventsToPlanEvents(
  events: CalendarEvent[],
  date: string,
  timeZone: string,
  hiddenColorIds: string[],
): PlanEvent[] {
  const dayRange = getZonedDayRange(date, timeZone);

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
      endTime <= dayRange.start.getTime() ||
      startTime >= dayRange.end.getTime()
    ) {
      return [];
    }

    const start = getZonedTime(startTime, timeZone);
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

function localDateTime(date: string, totalMinutes: number, timeZone: string) {
  return DateTime.fromISO(date, { zone: timeZone })
    .startOf("day")
    .plus({ minutes: totalMinutes })
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");
}
