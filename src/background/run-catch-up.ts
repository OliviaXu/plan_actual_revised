import type {
  CalendarEvent,
  CalendarInsertEvent,
} from "../calendar/calendar-event";
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
  let affectedDayCount = 0;
  let matched = 0;
  const invalidRecordCount = inventory.invalidKeys.length;
  let storageErrorCount = 0;
  const summary: CatchUpRunResult = {
    saved: 0,
    failed: 0,
    discarded: 0,
  };

  for (const record of selection.deletable) {
    const deleted = await tryDeleteDayRecord(
      record.date,
      dependencies.deleteDayRecord,
    );
    if (!deleted) storageErrorCount += 1;
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
      if (!deleted) storageErrorCount += 1;
      continue;
    }

    affectedDayCount += 1;
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
          storageErrorCount += 1;
        }
      },
    });
    summary.saved += result.saved;
    matched += result.matched;
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
      if (!deleted) storageErrorCount += 1;
      if (deleted) summary.discarded += result.failed;
      else summary.failed += result.failed;
    } else if (result.failed > 0) {
      summary.failed += result.failed;
    } else {
      const deleted = await tryDeleteDayRecord(
        record.date,
        dependencies.deleteDayRecord,
      );
      if (!deleted) storageErrorCount += 1;
    }
  }

  if (
    affectedDayCount ||
    matched ||
    invalidRecordCount ||
    storageErrorCount
  ) {
    console.info("calendar-catch-up-diagnostics", {
      affectedDayCount,
      matched,
      invalidRecordCount,
      storageErrorCount,
    });
  }
  return summary;
}

function selectCatchUpRecords(records: DayRecord[], today: string) {
  const historical = records.filter((record) => record.date < today);
  const nonempty = historical
    .filter((record) => record.actual.length > 0)
    .sort((left, right) => right.date.localeCompare(left.date));

  return {
    retained: nonempty.slice(0, 2),
    expired: nonempty.slice(2),
    deletable: historical.filter((record) => record.actual.length === 0),
  };
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
