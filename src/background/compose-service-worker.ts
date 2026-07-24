import type {
  CalendarEvent,
  CalendarEventRange,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import type { CalendarLoadStats } from "../calendar/google-calendar-client";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import { createCalendarOperations } from "./calendar-operations";
import { createCatchUpRequestHandler } from "./catch-up-request";
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

export function createServiceWorkerOperations(
  dependencies: ServiceWorkerDependencies,
  now: () => Date = () => new Date(),
  readBrowserTimezone: () => string = () =>
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  catchUpRunner: (
    today: string,
    dependencies: CatchUpDependencies,
  ) => Promise<CatchUpRunResult> = runCatchUp,
) {
  const calendarOperations = createCalendarOperations(
    dependencies,
    now,
    readBrowserTimezone,
  );
  const runCatchUpRequest = createCatchUpRequestHandler(
    {
      listDayRecords: dependencies.listDayRecords,
      saveDayRecord: dependencies.saveDayRecord,
      deleteDayRecord: dependencies.deleteDayRecord,
      now,
      listCalendarEvents: calendarOperations.listEventsForDayRecord,
      insertCalendarEvent: calendarOperations.insertEvent,
    },
    catchUpRunner,
  );

  return {
    openAppPage: dependencies.openAppPage,
    connectCalendar: () =>
      dependencies.requestInteractiveToken().then((result) =>
        result.ok
          ? { ok: true as const, value: { status: "connected" as const } }
          : result,
      ),
    listCurrentCalendarEvents: calendarOperations.listCurrentDayEvents,
    insertCalendarEvent: calendarOperations.insertEvent,
    runCatchUp: runCatchUpRequest,
  };
}
