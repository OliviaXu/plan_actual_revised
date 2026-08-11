import type { CalendarInsertEvent } from "../calendar/calendar-event";
import type { Result } from "../shared/result";
import { sendRuntimeMessage } from "../shared/runtime-messages";

export const runtimeCalendarEventClient = {
  requestInteractiveToken: () => sendRuntimeMessageWithBoundaryError(
    () => sendRuntimeMessage({ type: "auth.requestInteractiveToken" }),
  ),
  listCalendarEvents: () => sendRuntimeMessageWithBoundaryError(
    () => sendRuntimeMessage({ type: "calendar.listEvents" }),
  ),
  listCalendarEventsForDate: (date: string, timeZone: string) =>
    sendRuntimeMessageWithBoundaryError(() => sendRuntimeMessage({
      type: "calendar.listEventsForDate",
      date,
      timeZone,
    })),
  insertCalendarEvent: (event: CalendarInsertEvent) =>
    sendRuntimeMessageWithBoundaryError(() => sendRuntimeMessage({
      type: "calendar.insertEvent",
      event,
    })),
};

async function sendRuntimeMessageWithBoundaryError<T>(
  send: () => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    return await send();
  } catch {
    return calendarBoundaryUnavailable();
  }
}

function calendarBoundaryUnavailable(): Result<never> {
  return {
    ok: false,
    error: {
      code: "CALENDAR_BOUNDARY_UNAVAILABLE",
      message: "Unable to reach the background Calendar boundary.",
    },
  };
}
