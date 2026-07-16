import { describe, expect, it, vi } from "vitest";

import {
  calendarEventIdForActual,
  insertPrimaryCalendarActual,
} from "../../src/calendar/google-calendar-actual";

const input = {
  block: {
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

describe("Calendar Actual insertion", () => {
  it("derives a stable Calendar-compatible event ID", () => {
    expect(calendarEventIdForActual(input.block.id)).toBe(
      "par123e4567e89b12d3a456426614174000",
    );
  });

  it("inserts the complete event payload and returns the proven event ID", async () => {
    const fetchCalendar = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        Response.json({ id: "par123e4567e89b12d3a456426614174000" }),
    );

    await expect(
      insertPrimaryCalendarActual("token", input, fetchCalendar),
    ).resolves.toEqual({
      ok: true,
      value: { eventId: "par123e4567e89b12d3a456426614174000" },
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
    expect(JSON.parse(String(init?.body))).toEqual({
      id: "par123e4567e89b12d3a456426614174000",
      summary: "[Actual] Design review",
      start: { dateTime: "2026-07-15T09:00:00", timeZone: "America/Los_Angeles" },
      end: { dateTime: "2026-07-15T10:00:00", timeZone: "America/Los_Angeles" },
      colorId: "9",
      attendees: [],
      reminders: { useDefault: false },
      extendedProperties: {
        private: {
          planActualRevised: "true",
          kind: "actual",
          sourceBlockId: input.block.id,
        },
      },
    });
  });

  it("verifies ownership after a duplicate response", async () => {
    const fetchCalendar = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: {} }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({
        id: "par123e4567e89b12d3a456426614174000",
        extendedProperties: { private: {
          planActualRevised: "true",
          kind: "actual",
          sourceBlockId: input.block.id,
        } },
      }));

    await expect(
      insertPrimaryCalendarActual("token", input, fetchCalendar),
    ).resolves.toEqual({
      ok: true,
      value: { eventId: "par123e4567e89b12d3a456426614174000" },
    });
    expect(fetchCalendar.mock.calls[1][0]).toContain(
      "/events/par123e4567e89b12d3a456426614174000",
    );
  });

  it("rejects a deterministic ID collision owned by another block", async () => {
    const fetchCalendar = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: {} }, { status: 409 }))
      .mockResolvedValueOnce(Response.json({
        id: "par123e4567e89b12d3a456426614174000",
        extendedProperties: { private: {
          planActualRevised: "true",
          sourceBlockId: "another-block",
        } },
      }));

    await expect(
      insertPrimaryCalendarActual("token", input, fetchCalendar),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "CALENDAR_ACTUAL_ID_COLLISION" },
    });
  });

  it("normalizes ambiguous and malformed insert results", async () => {
    await expect(
      insertPrimaryCalendarActual("token", input, vi.fn(async () => {
        throw new Error("response lost");
      })),
    ).resolves.toEqual({
      ok: false,
      error: { code: "CALENDAR_ACTUAL_INSERT_FAILED", message: "response lost" },
    });

    await expect(
      insertPrimaryCalendarActual("token", input, vi.fn(async () => Response.json({}))),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "CALENDAR_ACTUAL_INSERT_FAILED" },
    });
  });
});
