import { buildMovedActual } from "./actual-event-edit";
import type {
  ActualEvent,
  EditableColumn,
  RevisedEvent,
} from "./day-event";
import type { DayRecord } from "./day-record";

export type EditableEventAddition =
  | { column: "actual"; event: ActualEvent }
  | { column: "revised"; event: RevisedEvent };

type EditableEventSource =
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

export function moveEditableEvent({
  record,
  sourceColumn,
  sourceEventId,
  targetColumn,
  startMinutes,
  updatedAt,
  createId,
}: {
  record: DayRecord;
  sourceColumn: EditableColumn;
  sourceEventId: string;
  targetColumn: EditableColumn;
  startMinutes: number;
  updatedAt: string;
  createId: () => string;
}): DayRecord | null {
  let source: EditableEventSource;
  if (sourceColumn === "actual") {
    const event = record.actual.find(
      (candidate) => candidate.id === sourceEventId,
    );
    if (!event) return null;
    source = { column: "actual", event };
  } else {
    const event = record.revised.find(
      (candidate) => candidate.id === sourceEventId,
    );
    if (!event) return null;
    source = { column: "revised", event };
  }

  if (
    source.column === targetColumn &&
    source.event.startMinutes === startMinutes
  ) {
    return null;
  }

  const recordWithoutSource: DayRecord =
    source.column === "actual"
      ? {
          ...record,
          actual: record.actual.filter(
            (event) => event.id !== sourceEventId,
          ),
        }
      : {
          ...record,
          revised: record.revised.filter(
            (event) => event.id !== sourceEventId,
          ),
        };

  if (targetColumn === "actual") {
    const movedActual: ActualEvent =
      source.column === "actual"
        ? buildMovedActual(source.event, startMinutes, createId)
        : {
            ...source.event,
            startMinutes,
            saveDisposition: "unsaved",
          };

    return {
      ...recordWithoutSource,
      actual: [...recordWithoutSource.actual, movedActual],
      updatedAt,
    };
  }

  let movedRevised: RevisedEvent;
  if (source.column === "revised") {
    movedRevised = { ...source.event, startMinutes };
  } else {
    const movedActual = buildMovedActual(
      source.event,
      startMinutes,
      createId,
    );
    movedRevised = {
      id: movedActual.id,
      summary: movedActual.summary,
      startMinutes,
      durationMinutes: movedActual.durationMinutes,
      colorId: movedActual.colorId,
      sourceCalendarEventId: movedActual.sourceCalendarEventId,
      isSlack: movedActual.isSlack,
    };
  }

  return {
    ...recordWithoutSource,
    revised: [...recordWithoutSource.revised, movedRevised],
    updatedAt,
  };
}
