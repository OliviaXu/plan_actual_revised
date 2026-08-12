import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDailyFocus } from "../../src/app/hooks/use-daily-focus";

const date = "2026-07-15";

afterEach(() => {
  vi.unstubAllGlobals();
});

function installRuntime(
  handler: (message: { type: string; event?: unknown }) => Promise<unknown>,
) {
  const sendMessage = vi.fn(handler);
  vi.stubGlobal("chrome", { runtime: { sendMessage } });
  return sendMessage;
}

describe("useDailyFocus", () => {
  it("locks immediately after a confirmed create without re-listing", async () => {
    const sendMessage = installRuntime(async (message) => {
      if (message.type === "calendar.insertEvent") {
        return {
          ok: true,
          value: undefined,
        };
      }
      throw new Error(`Unexpected ${message.type}`);
    });
    const onFeedback = vi.fn();
    const { result } = renderHook(() =>
      useDailyFocus({ calendarDate: date, initialSummary: undefined, onFeedback }),
    );

    act(() => result.current.setDraft("  Ship the hard thing  "));
    await act(() => result.current.submitDailyFocus());

    expect(result.current.dailyFocusSummary).toBe("Ship the hard thing");
    expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
      "calendar.insertEvent",
    ]);
    expect(onFeedback).toHaveBeenCalledWith({
      source: "daily-focus",
      message: "Daily focus saved to calendar",
      tone: "plain",
      durationMs: 5_000,
    });
  });

  it("silently reconciles a failed insert to Calendar's existing focus", async () => {
    const sendMessage = installRuntime(async (message) => {
      if (message.type === "calendar.insertEvent") {
        return {
          ok: false,
          error: {
            code: "CALENDAR_EVENT_INSERT_FAILED",
            message: "Event ID already exists.",
          },
        };
      }
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            date,
            timeZone: "America/Los_Angeles",
            events: [{
              kind: "allDay",
              id: "parfocus20260715",
              summary: "Calendar's committed title",
              colorId: "5",
              startDate: date,
              endDate: "2026-07-16",
            }],
          },
        };
      }
      throw new Error(`Unexpected ${message.type}`);
    });
    const onFeedback = vi.fn();
    const { result } = renderHook(() =>
      useDailyFocus({
        calendarDate: date,
        initialSummary: undefined,
        onFeedback,
      }),
    );

    act(() => result.current.setDraft("A changed retry draft"));
    await act(() => result.current.submitDailyFocus());

    expect(result.current.dailyFocusSummary).toBe(
      "Calendar's committed title",
    );
    expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
      "calendar.insertEvent",
      "calendar.listEvents",
    ]);
    expect(onFeedback).not.toHaveBeenCalled();
  });

  it("reconciles a failed insert before restoring the ordinary form", async () => {
    installRuntime(async (message) => {
      if (message.type === "calendar.insertEvent") {
        return {
          ok: false,
          error: {
            code: "CALENDAR_EVENT_INSERT_FAILED",
            message: "Response lost.",
          },
        };
      }
      if (message.type === "calendar.listEvents") {
        return {
          ok: true,
          value: {
            date,
            timeZone: "America/Los_Angeles",
            events: [],
          },
        };
      }
      throw new Error(`Unexpected ${message.type}`);
    });
    const onFeedback = vi.fn();
    const { result } = renderHook(() =>
      useDailyFocus({ calendarDate: date, initialSummary: undefined, onFeedback }),
    );

    act(() => result.current.setDraft("Ship the hard thing"));
    await act(() => result.current.submitDailyFocus());

    await waitFor(() => expect(result.current.isSaving).toBe(false));
    expect(result.current.dailyFocusSummary).toBeUndefined();
    expect(result.current.draft).toBe("Ship the hard thing");
    expect(onFeedback).toHaveBeenCalledWith({
      source: "daily-focus",
      message: "Unable to confirm today’s focus in Calendar.",
      tone: "warning",
    });
  });

});
