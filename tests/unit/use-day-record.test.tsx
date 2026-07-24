import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDayRecord } from "../../src/app/hooks/use-day-record";
import type { DayRecord } from "../../src/domain/day-record";

const calendarDay = {
  date: "2026-07-15",
  timeZone: "America/Los_Angeles",
};

function dayRecord(updatedAt: string): DayRecord {
  return {
    schemaVersion: 1,
    date: calendarDay.date,
    timezone: calendarDay.timeZone,
    actual: [],
    updatedAt,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useDayRecord", () => {
  it("waits for Calendar before loading the canonical day", async () => {
    const storedRecord = dayRecord("2026-07-15T18:00:00.000Z");
    const get = vi.fn().mockResolvedValue({
      "dayRecord:2026-07-15": storedRecord,
    });
    vi.stubGlobal("chrome", {
      storage: { local: { get, set: vi.fn() } },
    });

    const { result, rerender } = renderHook(
      ({ day }) => useDayRecord(day),
      {
        initialProps: {
          day: undefined as typeof calendarDay | undefined,
        },
      },
    );

    expect(result.current).toMatchObject({
      dayRecord: null,
      loadStatus: "loading",
      storageError: undefined,
    });
    expect(get).not.toHaveBeenCalled();

    rerender({ day: calendarDay });

    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
    expect(result.current.dayRecord).toEqual(storedRecord);
    expect(get).toHaveBeenCalledWith("dayRecord:2026-07-15");
  });

  it("does not classify a failed canonical read as successful", async () => {
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(new Error("read failed")),
          set: vi.fn(),
        },
      },
    });

    const { result } = renderHook(() => useDayRecord(calendarDay));

    await waitFor(() => expect(result.current.loadStatus).toBe("failed"));
  });

  it("keeps the read failed after a later optimistic write succeeds", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockRejectedValue(new Error("read failed")),
          set,
        },
      },
    });
    const { result } = renderHook(() => useDayRecord(calendarDay));
    await waitFor(() => expect(result.current.loadStatus).toBe("failed"));

    await act(() =>
      result.current.persistDayRecord(
        dayRecord("2026-07-15T18:01:00.000Z"),
      ),
    );

    expect(set).toHaveBeenCalledOnce();
    expect(result.current.loadStatus).toBe("failed");
  });

  it("keeps the read loading while an optimistic write succeeds", async () => {
    let resolveRead: ((value: Record<string, unknown>) => void) | undefined;
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn(
            () =>
              new Promise<Record<string, unknown>>((resolve) => {
                resolveRead = resolve;
              }),
          ),
          set: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
    const { result } = renderHook(() => useDayRecord(calendarDay));

    await act(() =>
      result.current.persistDayRecord(
        dayRecord("2026-07-15T18:01:00.000Z"),
      ),
    );

    expect(result.current.loadStatus).toBe("loading");
    resolveRead?.({});
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
  });

  it("returns to loading when the canonical Calendar day changes", async () => {
    let resolveNextDay: ((value: Record<string, unknown>) => void) | undefined;
    const get = vi
      .fn()
      .mockResolvedValueOnce({
        "dayRecord:2026-07-15": dayRecord("2026-07-15T18:00:00.000Z"),
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveNextDay = resolve;
      }));
    vi.stubGlobal("chrome", {
      storage: { local: { get, set: vi.fn() } },
    });
    const nextDay = { ...calendarDay, date: "2026-07-16" };
    const { result, rerender } = renderHook(
      ({ day }) => useDayRecord(day),
      { initialProps: { day: calendarDay } },
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));

    rerender({ day: nextDay });

    expect(result.current.loadStatus).toBe("loading");
    expect(result.current.dayRecord).toBeNull();
    resolveNextDay?.({});
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));
  });

  it("updates optimistically, serializes writes, and reports only the latest failure", async () => {
    const pendingWrites: Array<{
      reject: (reason: unknown) => void;
    }> = [];
    const set = vi.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          pendingWrites.push({ reject });
        }),
    );
    vi.stubGlobal("chrome", {
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set,
        },
      },
    });
    const { result } = renderHook(() => useDayRecord(calendarDay));
    await waitFor(() => expect(result.current.loadStatus).toBe("loaded"));

    const firstRecord = dayRecord("2026-07-15T18:01:00.000Z");
    const latestRecord = dayRecord("2026-07-15T18:02:00.000Z");
    let firstWrite: Promise<void>;
    let latestWrite: Promise<void>;
    act(() => {
      firstWrite = result.current.persistDayRecord(firstRecord);
      latestWrite = result.current.persistDayRecord(latestRecord);
    });

    expect(result.current.dayRecord).toEqual(latestRecord);
    expect(set).toHaveBeenCalledTimes(1);

    pendingWrites[0]?.reject(new Error("first failed"));
    await act(async () => {
      await firstWrite;
    });
    expect(result.current.storageError).toBeUndefined();
    expect(set).toHaveBeenCalledTimes(2);

    pendingWrites[1]?.reject(new Error("latest failed"));
    await act(async () => {
      await latestWrite;
    });
    expect(result.current.storageError).toBe("Unable to save local changes.");
  });
});
