import { describe, expect, it, vi } from "vitest";

import { createCalendarOperations } from "../../src/background/calendar-operations";

const fixedNow = new Date(2026, 6, 15, 12);
const range = {
  timeMin: new Date(2026, 6, 15).toISOString(),
  timeMax: new Date(2026, 6, 16).toISOString(),
};
const now = () => new Date(fixedNow);
const insertEvent = {
  id: "calendar-event-id",
  summary: "Actual",
  start: { dateTime: "2026-07-15T09:00:00-07:00", timeZone: "America/Los_Angeles" },
  end: { dateTime: "2026-07-15T10:00:00-07:00", timeZone: "America/Los_Angeles" },
};

function installCalendarOperations(
  overrides: Record<string, unknown> = {},
  clock: () => Date = now,
) {
  const dependencies = {
    requestCachedToken: vi.fn(async () => ({
      ok: true as const,
      value: "token-123",
    })),
    listPrimaryCalendarEvents: vi.fn(async () => ({
      ok: true as const,
      value: { events: [], timeZone: "America/Los_Angeles" },
    })),
    insertPrimaryCalendarEvent: vi.fn(async () => ({
      ok: true as const,
      value: { eventId: "calendar-actual-id" },
    })),
    ...overrides,
  };
  const operations = createCalendarOperations(
    dependencies,
    clock,
    () => "America/Los_Angeles",
  );
  return { dependencies, operations };
}

