import {
  mapActualToCalendarEvent,
  type ActualCalendarEventInput,
  mapCalendarEventsToPlanEvents,
} from "../calendar/calendar-event-mapping";
import type {
  CalendarEvent,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import { defaultSettings } from "../config/settings";
import type { ActualEvent, PlanEvent, SaveError } from "../domain/day-event";
import type { DayRecord } from "../domain/day-record";
import type { Result } from "../shared/result";

export type SaveDayActualsResult = {
  record: DayRecord;
  status: "nothingToSave" | "planLookupFailed" | "completed";
  saved: number;
  matched: number;
  failed: number;
  error?: SaveError;
};

type SaveDayActualsInput = {
  record: DayRecord;
  now: () => Date;
  persistDayRecord: (record: DayRecord) => Promise<void>;
  listCalendarEvents: () => Promise<Result<{ events: CalendarEvent[] }>>;
  insertCalendarEvent: (
    event: CalendarInsertEvent,
  ) => Promise<Result<{ eventId: string }>>;
};

export async function saveDayActualsToCalendar({
  record,
  now,
  persistDayRecord,
  listCalendarEvents,
  insertCalendarEvent,
}: SaveDayActualsInput): Promise<SaveDayActualsResult> {
  const unsaved = record.actual.filter(
    (actual) => (actual.saveDisposition ?? "unsaved") === "unsaved",
  );
  if (unsaved.length === 0) {
    return {
      record,
      status: "nothingToSave",
      saved: 0,
      matched: 0,
      failed: 0,
    };
  }

  const planResponse = await listCalendarEvents();
  if (!planResponse.ok) {
    let workingRecord = record;
    for (const actual of unsaved) {
      const attemptedAt = now().toISOString();
      workingRecord = updateActual(
        workingRecord,
        actual.id,
        {
          saveDisposition: "unsaved",
          lastSaveAttemptAt: attemptedAt,
          lastSaveError: planResponse.error,
        },
        attemptedAt,
      );
      await persistDayRecord(workingRecord);
    }
    return {
      record: workingRecord,
      status: "planLookupFailed",
      saved: 0,
      matched: 0,
      failed: unsaved.length,
      error: planResponse.error,
    };
  }

  const planEvents = mapCalendarEventsToPlanEvents(
    planResponse.value.events,
    record.date,
    record.timezone,
    defaultSettings.hiddenPlanColorIds,
  );
  let workingRecord = record;
  let saved = 0;
  let matched = 0;
  let failed = 0;

  for (const actual of unsaved) {
    const attemptedAt = now().toISOString();
    if (planEvents.some((plan) => hasMatchingPlanFields(actual, plan))) {
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
      matched += 1;
    } else {
      const input: ActualCalendarEventInput = {
        actual,
        date: record.date,
        timezone: record.timezone,
        summaryPrefix: actual.isSlack
          ? defaultSettings.slackEventPrefix
          : defaultSettings.actualEventPrefix,
        defaultColorId: defaultSettings.defaultActualColorId,
      };
      const insertResponse = await insertCalendarEvent(
        mapActualToCalendarEvent(input),
      );
      if (insertResponse.ok) {
        workingRecord = updateActual(
          workingRecord,
          actual.id,
          {
            saveDisposition: "calendarSaved",
            calendarEventId: insertResponse.value.eventId,
            lastSaveAttemptAt: attemptedAt,
            lastSaveError: undefined,
          },
          attemptedAt,
        );
        saved += 1;
      } else {
        workingRecord = updateActual(
          workingRecord,
          actual.id,
          {
            saveDisposition: "unsaved",
            lastSaveAttemptAt: attemptedAt,
            lastSaveError: insertResponse.error,
          },
          attemptedAt,
        );
        failed += 1;
      }
    }
    await persistDayRecord(workingRecord);
  }

  return {
    record: workingRecord,
    status: "completed",
    saved,
    matched,
    failed,
  };
}

function hasMatchingPlanFields(actual: ActualEvent, plan: PlanEvent) {
  return (
    plan.summary === actual.summary &&
    plan.startMinutes === actual.startMinutes &&
    plan.durationMinutes === actual.durationMinutes &&
    plan.colorId === actual.colorId
  );
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
