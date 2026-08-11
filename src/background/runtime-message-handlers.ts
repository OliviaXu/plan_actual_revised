import type {
  CalendarEvent,
  CalendarEventRange,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import type { CalendarLoadStats } from "../calendar/google-calendar-client";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import { createCalendarClient } from "./calendar-client";
import {
  runCatchUp,
  type CatchUpDependencies,
} from "./run-catch-up";

type RuntimeMessageDependencies = Pick<
  CatchUpDependencies,
  "listDayRecords" | "saveDayRecord" | "deleteDayRecord"
> & {
  requestCachedToken: () => Promise<Result<string>>;
  requestInteractiveToken: () => Promise<Result<string>>;
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

type CatchUpRunner = (
  today: string,
  dependencies: CatchUpDependencies,
) => Promise<CatchUpRunResult>;

type RuntimeMessageHandlerOptions = {
  now?: () => Date;
  readBrowserTimezone?: () => string;
  catchUpRunner?: CatchUpRunner;
};

export function createRuntimeMessageHandlers(
  dependencies: RuntimeMessageDependencies,
  options: RuntimeMessageHandlerOptions = {},
) {
  const now = options.now ?? (() => new Date());
  const readBrowserTimezone = options.readBrowserTimezone ?? (() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone);
  const catchUpRunner = options.catchUpRunner ?? runCatchUp;
  const calendar = createCalendarClient(
    dependencies,
    now,
    readBrowserTimezone,
  );
  const catchUpDependencies: CatchUpDependencies = {
    listDayRecords: dependencies.listDayRecords,
    saveDayRecord: dependencies.saveDayRecord,
    deleteDayRecord: dependencies.deleteDayRecord,
    now,
    listCalendarEvents: (record) =>
      calendar.listEventsForDate(record.date, record.timezone),
    insertCalendarEvent: calendar.insertEvent,
  };
  let inFlightCatchUp: Promise<Result<CatchUpRunResult>> | undefined;

  function handleCatchUpRequest(todayDate: string) {
    if (!inFlightCatchUp) {
      const startedAt = performance.now();
      const catchUp = catchUpRunner(todayDate, catchUpDependencies)
        .then((summary) => {
          console.info("calendar-catch-up", {
            ok: true,
            ...summary,
            totalDurationMs: performance.now() - startedAt,
          });
          return { ok: true as const, value: summary };
        });
      const trackedCatchUp = catchUp.finally(() => {
        if (inFlightCatchUp === trackedCatchUp) {
          inFlightCatchUp = undefined;
        }
      });
      inFlightCatchUp = trackedCatchUp;
    }
    return inFlightCatchUp;
  }

  return {
    connectCalendar: () =>
      dependencies.requestInteractiveToken().then((result) =>
        result.ok
          ? { ok: true as const, value: { status: "connected" as const } }
          : result,
      ),
    listCurrentCalendarEvents: calendar.listCurrentDayEvents,
    listCalendarEventsForDate: calendar.listEventsForDate,
    insertCalendarEvent: calendar.insertEvent,
    runCatchUp: handleCatchUpRequest,
  };
}
