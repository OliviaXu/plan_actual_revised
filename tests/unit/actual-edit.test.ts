import { describe, expect, it, vi } from "vitest";

import { buildEditedActual } from "../../src/domain/actual-edit";
import type { ActualEvent } from "../../src/domain/day-event";

function actualEvent(overrides: Partial<ActualEvent> = {}): ActualEvent {
  return {
    id: "original-id",
    summary: "Original title",
    startMinutes: 540,
    durationMinutes: 30,
    colorId: "8",
    saveDisposition: "unsaved",
    ...overrides,
  };
}

const titleEdit = {
  summary: "Edited title",
  durationMinutes: 30,
  colorId: "8",
};

describe("buildEditedActual", () => {
  it("preserves an ordinary unsaved Actual identity", () => {
    const createId = vi.fn(() => "replacement-id");
    const edited = buildEditedActual(actualEvent(), titleEdit, createId);

    expect(edited).toEqual({
      id: "original-id",
      summary: "Edited title",
      startMinutes: 540,
      durationMinutes: 30,
      colorId: "8",
      sourceCalendarEventId: undefined,
      isSlack: undefined,
      saveDisposition: "unsaved",
    });
    expect(Object.hasOwn(edited, "sourceCalendarEventId")).toBe(true);
    expect(Object.hasOwn(edited, "isSlack")).toBe(true);
    expect(createId).not.toHaveBeenCalled();
  });

  it("resets a plan-matched Actual while preserving its identity", () => {
    const createId = vi.fn(() => "replacement-id");

    expect(
      buildEditedActual(
        actualEvent({
          saveDisposition: "planMatched",
          calendarEventId: "stale-calendar-id",
          lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
          lastSaveError: { code: "STALE", message: "Stale error" },
        }),
        titleEdit,
        createId,
      ),
    ).toEqual({
      id: "original-id",
      summary: "Edited title",
      startMinutes: 540,
      durationMinutes: 30,
      colorId: "8",
      sourceCalendarEventId: undefined,
      isSlack: undefined,
      saveDisposition: "unsaved",
    });
    expect(createId).not.toHaveBeenCalled();
  });

  it("assigns a fresh identity to a Calendar-saved Actual", () => {
    const createId = vi.fn(() => "replacement-id");

    expect(
      buildEditedActual(
        actualEvent({
          saveDisposition: "calendarSaved",
          calendarEventId: "calendar-event-id",
          lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
        }),
        titleEdit,
        createId,
      ),
    ).toEqual({
      id: "replacement-id",
      summary: "Edited title",
      startMinutes: 540,
      durationMinutes: 30,
      colorId: "8",
      sourceCalendarEventId: undefined,
      isSlack: undefined,
      saveDisposition: "unsaved",
    });
    expect(createId).toHaveBeenCalledOnce();
  });

  it("assigns a fresh identity after an unsaved insert attempt", () => {
    const createId = vi.fn(() => "replacement-id");

    expect(
      buildEditedActual(
        actualEvent({
          saveDisposition: undefined,
          lastSaveAttemptAt: "2026-07-15T19:00:00.000Z",
          lastSaveError: {
            code: "CALENDAR_INSERT_FAILED",
            message: "Ambiguous failure",
          },
        }),
        titleEdit,
        createId,
      ),
    ).toEqual({
      id: "replacement-id",
      summary: "Edited title",
      startMinutes: 540,
      durationMinutes: 30,
      colorId: "8",
      sourceCalendarEventId: undefined,
      isSlack: undefined,
      saveDisposition: "unsaved",
    });
    expect(createId).toHaveBeenCalledOnce();
  });

  it("preserves editable-event provenance through edits and identity changes", () => {
    const createId = vi.fn(() => "replacement-id");

    expect(
      buildEditedActual(
        actualEvent({
          isSlack: true,
          sourceCalendarEventId: "plan-source",
          saveDisposition: "calendarSaved",
          calendarEventId: "calendar-event-id",
        }),
        titleEdit,
        createId,
      ),
    ).toEqual({
      id: "replacement-id",
      summary: "Edited title",
      startMinutes: 540,
      durationMinutes: 30,
      colorId: "8",
      isSlack: true,
      sourceCalendarEventId: "plan-source",
      saveDisposition: "unsaved",
    });
  });
});
