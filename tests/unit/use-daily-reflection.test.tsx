import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDailyReflection } from "../../src/app/hooks/use-daily-reflection";

const now = () => new Date("2026-07-15T16:00:00-07:00");

function installChrome(
  runtimeResponse: (message: { type: string }) => Promise<unknown> = async () => ({
    ok: true,
    value: undefined,
  }),
) {
  const stored: Record<string, unknown> = {};
  const set = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(stored, items);
  });
  const remove = vi.fn(async (key: string) => {
    delete stored[key];
  });
  const sendMessage = vi.fn(runtimeResponse);
  vi.stubGlobal("chrome", {
    runtime: { sendMessage },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set,
        remove,
      },
    },
  });
  return { remove, sendMessage, set, stored };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useDailyReflection", () => {
  it("opens a visible manual trigger after the calendar date rolls over", async () => {
    const { stored } = installChrome();
    let currentNow = new Date("2026-07-15T23:59:00-07:00");
    const { result } = renderHook(() => useDailyReflection({
      calendarDate: "2026-07-15",
      calendarTimeZone: "America/Los_Angeles",
      dailyFocusSummary: null,
      weeklyPracticeSummary: null,
      reflectionExists: false,
      now: () => currentNow,
      onCompleted: vi.fn(),
      onFeedback: vi.fn(),
    }));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
    expect(result.current.canShowManualTrigger).toBe(true);

    currentNow = new Date("2026-07-16T00:01:00-07:00");
    await act(() => result.current.openManualReflection());

    expect(result.current.isOpen).toBe(true);
    expect(stored.reflectionSession).toMatchObject({ date: "2026-07-15" });
  });

  it("creates and persists a frozen manual session", async () => {
    const { stored } = installChrome();
    const { result, rerender } = renderHook(
      ({ focus, practice }) => useDailyReflection({
        calendarDate: "2026-07-15",
        calendarTimeZone: "America/Los_Angeles",
        dailyFocusSummary: focus,
        weeklyPracticeSummary: practice,
        reflectionExists: false,
        now,
        onCompleted: vi.fn(),
        onFeedback: vi.fn(),
      }),
      { initialProps: {
        focus: "Write the difficult proposal" as string | null | undefined,
        practice: "Ask one better question" as string | null | undefined,
      } },
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));

    await act(() => result.current.openManualReflection());

    expect(result.current.isOpen).toBe(true);
    expect(result.current.session).toMatchObject({
      date: "2026-07-15",
      focusSummary: "Write the difficult proposal",
      weeklyPracticeSummary: "Ask one better question",
    });
    rerender({ focus: "Changed later", practice: "Changed later" });
    expect(result.current.session).toMatchObject({
      focusSummary: "Write the difficult proposal",
      weeklyPracticeSummary: "Ask one better question",
    });
    expect(stored.reflectionSession).toMatchObject({
      date: "2026-07-15",
      focusSummary: "Write the difficult proposal",
    });
  });

  it("persists edits and a fifteen-minute snooze", async () => {
    const { stored } = installChrome();
    const { result } = renderHook(() => useDailyReflection({
      calendarDate: "2026-07-15",
      calendarTimeZone: "America/Los_Angeles",
      dailyFocusSummary: null,
      weeklyPracticeSummary: null,
      reflectionExists: false,
      now,
      onCompleted: vi.fn(),
      onFeedback: vi.fn(),
    }));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
    await act(() => result.current.openManualReflection());
    await act(() => result.current.updateSession({
      detail: "Moved the rollout forward.",
    }));
    await act(() => result.current.snooze());

    expect(result.current.isOpen).toBe(false);
    expect(stored.reflectionSession).toMatchObject({
      outcome: "notSet",
      detail: "Moved the rollout forward.",
      snoozedUntil: "2026-07-15T23:15:00.000Z",
    });
  });

  it("serializes draft writes before clearing a completed reflection", async () => {
    const { remove, set, stored } = installChrome();
    const onCompleted = vi.fn();
    const onFeedback = vi.fn();
    const { result } = renderHook(() => useDailyReflection({
      calendarDate: "2026-07-15",
      calendarTimeZone: "America/Los_Angeles",
      dailyFocusSummary: null,
      weeklyPracticeSummary: null,
      reflectionExists: false,
      now,
      onCompleted,
      onFeedback,
    }));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
    await act(() => result.current.openManualReflection());

    let releaseWrite: (() => void) | undefined;
    const writeBlocked = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    set.mockImplementationOnce(async (items: Record<string, unknown>) => {
      await writeBlocked;
      Object.assign(stored, items);
    });

    act(() => {
      void result.current.updateSession({ detail: "Moved forward." });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => expect(set).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(result.current.session?.detail).toBe("Moved forward.");
    });

    act(() => {
      void result.current.save();
    });
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(0));
    releaseWrite!();

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(stored.reflectionSession).toBeUndefined();
  });

  it("does not create a new session for a stale loaded planner date", async () => {
    installChrome();
    const { result } = renderHook(() => useDailyReflection({
      calendarDate: "2026-07-15",
      calendarTimeZone: "America/Los_Angeles",
      dailyFocusSummary: null,
      weeklyPracticeSummary: null,
      reflectionExists: false,
      now: () => new Date("2026-07-16T16:00:00-07:00"),
      onCompleted: vi.fn(),
      onFeedback: vi.fn(),
    }));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));

    expect(result.current.canShowManualTrigger).toBe(false);
    await act(() => result.current.openManualReflection());
    expect(result.current.session).toBeNull();
    expect(result.current.isOpen).toBe(false);
  });

  it("clears a successfully saved session and reports completion", async () => {
    const onCompleted = vi.fn();
    const onFeedback = vi.fn();
    const { sendMessage, stored } = installChrome();
    const { result } = renderHook(() => useDailyReflection({
      calendarDate: "2026-07-15",
      calendarTimeZone: "America/Los_Angeles",
      dailyFocusSummary: null,
      weeklyPracticeSummary: null,
      reflectionExists: false,
      now,
      onCompleted,
      onFeedback,
    }));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
    await act(() => result.current.openManualReflection());
    await act(() => result.current.updateSession({ detail: "Moved forward." }));
    await act(() => result.current.save());

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "calendar.insertEvent",
    }));
    expect(stored.reflectionSession).toBeUndefined();
    expect(result.current.session).toBeNull();
    expect(onCompleted).toHaveBeenCalledWith("2026-07-15");
    expect(onFeedback).toHaveBeenCalledWith({
      source: "daily-reflection",
      message: "Reflection saved to Calendar",
      tone: "plain",
      durationMs: 5_000,
    });
  });

  it("delegates incomplete draft validation to the calendar event mapper", async () => {
    installChrome();
    const { result } = renderHook(() => useDailyReflection({
      calendarDate: "2026-07-15",
      calendarTimeZone: "America/Los_Angeles",
      dailyFocusSummary: "Write the difficult proposal",
      weeklyPracticeSummary: null,
      reflectionExists: false,
      now,
      onCompleted: vi.fn(),
      onFeedback: vi.fn(),
    }));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
    await act(() => result.current.openManualReflection());

    await expect(result.current.save()).rejects.toThrow(
      "A completed reflection requires an outcome and detail.",
    );
  });

  it("keeps a failed session after an unsuccessful reconciliation", async () => {
    const onFeedback = vi.fn();
    installChrome(async (message) => message.type === "calendar.insertEvent"
      ? { ok: false, error: { code: "FAILED", message: "lost" } }
      : { ok: true, value: { events: [] } });
    const { result } = renderHook(() => useDailyReflection({
      calendarDate: "2026-07-15",
      calendarTimeZone: "America/Los_Angeles",
      dailyFocusSummary: null,
      weeklyPracticeSummary: null,
      reflectionExists: false,
      now,
      onCompleted: vi.fn(),
      onFeedback,
    }));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
    await act(() => result.current.openManualReflection());
    await act(() => result.current.updateSession({ detail: "Moved forward." }));
    await act(() => result.current.save());

    expect(result.current.session).not.toBeNull();
    expect(result.current.isOpen).toBe(true);
    expect(onFeedback).toHaveBeenCalledWith({
      source: "daily-reflection",
      message: "Reflection couldn’t be saved to Calendar.",
      tone: "warning",
    });
  });
});
