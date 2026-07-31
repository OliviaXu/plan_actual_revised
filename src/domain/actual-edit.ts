import type { ActualEvent } from "./day-event";

type ActualEditChanges = Pick<
  ActualEvent,
  "summary" | "durationMinutes" | "colorId"
>;

export function actualChangeNeedsFreshId(actual: ActualEvent): boolean {
  const saveDisposition = actual.saveDisposition ?? "unsaved";

  return (
    saveDisposition === "calendarSaved" ||
    (saveDisposition === "unsaved" &&
      actual.lastSaveAttemptAt !== undefined)
  );
}

export function buildEditedActual(
  actual: ActualEvent,
  changes: ActualEditChanges,
  createId: () => string,
): ActualEvent {
  return {
    id: actualChangeNeedsFreshId(actual) ? createId() : actual.id,
    summary: changes.summary,
    startMinutes: actual.startMinutes,
    durationMinutes: changes.durationMinutes,
    colorId: changes.colorId,
    sourceCalendarEventId: actual.sourceCalendarEventId,
    isSlack: actual.isSlack,
    saveDisposition: "unsaved",
  };
}

export function buildMovedActual(
  actual: ActualEvent,
  startMinutes: number,
  createId: () => string,
): ActualEvent {
  return {
    id: actualChangeNeedsFreshId(actual) ? createId() : actual.id,
    summary: actual.summary,
    startMinutes,
    durationMinutes: actual.durationMinutes,
    colorId: actual.colorId,
    sourceCalendarEventId: actual.sourceCalendarEventId,
    isSlack: actual.isSlack,
    saveDisposition: "unsaved",
  };
}
