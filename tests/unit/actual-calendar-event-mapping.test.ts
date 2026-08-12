import { describe, expect, it, vi } from "vitest";

import {
  calendarEventIdForActual,
  mapActualToCalendarEvent,
} from "../../src/calendar/calendar-event-mapping";
import { insertPrimaryCalendarEvent } from "../../src/calendar/google-calendar-client";

const input = {
  actual: {
    id: "123e4567-e89b-12d3-a456-426614174000",
    summary: "Design review",
    startMinutes: 540,
    durationMinutes: 60,
    colorId: "9",
    saveDisposition: "unsaved" as const,
  },
  date: "2026-07-15",
  timezone: "America/Los_Angeles",
  summaryPrefix: "[Actual]",
  defaultColorId: "8",
};

describe("Actual to Calendar event mapping", () => {
  it("derives a stable Calendar-compatible event ID", () => {
    expect(calendarEventIdForActual(input.actual.id)).toBe(
      "par123e4567e89b12d3a456426614174000",
    );
  });

  it("inserts the complete event payload and reports success without an ID", async () => {
    const fetchCalendar = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ id: "par123e4567e89b12d3a456426614174000" }),
    );

    await expect(
      insertPrimaryCalendarEvent("token", mapActualToCalendarEvent(input), fetchCalendar),
    ).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    const [url, init] = fetchCalendar.mock.calls[0];
    expect(url).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init?.body))).toEqual(mapActualToCalendarEvent(input));
    expect(mapActualToCalendarEvent(input)).toEqual({
      id: "par123e4567e89b12d3a456426614174000",
      summary: "[Actual] Design review",
      start: { dateTime: "2026-07-15T09:00:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-07-15T10:00:00", timeZone: "America/Los_Angeles" },
      colorId: "9",
      reminders: { useDefault: false },
      extendedProperties: {
        private: {
          planActualRevisedActual: "true",
        },
      },
    });
  });

  it("keeps an Actual's end as a local time when it crosses midnight", () => {
    expect(
      mapActualToCalendarEvent({
        ...input,
        actual: {
          ...input.actual,
          startMinutes: 23 * 60 + 30,
          durationMinutes: 90,
        },
      }),
    ).toMatchObject({
      start: { dateTime: "2026-07-15T23:30:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-07-16T01:00:00", timeZone: "America/Los_Angeles" },
    });
  });

  it("uses the timezone's DST transition when an Actual spans it", () => {
    expect(
      mapActualToCalendarEvent({
        ...input,
        date: "2026-03-08",
        actual: {
          ...input.actual,
          startMinutes: 90,
          durationMinutes: 60,
        },
      }),
    ).toMatchObject({
      start: { dateTime: "2026-03-08T01:30:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-03-08T03:30:00", timeZone: "America/Los_Angeles" },
    });
  });

  it("normalizes a duplicate response as an insert failure", async () => {
    const fetchCalendar = vi.fn(async () =>
      Response.json({ error: {} }, { status: 409 }),
    );

    await expect(
      insertPrimaryCalendarEvent("token", mapActualToCalendarEvent(input), fetchCalendar),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "CALENDAR_EVENT_INSERT_FAILED",
        message: "Unable to insert Calendar event.",
      },
    });
    expect(fetchCalendar).toHaveBeenCalledOnce();
  });

  it("normalizes an ambiguous insert failure", async () => {
    await expect(
      insertPrimaryCalendarEvent("token", mapActualToCalendarEvent(input), vi.fn(async () => {
        throw new Error("response lost");
      })),
    ).resolves.toEqual({
      ok: false,
      error: { code: "CALENDAR_EVENT_INSERT_FAILED", message: "response lost" },
    });
  });

  it("trusts a successful Calendar status without requiring a response body", async () => {
    await expect(
      insertPrimaryCalendarEvent(
        "token",
        mapActualToCalendarEvent(input),
        vi.fn(async () => new Response(null, { status: 200 })),
      ),
    ).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });

  it("does not require Calendar's generated ID when the insert did not provide one", async () => {
    const eventWithoutId = mapActualToCalendarEvent(input);
    delete eventWithoutId.id;

    await expect(
      insertPrimaryCalendarEvent(
        "token",
        eventWithoutId,
        vi.fn(async () => new Response(null, { status: 200 })),
      ),
    ).resolves.toEqual({
      ok: true,
      value: undefined,
    });
  });
});
