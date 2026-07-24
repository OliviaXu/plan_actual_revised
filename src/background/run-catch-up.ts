import type {
  CalendarEvent,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
import { selectCatchUpRecords } from "../domain/catch-up";
import type { DayRecord } from "../domain/day-record";
import type { CatchUpRunResult } from "../shared/catch-up-run-result";
import type { Result } from "../shared/result";
import { syncDayActualsToCalendar } from "../workflows/sync-day-actuals-to-calendar";

export type CatchUpDependencies = {
  listDayRecords: () => Promise<{
    records: DayRecord[];
    invalidKeys: string[];
  }>;
  saveDayRecord: (record: DayRecord) => Promise<void>;
  deleteDayRecord: (date: string) => Promise<void>;
  listCalendarEvents: (
    record: DayRecord,
  ) => Promise<Result<{ events: CalendarEvent[] }>>;
  insertCalendarEvent: (
    event: CalendarInsertEvent,
  ) => Promise<Result<{ eventId: string }>>;
  now: () => Date;
};

export async function runCatchUp(
  today: string,
  dependencies: CatchUpDependencies,
): Promise<CatchUpRunResult> {
  const inventory = await dependencies.listDayRecords();
  const selection = selectCatchUpRecords(inventory.records, today);
  const summary: CatchUpRunResult = {
    affectedDayCount: 0,
    saved: 0,
    matched: 0,
    failed: 0,
    discarded: 0,
    invalidRecordCount: inventory.invalidKeys.length,
    storageErrorCount: 0,
  };

  for (const record of selection.deletable) {
    const deleted = await tryDeleteDayRecord(
      record.date,
      dependencies.deleteDayRecord,
    );
    if (!deleted) summary.storageErrorCount += 1;
  }

  const selectedRecords = [
    ...selection.retained.map((record) => ({ record, expired: false })),
    ...selection.expired.map((record) => ({ record, expired: true })),
  ];

  for (const { record, expired } of selectedRecords) {
    const unsaved = record.actual.filter(
      (actual) => (actual.saveDisposition ?? "unsaved") === "unsaved",
    );
    if (unsaved.length === 0) {
      const deleted = await tryDeleteDayRecord(
        record.date,
        dependencies.deleteDayRecord,
      );
      if (!deleted) summary.storageErrorCount += 1;
      continue;
    }

    summary.affectedDayCount += 1;
    let persistenceFailed = false;
    const result = await syncDayActualsToCalendar({
      record,
      now: dependencies.now,
      listCalendarEvents: () => dependencies.listCalendarEvents(record),
      insertCalendarEvent: dependencies.insertCalendarEvent,
      persistDayRecord: async (nextRecord) => {
        try {
          await dependencies.saveDayRecord(nextRecord);
        } catch {
          persistenceFailed = true;
          summary.storageErrorCount += 1;
        }
      },
    });
    summary.saved += result.saved;
    summary.matched += result.matched;
    if (result.status === "planLookupFailed") {
      summary.failed += result.failed;
      continue;
    }
    if (persistenceFailed) {
      summary.failed += result.failed;
      continue;
    }

    if (expired) {
      const deleted = await tryDeleteDayRecord(
        record.date,
        dependencies.deleteDayRecord,
      );
      if (!deleted) summary.storageErrorCount += 1;
      if (deleted) summary.discarded += result.failed;
      else summary.failed += result.failed;
    } else if (result.failed > 0) {
      summary.failed += result.failed;
    } else {
      const deleted = await tryDeleteDayRecord(
        record.date,
        dependencies.deleteDayRecord,
      );
      if (!deleted) summary.storageErrorCount += 1;
    }
  }

  return summary;
}

async function tryDeleteDayRecord(
  date: string,
  deleteDayRecord: (date: string) => Promise<void>,
) {
  try {
    await deleteDayRecord(date);
    return true;
  } catch {
    return false;
  }
}