describe("createCalendarOperations", () => {
  it("coalesces overlapping current-day reads", async () => {
    let finishList:
      | ((result: {
          ok: true;
          value: { events: []; timeZone: string };
        }) => void)
      | undefined;
    const listPrimaryCalendarEvents = vi.fn(
      () =>
        new Promise<{
          ok: true;
          value: { events: []; timeZone: string };
        }>((resolve) => {
          finishList = resolve;
        }),
    );
    const operations = createCalendarOperations(
      {
        requestCachedToken: vi.fn(async () => ({
          ok: true as const,
          value: "token-123",
        })),
        listPrimaryCalendarEvents,
        insertPrimaryCalendarEvent: vi.fn(),
      },
      () => new Date(2026, 6, 15, 12),
      () => "America/Los_Angeles",
    );

    const first = operations.listCurrentDayEvents();
    const second = operations.listCurrentDayEvents();

    await vi.waitFor(() =>
      expect(listPrimaryCalendarEvents).toHaveBeenCalledOnce(),
    );
    finishList?.({
      ok: true,
      value: { events: [], timeZone: "America/Los_Angeles" },
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ ok: true }),
      expect.objectContaining({ ok: true }),
    ]);
  });

  it("lists historical events using the record date and timezone", async () => {
    const listPrimaryCalendarEvents = vi.fn(async () => ({
      ok: true as const,
      value: {
        events: [],
        timeZone: "America/Los_Angeles",
      },
    }));
    const operations = createCalendarOperations({
      requestCachedToken: vi.fn(async () => ({
        ok: true as const,
        value: "token-123",
      })),
      listPrimaryCalendarEvents,
      insertPrimaryCalendarEvent: vi.fn(),
    });

    await operations.listEventsForDayRecord({
      schemaVersion: 1,
      date: "2026-07-14",
      timezone: "America/Los_Angeles",
      actual: [],
      updatedAt: "2026-07-14T18:00:00.000Z",
    });

    expect(listPrimaryCalendarEvents).toHaveBeenCalledWith("token-123", {
      timeMin: "2026-07-14T07:00:00.000Z",
      timeMax: "2026-07-15T07:00:00.000Z",
    });
  });

  it("lists today's Calendar events with a silently cached token", async () => {
    const { dependencies, operations } = installCalendarOperations();

    await expect(operations.listCurrentDayEvents()).resolves.toMatchObject({
      ok: true,
      value: { events: [] },
    });
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenCalledWith(
      "token-123",
      range,
    );
  });

  it("uses the primary Calendar timezone for its date and day range", async () => {
    const clock = () => new Date("2026-07-15T01:00:00.000Z");
    const { dependencies, operations } = installCalendarOperations(
      {
        listPrimaryCalendarEvents: vi.fn(async () => ({
          ok: true as const,
          value: { events: [], timeZone: "Asia/Tokyo" },
        })),
      },
      clock,
    );

    await expect(operations.listCurrentDayEvents()).resolves.toMatchObject({
      ok: true,
      value: { events: [], timeZone: "Asia/Tokyo", date: "2026-07-15" },
    });
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenCalledTimes(2);
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenLastCalledWith(
      "token-123",
      {
        timeMin: "2026-07-14T15:00:00.000Z",
        timeMax: "2026-07-15T15:00:00.000Z",
      },
    );
  });

  it("remembers the primary Calendar timezone for the next read", async () => {
    const clock = () => new Date("2026-07-15T01:00:00.000Z");
    const { dependencies, operations } = installCalendarOperations(
      {
        listPrimaryCalendarEvents: vi.fn(async () => ({
          ok: true as const,
          value: { events: [], timeZone: "Asia/Tokyo" },
        })),
      },
      clock,
    );

    await operations.listCurrentDayEvents();
    await operations.listCurrentDayEvents();

    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenCalledTimes(3);
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenNthCalledWith(
      3,
      "token-123",
      {
        timeMin: "2026-07-14T15:00:00.000Z",
        timeMax: "2026-07-15T15:00:00.000Z",
      },
    );
  });

  it("reads the clock once when deriving a Calendar request range", async () => {
    const clock = vi.fn(now);
    const { operations } = installCalendarOperations({}, clock);

    await operations.listCurrentDayEvents();

    expect(clock).toHaveBeenCalledOnce();
  });

  it("derives a new local-day range for a later request after midnight", async () => {
    const clock = vi
      .fn()
      .mockReturnValueOnce(new Date(2026, 6, 15, 23, 59))
      .mockReturnValueOnce(new Date(2026, 6, 16, 0, 1));
    const { dependencies, operations } = installCalendarOperations({}, clock);

    await operations.listCurrentDayEvents();
    await operations.listCurrentDayEvents();

    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenNthCalledWith(
      1,
      "token-123",
      {
        timeMin: new Date(2026, 6, 15).toISOString(),
        timeMax: new Date(2026, 6, 16).toISOString(),
      },
    );
    expect(dependencies.listPrimaryCalendarEvents).toHaveBeenNthCalledWith(
      2,
      "token-123",
      {
        timeMin: new Date(2026, 6, 16).toISOString(),
        timeMax: new Date(2026, 6, 17).toISOString(),
      },
    );
  });

  it("logs Calendar load stats without a constant request reason", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const { operations } = installCalendarOperations();

    await operations.listCurrentDayEvents();

    expect(log.mock.calls[0]?.[1]).not.toHaveProperty("reason");
    log.mockRestore();
  });

  it.each([
    { events: [], renderedTimedEventCount: 0 },
    {
      events: [
        {
          kind: "timed" as const,
          id: "private-event-id",
          summary: "Private meeting",
          colorId: null,
          start: "2026-07-15T09:00:00-07:00",
          end: "2026-07-15T10:00:00-07:00",
          timeZone: "America/Los_Angeles",
        },
      ],
      renderedTimedEventCount: 1,
    },
  ])(
    "logs one complete privacy-safe summary for %# event set",
    async ({ events, renderedTimedEventCount }) => {
      const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
      const { operations } = installCalendarOperations({
        listPrimaryCalendarEvents: vi.fn(async () => ({
          ok: true as const,
          value: {
            events,
            timeZone: "America/Los_Angeles",
            stats: {
              pageCount: 2,
              rawEventCount: 3,
              calendarHttpAndJsonDurationMs: 4,
              normalizationDurationMs: 5,
            },
          },
        })),
      });

      await operations.listCurrentDayEvents();

      expect(log).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith("calendar-plan-load", {
        ok: true,
        renderedTimedEventCount,
        pageCount: 2,
        rawEventCount: 3,
        calendarHttpAndJsonDurationMs: 4,
        normalizationDurationMs: 5,
        cachedAuthDurationMs: expect.any(Number),
        backgroundTotalDurationMs: expect.any(Number),
      });
      const summary = log.mock.calls[0]?.[1] as Record<string, unknown>;
      for (const durationName of [
        "calendarHttpAndJsonDurationMs",
        "normalizationDurationMs",
        "cachedAuthDurationMs",
        "backgroundTotalDurationMs",
      ]) {
        const duration = summary[durationName];
        expect(typeof duration).toBe("number");
        expect(Number.isFinite(duration)).toBe(true);
        expect(duration).toBeGreaterThanOrEqual(0);
      }
      const serializedLog = JSON.stringify(log.mock.calls);
      expect(serializedLog).not.toContain("token-123");
      expect(serializedLog).not.toContain("private-event-id");
      expect(serializedLog).not.toContain("Private meeting");
      log.mockRestore();
    },
  );

  it("forwards a Calendar API failure", async () => {
    const calendarFailure = {
      ok: false as const,
      error: { code: "CALENDAR_LIST_FAILED", message: "Calendar failed." },
    };
    const { operations } = installCalendarOperations({
      listPrimaryCalendarEvents: vi.fn(async () => calendarFailure),
    });

    await expect(operations.listCurrentDayEvents()).resolves.toEqual(
      calendarFailure,
    );
  });

  it("does not call Calendar when no cached token is available", async () => {
    const { dependencies, operations } = installCalendarOperations({
      requestCachedToken: vi.fn(async () => ({
        ok: false as const,
        error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "No cached token." },
      })),
    });

    await expect(operations.listCurrentDayEvents()).resolves.toEqual({
      ok: false,
      error: {
        code: "AUTH_NOT_CONNECTED",
        message: "Connect Calendar before requesting events.",
      },
    });
    expect(dependencies.listPrimaryCalendarEvents).not.toHaveBeenCalled();
  });

  it("inserts a Calendar event through cached auth", async () => {
    const { dependencies, operations } = installCalendarOperations();

    await expect(operations.insertEvent(insertEvent)).resolves.toEqual({
      ok: true,
      value: { eventId: "calendar-actual-id" },
    });
    expect(dependencies.insertPrimaryCalendarEvent).toHaveBeenCalledWith(
      "token-123",
      insertEvent,
    );
  });

  it("does not insert a Calendar event without cached auth", async () => {
    const { dependencies, operations } = installCalendarOperations({
      requestCachedToken: vi.fn(async () => ({
        ok: false as const,
        error: { code: "AUTH_TOKEN_UNAVAILABLE", message: "missing" },
      })),
    });

    await expect(operations.insertEvent(insertEvent)).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTH_NOT_CONNECTED" },
    });
    expect(dependencies.insertPrimaryCalendarEvent).not.toHaveBeenCalled();
  });
});
