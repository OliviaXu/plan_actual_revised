import { describe, expect, it, vi } from "vitest";

import { listPrimaryCalendarEvents } from "../../src/calendar/google-calendar-client";

describe("listPrimaryCalendarEvents", () => {
  it("returns the raw event count from a successful Calendar response", async () => {
    const fetchCalendar = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ items: [{ id: "one" }, { id: "two" }] }),
    );

    await expect(
      listPrimaryCalendarEvents("token-123", fetchCalendar),
    ).resolves.toEqual({
      ok: true,
      value: { eventCount: 2 },
    });

    expect(fetchCalendar).toHaveBeenCalledWith(
      expect.stringMatching(
        /^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/primary\/events\?/,
      ),
      expect.objectContaining({
        headers: { Authorization: "Bearer token-123" },
      }),
    );
    const requestInput = fetchCalendar.mock.calls[0][0];
    const requestUrl = new URL(
      requestInput instanceof Request ? requestInput.url : requestInput,
    );
    expect(requestUrl.searchParams.get("singleEvents")).toBe("true");
    expect(requestUrl.searchParams.get("orderBy")).toBe("startTime");
    expect(requestUrl.searchParams.get("timeMin")).toBeTruthy();
    expect(requestUrl.searchParams.get("timeMax")).toBeTruthy();
  });

  it("normalizes Calendar HTTP failures", async () => {
    const fetchCalendar = vi.fn(async () =>
      Response.json(
        { error: { message: "Calendar API has not been used." } },
        { status: 403 },
      ),
    );

    await expect(
      listPrimaryCalendarEvents("token-123", fetchCalendar),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_LIST_FAILED",
        message: "Calendar API has not been used.",
      },
    });
  });

  it("normalizes network failures", async () => {
    const fetchCalendar = vi.fn(async () => {
      throw new Error("Network unavailable");
    });

    await expect(
      listPrimaryCalendarEvents("token-123", fetchCalendar),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_LIST_FAILED",
        message: "Network unavailable",
      },
    });
  });

  it("uses a stable error when an API failure has no JSON body", async () => {
    const fetchCalendar = vi.fn(async () =>
      new Response(null, { status: 502 }),
    );

    await expect(
      listPrimaryCalendarEvents("token-123", fetchCalendar),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_LIST_FAILED",
        message: "Unable to list Calendar events.",
      },
    });
  });

  it("rejects a successful response with no JSON body", async () => {
    const fetchCalendar = vi.fn(async () => new Response(null));

    await expect(
      listPrimaryCalendarEvents("token-123", fetchCalendar),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_LIST_FAILED",
        message: "Unable to read the Calendar response.",
      },
    });
  });
});
