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
      dateTime: localDateTime(input.date, input.block.startMinutes),
      timeZone: input.timezone,
    },
    end: {
      dateTime: localDateTime(
        input.date,
        input.block.startMinutes + input.block.durationMinutes,
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

function localDateTime(date: string, totalMinutes: number) {
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCMinutes(totalMinutes);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(base.getUTCDate()).padStart(2, "0")}T${String(base.getUTCHours()).padStart(2, "0")}:${String(base.getUTCMinutes()).padStart(2, "0")}:00`;
}
