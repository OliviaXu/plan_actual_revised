import type {
  CalendarEvent,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import type { Result } from "../shared/result";
import { sendRuntimeMessage } from "../shared/runtime-messages";

export const runtimeCalendarEventClient = {
  listCalendarEvents: async (): Promise<
    Result<{ events: CalendarEvent[] }>
  > => {
    try {
      return await sendRuntimeMessage({ type: "calendar.listEvents" });
    } catch {
      return calendarBoundaryUnavailable();
    }
  },
  listCalendarEventsForDate: async (
    date: string,
    timeZone: string,
  ): Promise<Result<{ events: CalendarEvent[] }>> => {
    try {
      return await sendRuntimeMessage({
        type: "calendar.listEventsForDate",
        date,
        timeZone,
      });
    } catch {
      return calendarBoundaryUnavailable();
    }
  },
  insertCalendarEvent: async (
    event: CalendarInsertEvent,
  ): Promise<Result<{ eventId: string }>> => {
    try {
      return await sendRuntimeMessage({ type: "calendar.insertEvent", event });
    } catch {
      return calendarBoundaryUnavailable();
    }
  },
};

function calendarBoundaryUnavailable(): Result<never> {
  return {
    ok: false,
    error: {
      code: "CALENDAR_BOUNDARY_UNAVAILABLE",
      message: "Unable to reach the background Calendar boundary.",
    },
  };
}
