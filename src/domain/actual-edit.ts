import type { ActualEvent } from "./day-event";

type ActualEditChanges = Pick<
  ActualEvent,
  "summary" | "durationMinutes" | "colorId"
>;

export function buildEditedActual(
  actual: ActualEvent,
  changes: ActualEditChanges,
  createId: () => string,
): ActualEvent {
  const isUnsaved = (actual.saveDisposition ?? "unsaved") === "unsaved";
  const needsFreshId =
    actual.saveDisposition === "calendarSaved" ||
    (isUnsaved && actual.lastSaveAttemptAt !== undefined);

  return {
    id: needsFreshId ? createId() : actual.id,
    summary: changes.summary,
    startMinutes: actual.startMinutes,
    durationMinutes: changes.durationMinutes,
    colorId: changes.colorId,
    ...(actual.isSlack ? { isSlack: true } : {}),
    saveDisposition: "unsaved",
  };
}
