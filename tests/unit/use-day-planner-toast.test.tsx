import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  getCalendarSaveToastContent,
  getCatchUpToastContent,
  useDayPlannerToast,
} from "../../src/app/hooks/use-day-planner-toast";

describe("Day Planner operation feedback", () => {
  it("summarizes a mixed Calendar save result", () => {
    expect(
      getCalendarSaveToastContent({
        record: {
          schemaVersion: 1,
          date: "2026-07-15",
          timezone: "America/Los_Angeles",
          actual: [],
          revised: [],
          updatedAt: "2026-07-15T19:00:00.000Z",
        },
        status: "completed",
        saved: 2,
        matched: 1,
        failed: 1,
      }),
    ).toEqual({
      source: "calendar-save",
      message:
        "Saved 2 Actuals to Calendar; 1 Actual matched Plan; " +
        "1 Actual couldn’t be saved.",
      tone: "warning",
    });
  });

  it("omits catch-up feedback when no work was reported", () => {
    expect(
      getCatchUpToastContent({
        ok: true,
        value: { saved: 0, failed: 0, discarded: 0 },
      }),
    ).toBeUndefined();
  });

  it("shows and clears the current toast", () => {
    const { result } = renderHook(() => useDayPlannerToast());

    act(() => {
      result.current.show({
        source: "slack-launch",
        message: "Slack may not have opened.",
        tone: "warning",
      });
    });
    expect(result.current.current).toEqual({
      id: 1,
      source: "slack-launch",
      message: "Slack may not have opened.",
      tone: "warning",
    });

    act(() => result.current.clear());
    expect(result.current.current).toBeUndefined();
  });
});
