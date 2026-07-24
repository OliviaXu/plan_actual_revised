import type {
  CalendarEvent,
  CalendarInsertEvent,
} from "../../calendar/calendar-event";
import type { DayRecord } from "../../domain/day-record";
import type { Result } from "../../shared/result";
import { sendRuntimeMessage } from "../../shared/runtime-messages";
import { syncDayActualsToCalendar } from "../../workflows/sync-day-actuals-to-calendar";

type CalendarEventClient = {
  listCalendarEvents: () => Promise<Result<{ events: CalendarEvent[] }>>;
  insertCalendarEvent: (
    event: CalendarInsertEvent,
  ) => Promise<Result<{ eventId: string }>>;
};

type SaveActualsToCalendarInput = CalendarEventClient & {
  record: DayRecord;
  now: () => Date;
  persistDayRecord: (record: DayRecord) => Promise<void>;
};

export async function saveActualsToCalendar({
  record,
  now,
  persistDayRecord,
  listCalendarEvents,
  insertCalendarEvent,
}: SaveActualsToCalendarInput): Promise<{
  record: DayRecord;
  summary: string;
}> {
  const result = await syncDayActualsToCalendar({
    record,
    now,
    persistDayRecord,
    listCalendarEvents,
    insertCalendarEvent,
  });
  if (result.status === "nothingToSync") {
    return { record: result.record, summary: "Nothing new to save" };
  }
  if (result.status === "planLookupFailed") {
    return {
      record: result.record,
      summary: `Failed ${result.failed}: ${result.error?.message ?? "Unable to load Calendar."}`,
    };
  }

  const summaryParts = [];
  if (result.saved) summaryParts.push(`Saved ${result.saved}`);
  if (result.matched) summaryParts.push(`${result.matched} matched Plan`);
  if (result.failed) summaryParts.push(`Failed ${result.failed}`);

  return {
    record: result.record,
    summary: summaryParts.join(", ") || "Nothing new to save",
  };
}

export const runtimeCalendarEventClient: CalendarEventClient = {
  listCalendarEvents: async () => {
    try {
      return await sendRuntimeMessage({ type: "calendar.listEvents" });
    } catch {
      return calendarBoundaryUnavailable();
    }
  },
  insertCalendarEvent: async (event) => {
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
