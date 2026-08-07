import type {
  CalendarEvent,
  CalendarEventRange,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import type { CalendarLoadStats } from "../calendar/google-calendar-client";
import type { DayRecord } from "../domain/day-record";
import type { Result } from "../shared/result";
import { getZonedDayRange, getZonedTime } from "../shared/zoned-time";

type CalendarOperationsDependencies = {
  requestCachedToken: () => Promise<Result<string>>;
  listPrimaryCalendarEvents: (
    token: string,
    range: CalendarEventRange,
  ) => Promise<
    Result<{
      events: CalendarEvent[];
      stats?: CalendarLoadStats;
      timeZone: string;
    }>
  >;
  insertPrimaryCalendarEvent: (
    token: string,
    event: CalendarInsertEvent,
  ) => Promise<Result<{ eventId: string }>>;
};

export type CalendarResult = Result<{
  events: CalendarEvent[];
  date: string;
  timeZone: string;
}>;

export function createCalendarOperations(
  dependencies: CalendarOperationsDependencies,
  now: () => Date = () => new Date(),
  readBrowserTimezone: () => string = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  let inFlightRead: Promise<CalendarResult> | undefined;
  let primaryCalendarTimezone: string | undefined;

  return {
    listCurrentDayEvents,
    listEventsForDayRecord,
    insertEvent,
  };

  function listCurrentDayEvents() {
    if (!inFlightRead) {
      const requestedAt = now();
      const read = loadCurrentCalendarDayEvents(
        dependencies,
        requestedAt,
        primaryCalendarTimezone ?? readBrowserTimezone(),
      ).then((result) => {
        if (result.ok) primaryCalendarTimezone = result.value.timeZone;
        return result;
      });
      const trackedRead = read.finally(() => {
        if (inFlightRead === trackedRead) {
          inFlightRead = undefined;
        }
      });
      inFlightRead = trackedRead;
    }
    return inFlightRead;
  }

  async function listEventsForDayRecord(
    record: DayRecord,
  ): Promise<Result<{ events: CalendarEvent[] }>> {
    const authResult = await dependencies.requestCachedToken();
    if (!authResult.ok) {
      return {
        ok: false,
        error: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar before catching up Actuals.",
        },
      };
    }

    const range = getZonedDayRange(record.date, record.timezone);
    const result = await dependencies.listPrimaryCalendarEvents(
      authResult.value,
      {
        timeMin: range.start.toISOString(),
        timeMax: range.end.toISOString(),
      },
    );
    return result.ok
      ? { ok: true, value: { events: result.value.events } }
      : result;
  }

  async function insertEvent(event: CalendarInsertEvent) {
    const authResult = await dependencies.requestCachedToken();
    if (!authResult.ok) {
      return {
        ok: false as const,
        error: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar before saving Actuals.",
        },
      };
    }
    return dependencies.insertPrimaryCalendarEvent(authResult.value, event);
  }
}

async function loadCurrentCalendarDayEvents(
  dependencies: CalendarOperationsDependencies,
  requestedAt: Date,
  assumedTimezone: string,
): Promise<CalendarResult> {
  const startedAt = performance.now();
  const authResult = await dependencies.requestCachedToken();
  const cachedAuthDurationMs = performance.now() - startedAt;
  if (!authResult.ok) {
    const result = {
      ok: false as const,
      error: {
        code: "AUTH_NOT_CONNECTED",
        message: "Connect Calendar before requesting events.",
      },
    };
    console.info("calendar-plan-load", {
      ok: false,
      cachedAuthDurationMs,
      backgroundTotalDurationMs: performance.now() - startedAt,
    });
    return result;
  }

  const assumedDate = getZonedTime(requestedAt, assumedTimezone).date;
  const assumedDay = getZonedDayRange(assumedDate, assumedTimezone);
  const assumedRange: CalendarEventRange = {
    timeMin: assumedDay.start.toISOString(),
    timeMax: assumedDay.end.toISOString(),
  };
  let result = await dependencies.listPrimaryCalendarEvents(
    authResult.value,
    assumedRange,
  );
  if (!result.ok) {
    console.info("calendar-plan-load", {
      ok: false,
      cachedAuthDurationMs,
      backgroundTotalDurationMs: performance.now() - startedAt,
    });
    return result;
  }

  const calendarDate = getZonedTime(
    requestedAt,
    result.value.timeZone,
  ).date;
  const calendarDay = getZonedDayRange(calendarDate, result.value.timeZone);
  if (
    calendarDay.start.getTime() !== assumedDay.start.getTime() ||
    calendarDay.end.getTime() !== assumedDay.end.getTime()
  ) {
    result = await dependencies.listPrimaryCalendarEvents(authResult.value, {
      timeMin: calendarDay.start.toISOString(),
      timeMax: calendarDay.end.toISOString(),
    });
    if (!result.ok) return result;
  }

  console.info("calendar-plan-load", {
    ok: true,
    renderedTimedEventCount: result.value.events.filter(
      (event) => event.kind === "timed",
    ).length,
    ...result.value.stats,
    cachedAuthDurationMs,
    backgroundTotalDurationMs: performance.now() - startedAt,
  });
  return {
    ok: true,
    value: {
      events: result.value.events,
      date: calendarDate,
      timeZone: result.value.timeZone,
    },
  };
}
