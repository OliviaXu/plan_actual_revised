import { afterEach, describe, expect, it, vi } from "vitest";

import { runtimeCalendarEventClient } from "../../src/app/runtime-calendar-event-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runtimeCalendarEventClient", () => {
  it("delegates Calendar and auth requests to the background service worker", async () => {
    const listResponse = {
      ok: true as const,
      value: { events: [], date: "2026-07-15", timeZone: "America/Los_Angeles" },
    };
    const authResponse = {
      ok: true as const,
      value: { status: "connected" as const },
    };
    const sendMessage = vi.fn()
      .mockResolvedValueOnce(listResponse)
      .mockResolvedValueOnce(authResponse);
    vi.stubGlobal("chrome", { runtime: { sendMessage } });

    await expect(runtimeCalendarEventClient.listCalendarEvents()).resolves.toEqual(listResponse);
    await expect(runtimeCalendarEventClient.requestInteractiveToken()).resolves.toEqual(authResponse);
    expect(sendMessage.mock.calls.map(([message]) => message)).toEqual([
      { type: "calendar.listEvents" },
      { type: "auth.requestInteractiveToken" },
    ]);
  });

  it("converts rejected runtime communication into a consistent boundary error", async () => {
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: vi.fn().mockRejectedValue(new Error("offline")) },
    });

    await expect(runtimeCalendarEventClient.listCalendarEvents()).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_BOUNDARY_UNAVAILABLE",
        message: "Unable to reach the background Calendar boundary.",
      },
    });
    await expect(runtimeCalendarEventClient.requestInteractiveToken()).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_BOUNDARY_UNAVAILABLE",
        message: "Unable to reach the background Calendar boundary.",
      },
    });
  });
});
