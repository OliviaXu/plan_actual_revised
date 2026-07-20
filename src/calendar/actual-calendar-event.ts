import { DateTime } from "luxon";

import type { ActualEvent } from "../domain/day-event";
import type { CalendarInsertEvent } from "./calendar-event";

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

function localDateTime(date: string, totalMinutes: number, timeZone: string) {
  return DateTime.fromISO(date, { zone: timeZone })
    .startOf("day")
    .plus({ minutes: totalMinutes })
    .toFormat("yyyy-MM-dd'T'HH:mm:ss");
}
