import { describe, expect, it, vi } from "vitest";

import { listPrimaryCalendarEvents } from "../../src/calendar/google-calendar-client";

const range = {
  timeMin: "2026-07-15T07:00:00.000Z",
  timeMax: "2026-07-16T07:00:00.000Z",
};

describe("listPrimaryCalendarEvents", () => {
  it("combines every Calendar response page before returning normalized events", async () => {
    const fetchCalendar = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            timeZone: "America/Los_Angeles",
            items: [{ id: "timed-event", start: { dateTime: "2026-07-15T09:00:00-07:00" }, end: { dateTime: "2026-07-15T10:00:00-07:00" } }],
            nextPageToken: "page-2",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ timeZone: "America/Los_Angeles", items: [{ id: "all-day-event", start: { date: "2026-07-15" }, end: { date: "2026-07-16" } }] }), { status: 200 }),
      );

    const result = await listPrimaryCalendarEvents(
      "token-123",
      range,
      fetchCalendar,
    );
    expect(result).toMatchObject({
      ok: true,
      value: {
        timeZone: "America/Los_Angeles",
        events: [
          expect.objectContaining({ id: "timed-event" }),
          expect.objectContaining({ id: "all-day-event" }),
        ],
        stats: expect.objectContaining({ pageCount: 2, rawEventCount: 2 }),
      },
    });
    if (!result.ok) {
      throw new Error("Expected a successful Calendar result.");
    }
    expect(result.value.stats.calendarHttpAndJsonDurationMs).toSatisfy(
      (duration: number) => Number.isFinite(duration) && duration >= 0,
    );
    expect(result.value.stats.normalizationDurationMs).toSatisfy(
      (duration: number) => Number.isFinite(duration) && duration >= 0,
    );
    expect(fetchCalendar.mock.calls[1]?.[0]).toContain("pageToken=page-2");
  });
  it("normalizes timed and all-day events from a dated Calendar response", async () => {
    const fetchCalendar = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({
          timeZone: "America/Los_Angeles",
          items: [
            {
              id: "timed",
              summary: "Design review",
              colorId: "9",
              start: {
                dateTime: "2026-07-15T09:00:00-07:00",
                timeZone: "America/Los_Angeles",
              },
              end: { dateTime: "2026-07-15T10:00:00-07:00" },
              extendedProperties: {
                private: { planActualRevisedActual: "true" },
              },
            },
            {
              id: "all-day",
              summary: "Focus",
              description: "Practice the difficult part",
              start: { date: "2026-07-15" },
              end: { date: "2026-07-16" },
            },
          ],
        }),
    );

    const result = await listPrimaryCalendarEvents(
      "token-123",
      range,
      fetchCalendar,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        events: [
          {
            kind: "timed",
            id: "timed",
            summary: "Design review",
            colorId: "9",
            start: "2026-07-15T09:00:00-07:00",
            end: "2026-07-15T10:00:00-07:00",
            timeZone: "America/Los_Angeles",
            isExtensionActual: true,
          },
          {
            kind: "allDay",
            id: "all-day",
            summary: "Focus",
            description: "Practice the difficult part",
            colorId: null,
            startDate: "2026-07-15",
            endDate: "2026-07-16",
          },
        ],
      },
    });

    if (!result.ok) throw new Error("Expected Calendar events to load.");
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
    expect(requestUrl.searchParams.get("timeMin")).toBe(
      "2026-07-15T07:00:00.000Z",
    );
    expect(requestUrl.searchParams.get("timeMax")).toBe(
      "2026-07-16T07:00:00.000Z",
    );
  });

  it("omits malformed individual events", async () => {
    const fetchCalendar = vi.fn(async () =>
      Response.json({
        timeZone: "America/Los_Angeles",
        items: [
          { id: "missing-times", summary: "Broken" },
          {
            id: "valid",
            start: { dateTime: "2026-07-15T11:00:00-07:00" },
            end: { dateTime: "2026-07-15T11:30:00-07:00" },
          },
        ],
      }),
    );

    await expect(
      listPrimaryCalendarEvents(
        "token-123",
        range,
        fetchCalendar,
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: {
        events: [
          {
            kind: "timed",
            id: "valid",
            summary: null,
            colorId: null,
            start: "2026-07-15T11:00:00-07:00",
            end: "2026-07-15T11:30:00-07:00",
            timeZone: null,
          },
        ],
      },
    });
  });

  it("normalizes Calendar HTTP failures", async () => {
    const fetchCalendar = vi.fn(async () =>
      Response.json(
        { error: { message: "Calendar API has not been used." } },
        { status: 403 },
      ),
    );

    await expect(
      listPrimaryCalendarEvents("token-123", range, fetchCalendar),
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
      listPrimaryCalendarEvents("token-123", range, fetchCalendar),
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
      listPrimaryCalendarEvents("token-123", range, fetchCalendar),
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
      listPrimaryCalendarEvents("token-123", range, fetchCalendar),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_LIST_FAILED",
        message: "Unable to read the Calendar response.",
      },
    });
  });
});
