import type { ActualBlock } from "./day-record";

type ActualEditChanges = Pick<
  ActualBlock,
  "summary" | "durationMinutes" | "colorId"
>;

export function buildEditedActual(
  actual: ActualBlock,
  changes: ActualEditChanges,
  createId: () => string,
): ActualBlock {
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
    saveDisposition: "unsaved",
  };
}
