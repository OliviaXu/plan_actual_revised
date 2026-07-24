import type { Result } from "../shared/result";
import type {
  CalendarEvent,
  CalendarEventRange,
} from "../calendar/calendar-event";
import type { CalendarLoadStats } from "../calendar/google-calendar-client";
import type { CalendarInsertEvent } from "../calendar/calendar-event";
import type { RuntimeMessage } from "../shared/runtime-messages";
import {
  getCalendarDayRange,
  getCalendarTime,
} from "../calendar/calendar-time";
import type { DayRecord } from "../domain/day-record";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import {
  runCatchUp,
  type CatchUpDependencies,
} from "./run-catch-up";

type ServiceWorkerDependencies = Pick<
  CatchUpDependencies,
  "listDayRecords" | "saveDayRecord" | "deleteDayRecord"
> & {
  openAppPage: () => Promise<unknown>;
  requestCachedToken: () => Promise<Result<string>>;
  requestInteractiveToken: () => Promise<Result<string>>;
  listPrimaryCalendarEvents: (
    token: string,
    range: CalendarEventRange,
  ) => Promise<Result<{
    events: CalendarEvent[];
    stats?: CalendarLoadStats;
    timeZone: string;
  }>>;
  insertPrimaryCalendarEvent: (
    token: string,
    event: CalendarInsertEvent,
  ) => Promise<Result<{ eventId: string }>>;
};

type CalendarResult = Result<{
  events: CalendarEvent[];
  date: string;
  timeZone: string;
}>;

export default function registerServiceWorker(
  dependencies: ServiceWorkerDependencies,
  now: () => Date = () => new Date(),
  readBrowserTimezone: () => string = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  catchUpRunner: (
    today: string,
    dependencies: CatchUpDependencies,
  ) => Promise<CatchUpRunResult> = runCatchUp,
) {
  let inFlightRead: Promise<CalendarResult> | undefined;
  let inFlightCatchUp: Promise<Result<CatchUpRunResult>> | undefined;
  let primaryCalendarTimezone: string | undefined;
  chrome.action.onClicked.addListener(() => {
    void dependencies.openAppPage();
  });

  chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
    if (message?.type === "auth.requestInteractiveToken") {
      void dependencies.requestInteractiveToken().then((result) => {
        sendResponse(
          result.ok
            ? { ok: true, value: { status: "connected" } }
            : result,
        );
      });
      return true;
    }

    if (message?.type === "calendar.listEvents") {
      if (!inFlightRead) {
        const requestedAt = now();
        inFlightRead = loadCurrentCalendarDayEvents(
          dependencies,
          requestedAt,
          primaryCalendarTimezone ?? readBrowserTimezone(),
        ).then((result) => {
          if (result.ok) primaryCalendarTimezone = result.value.timeZone;
          return result;
        });
        void inFlightRead.finally(() => {
          inFlightRead = undefined;
        });
      }
      void inFlightRead.then(sendResponse);
      return true;
    }

    if (message?.type === "calendar.insertEvent") {
      void insertEvent(dependencies, message.event).then(sendResponse);
      return true;
    }

    if (message?.type === "catchUp.run") {
      if (!inFlightCatchUp) {
        const startedAt = performance.now();
        const catchUp = catchUpRunner(
          message.todayDate,
          {
            listDayRecords: dependencies.listDayRecords,
            saveDayRecord: dependencies.saveDayRecord,
            deleteDayRecord: dependencies.deleteDayRecord,
            now,
            listCalendarEvents: (record) =>
              listCalendarEventsForDayRecord(dependencies, record),
            insertCalendarEvent: (event) => insertEvent(dependencies, event),
          },
        )
          .then((summary) => {
            console.info("calendar-catch-up", {
              ok: true,
              ...summary,
              totalDurationMs: performance.now() - startedAt,
            });
            return { ok: true as const, value: summary };
          })
          .catch(() => {
            console.info("calendar-catch-up", {
              ok: false,
              totalDurationMs: performance.now() - startedAt,
            });
            return {
              ok: false as const,
              error: {
                code: "CATCH_UP_FAILED",
                message: "Unable to catch up historical Actuals.",
              },
            };
          });
        inFlightCatchUp = catchUp;
        void catchUp.finally(() => {
          if (inFlightCatchUp === catchUp) {
            inFlightCatchUp = undefined;
          }
        });
      }
      void inFlightCatchUp.then(sendResponse);
      return true;
    }

    return false;
  });
}

async function listCalendarEventsForDayRecord(
  dependencies: ServiceWorkerDependencies,
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

  const range = getCalendarDayRange(record.date, record.timezone);
  const result = await dependencies.listPrimaryCalendarEvents(
    authResult.value,
    { timeMin: range.timeMin, timeMax: range.timeMax },
  );
  return result.ok
    ? { ok: true, value: { events: result.value.events } }
    : result;
}

async function insertEvent(
  dependencies: ServiceWorkerDependencies,
  event: CalendarInsertEvent,
) {
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

async function loadCurrentCalendarDayEvents(
  dependencies: ServiceWorkerDependencies,
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

  const assumedDay = getCalendarDayRange(
    getCalendarTime(requestedAt, assumedTimezone).date,
    assumedTimezone,
  );
  const assumedRange: CalendarEventRange = {
    timeMin: assumedDay.timeMin,
    timeMax: assumedDay.timeMax,
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

  const calendarDay = getCalendarDayRange(
    getCalendarTime(requestedAt, result.value.timeZone).date,
    result.value.timeZone,
  );
  if (
    calendarDay.timeMin !== assumedDay.timeMin ||
    calendarDay.timeMax !== assumedDay.timeMax
  ) {
    result = await dependencies.listPrimaryCalendarEvents(authResult.value, {
      timeMin: calendarDay.timeMin,
      timeMax: calendarDay.timeMax,
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
      date: calendarDay.date,
      timeZone: result.value.timeZone,
    },
  };
}
