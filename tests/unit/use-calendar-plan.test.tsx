import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useCalendarPlan } from "../../src/app/hooks/use-calendar-plan";

const calendarResponse = {
  ok: true as const,
  value: {
    date: "2026-07-15",
    timeZone: "America/Los_Angeles",
    events: [
      {
        kind: "timed" as const,
        id: "design-review",
        summary: "Design review",
        colorId: "9",
        start: "2026-07-15T09:00:00-07:00",
        end: "2026-07-15T10:00:00-07:00",
        timeZone: "America/Los_Angeles",
      },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useCalendarPlan", () => {
  it("hydrates Plan and the canonical Calendar day through cached auth", async () => {
    const sendMessage = vi.fn().mockResolvedValue(calendarResponse);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const { result } = renderHook(() =>
      useCalendarPlan(() => new Date("2026-07-16T02:00:00.000Z")),
    );

    expect(result.current.calendarState).toEqual({ status: "loading" });
    await waitFor(() =>
      expect(result.current.calendarState.status).toBe("connected"),
    );
    expect(result.current.calendarDay).toEqual({
      date: "2026-07-15",
      timeZone: "America/Los_Angeles",
    });
    expect(result.current.calendarState).toEqual({
      status: "connected",
      dailyFocusSummary: undefined,
      weeklyPracticeState: { status: "loaded", summary: undefined },
      planEvents: [
        {
          id: "design-review",
          summary: "Design review",
          colorId: "9",
          startMinutes: 540,
          durationMinutes: 60,
        },
      ],
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: "calendar.listEvents",
    });
  });

  it("connects interactively after cached auth is unavailable", async () => {
    const sendMessage = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: {
          code: "AUTH_NOT_CONNECTED",
          message: "Connect Calendar before requesting events.",
        },
      })
      .mockResolvedValueOnce({ ok: true, value: { status: "connected" } })
      .mockResolvedValueOnce(calendarResponse)
      .mockResolvedValueOnce({ ok: true, value: { events: [] } });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const { result } = renderHook(() =>
      useCalendarPlan(() => new Date("2026-07-15T19:00:00.000Z")),
    );
    await waitFor(() =>
      expect(result.current.calendarState.status).toBe("disconnected"),
    );

    await act(async () => {
      await result.current.connectCalendar();
    });

    expect(result.current.calendarState.status).toBe("connected");
    expect(sendMessage.mock.calls.map(([message]) => message.type)).toEqual([
      "calendar.listEvents",
      "auth.requestInteractiveToken",
      "calendar.listEvents",
      "calendar.listEventsForDate",
    ]);
  });

  it("reuses Monday's today response for practice", async () => {
    const response = {
      ...calendarResponse,
      value: {
        ...calendarResponse.value,
        date: "2026-07-13",
        events: [{
          kind: "allDay" as const,
          id: "manual-practice",
          summary: "Deep listening",
          colorId: "4",
          startDate: "2026-07-13",
          endDate: "2026-07-14",
        }],
      },
    };
    const sendMessage = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const { result } = renderHook(() => useCalendarPlan(() => new Date()));
    await waitFor(() => expect(result.current.calendarState.status).toBe("connected"));

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(result.current.calendarState).toMatchObject({
      weeklyPracticeState: { status: "loaded", summary: "Deep listening" },
    });
  });

  it("hides practice and skips Monday reads on weekends", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ...calendarResponse,
      value: { ...calendarResponse.value, date: "2026-07-18" },
    });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const { result } = renderHook(() => useCalendarPlan(() => new Date()));
    await waitFor(() => expect(result.current.calendarState.status).toBe("connected"));

    expect(sendMessage).toHaveBeenCalledOnce();
    expect(result.current.calendarState).not.toHaveProperty(
      "weeklyPracticeState",
    );
  });

  it("leaves midweek practice unresolved while its Monday read is pending", async () => {
    let finishMondayRead:
      | ((response: { ok: true; value: { events: [] } }) => void)
      | undefined;
    const sendMessage = vi.fn()
      .mockResolvedValueOnce(calendarResponse)
      .mockReturnValueOnce(new Promise((resolve) => {
        finishMondayRead = resolve;
      }));
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const { result } = renderHook(() => useCalendarPlan(() => new Date()));
    await waitFor(() => expect(result.current.calendarState.status).toBe("connected"));

    expect(result.current.calendarState).not.toHaveProperty(
      "weeklyPracticeState",
    );
    finishMondayRead?.({ ok: true, value: { events: [] } });
    await waitFor(() => expect(result.current.calendarState).toMatchObject({
      weeklyPracticeState: { status: "loaded", summary: undefined },
    }));
  });

  it("preserves Plan when the isolated Monday read fails", async () => {
    const sendMessage = vi.fn()
      .mockResolvedValueOnce(calendarResponse)
      .mockResolvedValueOnce({ ok: false, error: { code: "FAILED", message: "nope" } });
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    const { result } = renderHook(() => useCalendarPlan(() => new Date()));
    await waitFor(() => expect(result.current.calendarState).toMatchObject({
      status: "connected",
      weeklyPracticeState: { status: "error" },
      planEvents: [{ id: "design-review" }],
    }));
  });
});
