import { describe, expect, it, vi } from "vitest";

import { listPrimaryCalendarEvents } from "../../src/calendar/google-calendar-client";

describe("listPrimaryCalendarEvents", () => {
  it("returns the raw event count from a successful Calendar response", async () => {
    const fetchCalendar = vi.fn(async () =>
      Response.json({ items: [{ id: "one" }, { id: "two" }] }),
    );

    await expect(
      listPrimaryCalendarEvents({ token: "token-123", fetchCalendar }),
    ).resolves.toEqual({
      ok: true,
      value: { eventCount: 2 },
    });

    expect(fetchCalendar).toHaveBeenCalledWith(
      expect.stringContaining(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      ),
      expect.objectContaining({
        headers: { Authorization: "Bearer token-123" },
      }),
    );
  });

  it("normalizes Calendar HTTP failures", async () => {
    const fetchCalendar = vi.fn(async () =>
      Response.json(
        { error: { message: "Calendar API has not been used." } },
        { status: 403 },
      ),
    );

    await expect(
      listPrimaryCalendarEvents({ token: "token-123", fetchCalendar }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_LIST_FAILED",
        message: "Calendar API has not been used.",
        recoverable: true,
        httpStatus: 403,
      },
    });
  });
});
