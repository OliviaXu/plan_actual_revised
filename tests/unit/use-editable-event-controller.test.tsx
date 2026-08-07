import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useEditableEventController,
} from "../../src/app/hooks/use-editable-event-controller";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEditableEventController", () => {
  it("opens a new Actual at the current snapped Calendar time", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-actual" });
    const { result } = renderHook(() =>
      useEditableEventController({
        calendarDay: {
          date: "2026-07-15",
          timeZone: "America/Los_Angeles",
        },
        dayRecord: null,
        launchSlack: vi.fn(),
        mutationsDisabled: false,
        now: () => new Date("2026-07-15T12:02:00-07:00"),
        onSlackLaunchFailure: vi.fn(),
        persistDayRecord: vi.fn(async () => undefined),
        planEvents: [],
      })
    );

    act(() => result.current.openNewActualEditor());

    expect(result.current.editorState).toEqual({
      mode: "create",
      column: "actual",
      event: {
        id: "new-actual",
        summary: "Untitled",
        startMinutes: 720,
        durationMinutes: 30,
        colorId: "8",
        saveDisposition: "unsaved",
      },
    });
    expect(result.current).not.toHaveProperty("editorTarget");
  });
});
