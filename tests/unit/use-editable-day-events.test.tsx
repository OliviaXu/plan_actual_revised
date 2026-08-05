import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useEditableDayEvents } from "../../src/app/hooks/use-editable-day-events";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useEditableDayEvents", () => {
  it("opens a new Actual at the current snapped Calendar time", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "new-actual" });
    const { result } = renderHook(() =>
      useEditableDayEvents({
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

    act(() => result.current.addActual());

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
