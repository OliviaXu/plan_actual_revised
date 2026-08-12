import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useWeeklyPractice } from "../../src/app/hooks/use-weekly-practice";

afterEach(() => vi.unstubAllGlobals());

describe("useWeeklyPractice", () => {
  it("locks after creation and uses focus-aligned feedback", async () => {
    const sendMessage = vi.fn(async () => ({
      ok: true, value: undefined,
    }));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const onFeedback = vi.fn();
    const { result } = renderHook(() => useWeeklyPractice({
      calendarDay: {
        date: "2026-07-15",
        timeZone: "America/Los_Angeles",
      },
      initialSummary: undefined,
      onFeedback,
    }));

    act(() => result.current.setDraft("  Concise writing  "));
    await act(() => result.current.submitWeeklyPractice());

    expect(result.current.summary).toBe("Concise writing");
    expect(onFeedback).toHaveBeenCalledWith({
      source: "weekly-practice",
      message: "Weekly practice saved to calendar",
      tone: "plain",
      durationMs: 5_000,
    });
  });

  it("reconciles a failed insert against Monday only", async () => {
    const sendMessage = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { code: "FAILED", message: "lost" } })
      .mockResolvedValueOnce({ ok: true, value: { events: [{
        kind: "allDay", id: "parpractice20260713", summary: "Calendar practice",
        colorId: "4", startDate: "2026-07-13", endDate: "2026-07-14",
      }] } });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });
    const { result } = renderHook(() => useWeeklyPractice({
      calendarDay: {
        date: "2026-07-15",
        timeZone: "America/Los_Angeles",
      },
      initialSummary: undefined,
      onFeedback: vi.fn(),
    }));
    act(() => result.current.setDraft("Draft"));
    await act(() => result.current.submitWeeklyPractice());

    expect(result.current.summary).toBe("Calendar practice");
    expect(sendMessage.mock.calls[1]?.[0]).toEqual({
      type: "calendar.listEventsForDate",
      date: "2026-07-13",
      timeZone: "America/Los_Angeles",
    });
  });
});
