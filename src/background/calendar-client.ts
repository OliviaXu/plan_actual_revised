import type {
  CalendarEvent,
  CalendarEventRange,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import type { CalendarLoadStats } from "../calendar/google-calendar-client";
import type { Result } from "../shared/result";
import { getZonedDayRange, getZonedTime } from "../shared/zoned-time";

type CalendarClientDependencies = {
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
  ) => Promise<Result<void>>;
};

export type CurrentCalendarDayResult = Result<{
  events: CalendarEvent[];
  date: string;
  timeZone: string;
}>;

export function createCalendarClient(
  dependencies: CalendarClientDependencies,
  now: () => Date = () => new Date(),
  readBrowserTimezone: () => string = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  let inFlightRead: Promise<CurrentCalendarDayResult> | undefined;
  let primaryCalendarTimezone: string | undefined;

  return {
    listCurrentDayEvents,
    listEventsForDate,
    insertEvent,
  };

  async function listEventsForDate(date: string, timeZone: string) {
    const authResult = await dependencies.requestCachedToken();
    if (!authResult.ok) return authResult;
    const result = await listEventsForZonedDate(
      dependencies,
      authResult.value,
      date,
      timeZone,
    );
    return result.ok
      ? { ok: true as const, value: { events: result.value.events } }
      : result;
  }

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

  async function insertEvent(event: CalendarInsertEvent) {
    const authResult = await dependencies.requestCachedToken();
    if (!authResult.ok) {
      return {
        ok: false as const,
        error: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar before creating events.",
        },
      };
    }
    return dependencies.insertPrimaryCalendarEvent(authResult.value, event);
  }

}

function listEventsForZonedDate(
  dependencies: CalendarClientDependencies,
  token: string,
  date: string,
  timeZone: string,
) {
  const range = getZonedDayRange(date, timeZone);
  return dependencies.listPrimaryCalendarEvents(token, {
    timeMin: range.start.toISOString(),
    timeMax: range.end.toISOString(),
  });
}

async function loadCurrentCalendarDayEvents(
  dependencies: CalendarClientDependencies,
  requestedAt: Date,
  assumedTimezone: string,
): Promise<CurrentCalendarDayResult> {
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
  let result = await listEventsForZonedDate(
    dependencies,
    authResult.value,
    assumedDate,
    assumedTimezone,
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
    result = await listEventsForZonedDate(
      dependencies,
      authResult.value,
      calendarDate,
      result.value.timeZone,
    );
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
