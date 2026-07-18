import { DateTime } from "luxon";

import type { ActualBlock } from "../domain/day-record";
import type { CalendarInsertEvent } from "./calendar-event";

export type CalendarActualInput = {
  block: ActualBlock;
  date: string;
  timezone: string;
  summaryPrefix: string;
  defaultColorId: string;
};

export function calendarEventIdForActual(blockId: string) {
  return `par${blockId.toLowerCase().replace(/-/g, "")}`;
}

export function mapActualToCalendarEvent(
  input: CalendarActualInput,
): CalendarInsertEvent {
  return {
    id: calendarEventIdForActual(input.block.id),
    summary: `${input.summaryPrefix} ${input.block.summary}`.trim(),
    start: {
      dateTime: localDateTime(
        input.date,
        input.block.startMinutes,
        input.timezone,
      ),
      timeZone: input.timezone,
    },
    end: {
      dateTime: localDateTime(
        input.date,
        input.block.startMinutes + input.block.durationMinutes,
        input.timezone,
      ),
      timeZone: input.timezone,
    },
    colorId: input.block.colorId || input.defaultColorId,
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
