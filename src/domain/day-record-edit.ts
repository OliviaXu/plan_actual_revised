import type { ActualEvent, RevisedEvent } from "./day-event";
import type { DayRecord } from "./day-record";

export type EditableEventAddition =
  | { column: "actual"; event: ActualEvent }
  | { column: "revised"; event: RevisedEvent };

export function appendEditableEvent({
  record,
  day,
  addition,
  updatedAt,
}: {
  record: DayRecord | null | undefined;
  day: {
    date: string;
    timeZone: string;
  };
  addition: EditableEventAddition;
  updatedAt: string;
}): DayRecord {
  const currentRecord: DayRecord = record ?? {
    schemaVersion: 1,
    date: day.date,
    timezone: day.timeZone,
    actual: [],
    revised: [],
    updatedAt,
  };

  if (addition.column === "actual") {
    return {
      ...currentRecord,
      actual: [...currentRecord.actual, addition.event],
      updatedAt,
    };
  }

  return {
    ...currentRecord,
    revised: [...currentRecord.revised, addition.event],
    updatedAt,
  };
}
