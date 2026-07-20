import { describe, expect, it, vi } from "vitest";

import { buildEditedActual } from "../../src/domain/actual-edit";
import type { ActualBlock } from "../../src/domain/day-record";

function actualBlock(overrides: Partial<ActualBlock> = {}): ActualBlock {
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

    expect(
      buildEditedActual(actualBlock(), titleEdit, createId),
    ).toEqual({
      id: "original-id",
      summary: "Edited title",
      startMinutes: 540,
      durationMinutes: 30,
      colorId: "8",
      saveDisposition: "unsaved",
    });
    expect(createId).not.toHaveBeenCalled();
  });

  it("resets a plan-matched Actual while preserving its identity", () => {
    const createId = vi.fn(() => "replacement-id");

    expect(
      buildEditedActual(
        actualBlock({
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
      saveDisposition: "unsaved",
    });
    expect(createId).not.toHaveBeenCalled();
  });

  it("assigns a fresh identity to a Calendar-saved Actual", () => {
    const createId = vi.fn(() => "replacement-id");

    expect(
      buildEditedActual(
        actualBlock({
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
      saveDisposition: "unsaved",
    });
    expect(createId).toHaveBeenCalledOnce();
  });

  it("assigns a fresh identity after an unsaved insert attempt", () => {
    const createId = vi.fn(() => "replacement-id");

    expect(
      buildEditedActual(
        actualBlock({
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
      saveDisposition: "unsaved",
    });
    expect(createId).toHaveBeenCalledOnce();
  });
});
