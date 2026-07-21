import {
  mapActualToCalendarEvent,
  type ActualCalendarEventInput,
} from "../calendar/actual-calendar-event";
import type {
  CalendarEvent,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import type { DayRecord } from "../domain/day-record";
import { isExactPlanMatch } from "../domain/actual-save";
import { toPlanEvents } from "../domain/plan-event";
import { defaultSettings } from "../domain/settings";
import type { Result } from "../shared/result";
import { sendRuntimeMessage } from "../shared/runtime-messages";

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
  const unsaved = record.actual.filter(
    (actual) => (actual.saveDisposition ?? "unsaved") === "unsaved",
  );
  if (unsaved.length === 0) {
    return { record, summary: "Nothing new to save" };
  }

  const planResponse = await listCalendarEvents();
  if (!planResponse.ok) {
    return {
      record,
      summary: `Failed ${unsaved.length}: ${planResponse.error.message}`,
    };
  }

  const planEvents = toPlanEvents(
    planResponse.value.events,
    record.date,
    record.timezone,
    defaultSettings.hiddenPlanColorIds,
  );
  let workingRecord = record;
  let savedCount = 0;
  let matchedCount = 0;
  let failedCount = 0;

  for (const actual of unsaved) {
    const attemptedAt = now().toISOString();
    if (planEvents.some((plan) => isExactPlanMatch(actual, plan))) {
      workingRecord = updateActual(
        workingRecord,
        actual.id,
        {
          saveDisposition: "planMatched",
          lastSaveAttemptAt: attemptedAt,
          lastSaveError: undefined,
        },
        attemptedAt,
      );
      await persistDayRecord(workingRecord);
      matchedCount += 1;
      continue;
    }

    const input: ActualCalendarEventInput = {
      actual,
      date: workingRecord.date,
      timezone: workingRecord.timezone,
      summaryPrefix: defaultSettings.actualEventPrefix,
      defaultColorId: defaultSettings.defaultActualColorId,
    };
    const response = await insertCalendarEvent(
      mapActualToCalendarEvent(input),
    );

    if (response.ok) {
      workingRecord = updateActual(
        workingRecord,
        actual.id,
        {
          saveDisposition: "calendarSaved",
          calendarEventId: response.value.eventId,
          lastSaveAttemptAt: attemptedAt,
          lastSaveError: undefined,
        },
        attemptedAt,
      );
      savedCount += 1;
    } else {
      workingRecord = updateActual(
        workingRecord,
        actual.id,
        {
          saveDisposition: "unsaved",
          lastSaveAttemptAt: attemptedAt,
          lastSaveError: response.error,
        },
        attemptedAt,
      );
      failedCount += 1;
    }
    await persistDayRecord(workingRecord);
  }

  const summaryParts = [];
  if (savedCount) summaryParts.push(`Saved ${savedCount}`);
  if (matchedCount) summaryParts.push(`${matchedCount} matched Plan`);
  if (failedCount) summaryParts.push(`Failed ${failedCount}`);

  return {
    record: workingRecord,
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

function updateActual(
  record: DayRecord,
  actualId: string,
  changes: Partial<DayRecord["actual"][number]>,
  updatedAt: string,
): DayRecord {
  return {
    ...record,
    actual: record.actual.map((actual) =>
      actual.id === actualId ? { ...actual, ...changes } : actual,
    ),
    updatedAt,
  };
}
